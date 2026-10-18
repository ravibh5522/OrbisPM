package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

// DriveAccessFilter describes the spaces a user can read; items outside them
// are visible only through a matching share (on the item or an ancestor).
type DriveAccessFilter struct {
	UserID      uuid.UUID
	OrgReadable bool
	TeamIDs     []uuid.UUID
	ProjectIDs  []uuid.UUID
}

type driveRepo struct {
	pool *pgxpool.Pool
}

func NewDriveRepo(pool *pgxpool.Pool) DriveRepository {
	return &driveRepo{pool: pool}
}

// Space key expressions, written exactly as in ux_drive_items_name so folder
// listings and name lookups can use that index.
const (
	driveScopeIDExpr  = `COALESCE(i.team_id, i.project_id, i.owner_user_id, i.org_id)`
	driveParentIDExpr = `COALESCE(i.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)`
)

const driveItemCols = `i.id, i.org_id, i.scope_type, ` + driveScopeIDExpr + `,
	i.parent_id, i.ancestor_ids, i.kind, i.name, i.mime_type, i.size_bytes, i.storage_key, i.sha256,
	i.created_by, i.created_at, i.updated_at, i.trashed_at,
	u.id, u.display_name, NULLIF(u.avatar_url, ''),
	EXISTS (SELECT 1 FROM drive_shares ds WHERE ds.item_id = i.id AND (ds.expires_at IS NULL OR ds.expires_at > now()))`

const driveItemFrom = ` FROM drive_items i LEFT JOIN users u ON u.id = i.created_by`

const driveSpaceJoins = ` LEFT JOIN teams st ON st.id = i.team_id
	LEFT JOIN projects sp ON sp.id = i.project_id
	LEFT JOIN users so ON so.id = i.owner_user_id`

// driveSpaceNameCol renders the space label; userArg is the caller's
// placeholder so their own personal space reads "My files".
func driveSpaceNameCol(userArg int) string {
	return fmt.Sprintf(`, CASE i.scope_type
		WHEN 'org' THEN 'Organization'
		WHEN 'team' THEN st.name
		WHEN 'project' THEN sp.name
		ELSE CASE WHEN i.owner_user_id = $%d THEN 'My files'
			ELSE COALESCE(NULLIF(so.display_name, ''), 'Personal') || '''s files' END
	END`, userArg)
}

// driveShareMatch matches live shares on alias whose grantee covers the user:
// directly, via a team they belong to, a project they are effectively in, or
// the whole org. Membership is joined live, so leaving a team revokes access.
func driveShareMatch(alias string, orgArg, userArg int) string {
	return fmt.Sprintf(`(%[1]s.expires_at IS NULL OR %[1]s.expires_at > now()) AND (
		(%[1]s.grantee_type = 'user' AND %[1]s.grantee_id = $%[3]d)
		OR (%[1]s.grantee_type = 'org' AND %[1]s.grantee_id = $%[2]d)
		OR (%[1]s.grantee_type = 'team' AND %[1]s.grantee_id IN (
			SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id = tm.team_id
			WHERE tm.user_id = $%[3]d AND t.org_id = $%[2]d))
		OR (%[1]s.grantee_type = 'project' AND %[1]s.grantee_id IN (
			SELECT pm.project_id FROM project_members pm JOIN projects p ON p.id = pm.project_id
			WHERE pm.user_id = $%[3]d AND p.org_id = $%[2]d
			UNION
			SELECT pt.project_id FROM project_teams pt
			JOIN team_members tm ON tm.team_id = pt.team_id
			JOIN projects p ON p.id = pt.project_id
			WHERE tm.user_id = $%[3]d AND p.org_id = $%[2]d)))`, alias, orgArg, userArg)
}

// driveAccessCond restricts items to the filter's spaces or a matching share.
// Expects $1 = org, $2 = user, and the three filter values at firstArg.
func driveAccessCond(firstArg int) string {
	return fmt.Sprintf(`(
		(i.scope_type = 'user' AND i.owner_user_id = $2)
		OR (i.scope_type = 'org' AND $%d::bool)
		OR (i.scope_type = 'team' AND i.team_id = ANY($%d::uuid[]))
		OR (i.scope_type = 'project' AND i.project_id = ANY($%d::uuid[]))
		OR EXISTS (SELECT 1 FROM drive_shares s
			WHERE s.org_id = i.org_id AND (s.item_id = i.id OR s.item_id = ANY(i.ancestor_ids))
			AND %s))`, firstArg, firstArg+1, firstArg+2, driveShareMatch("s", 1, 2))
}

func scanDriveItem(row pgx.Row, withSpace bool) (*domain.DriveItem, error) {
	var it domain.DriveItem
	var scope string
	var creatorID *uuid.UUID
	var creatorName *string
	var creatorAvatar *string
	dest := []any{&it.ID, &it.OrgID, &scope, &it.ScopeID,
		&it.ParentID, &it.AncestorIDs, &it.Kind, &it.Name, &it.MimeType, &it.SizeBytes, &it.StorageKey, &it.SHA256,
		&it.CreatedBy, &it.CreatedAt, &it.UpdatedAt, &it.TrashedAt,
		&creatorID, &creatorName, &creatorAvatar, &it.Shared}
	if withSpace {
		dest = append(dest, &it.SpaceName)
	}
	if err := row.Scan(dest...); err != nil {
		return nil, err
	}
	it.Scope = domain.DriveScope(scope)
	if creatorID != nil {
		it.Creator = &domain.DriveUserRef{ID: *creatorID, AvatarURL: creatorAvatar}
		if creatorName != nil {
			it.Creator.DisplayName = *creatorName
		}
	}
	return &it, nil
}

func collectDriveItems(rows pgx.Rows, withSpace bool) ([]*domain.DriveItem, error) {
	defer rows.Close()
	items := []*domain.DriveItem{}
	for rows.Next() {
		it, err := scanDriveItem(rows, withSpace)
		if err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (r *driveRepo) GetItem(ctx context.Context, orgID, id uuid.UUID) (*domain.DriveItem, error) {
	it, err := scanDriveItem(r.pool.QueryRow(ctx,
		`SELECT `+driveItemCols+driveItemFrom+` WHERE i.org_id = $1 AND i.id = $2`, orgID, id), false)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get drive item: %w", err)
	}
	return it, nil
}

func (r *driveRepo) ListChildren(ctx context.Context, orgID uuid.UUID, scope domain.DriveScope, scopeID uuid.UUID, parentID *uuid.UUID, limit, offset int) ([]*domain.DriveItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+driveItemCols+driveItemFrom+`
		 WHERE i.org_id = $1 AND i.scope_type = $2 AND `+driveScopeIDExpr+` = $3
		   AND `+driveParentIDExpr+` = $4 AND i.trashed_at IS NULL
		 ORDER BY (i.kind = 'folder') DESC, lower(i.name), i.id
		 LIMIT $5 OFFSET $6`,
		orgID, string(scope), scopeID, parentKey(parentID), limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list drive children: %w", err)
	}
	return collectDriveItems(rows, false)
}

func (r *driveRepo) ItemNames(ctx context.Context, orgID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name FROM drive_items WHERE org_id = $1 AND id = ANY($2)`, orgID, ids)
	if err != nil {
		return nil, fmt.Errorf("drive item names: %w", err)
	}
	defer rows.Close()
	names := make(map[uuid.UUID]string, len(ids))
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		names[id] = name
	}
	return names, rows.Err()
}

func (r *driveRepo) LiveNamesWithPrefix(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, scope domain.DriveScope, scopeID uuid.UUID, parentID *uuid.UUID, prefix string) ([]string, error) {
	rows, err := conn(r.pool, tx).Query(ctx,
		`SELECT lower(i.name) FROM drive_items i
		 WHERE i.org_id = $1 AND i.scope_type = $2 AND `+driveScopeIDExpr+` = $3
		   AND `+driveParentIDExpr+` = $4 AND i.trashed_at IS NULL
		   AND lower(i.name) LIKE lower($5) || '%' ESCAPE '\'`,
		orgID, string(scope), scopeID, parentKey(parentID), EscapeLike(prefix))
	if err != nil {
		return nil, fmt.Errorf("drive names with prefix: %w", err)
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		names = append(names, n)
	}
	return names, rows.Err()
}

func (r *driveRepo) CreateItem(ctx context.Context, tx pgx.Tx, it *domain.DriveItem) error {
	teamID, projectID, ownerID := driveScopeColumns(it.Scope, it.ScopeID)
	ancestors := it.AncestorIDs
	if ancestors == nil {
		ancestors = []uuid.UUID{}
	}
	_, err := conn(r.pool, tx).Exec(ctx,
		`INSERT INTO drive_items (id, org_id, scope_type, team_id, project_id, owner_user_id, parent_id, ancestor_ids,
		                          kind, name, mime_type, size_bytes, storage_key, sha256, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
		it.ID, it.OrgID, string(it.Scope), teamID, projectID, ownerID, it.ParentID, ancestors,
		it.Kind, it.Name, it.MimeType, it.SizeBytes, it.StorageKey, it.SHA256, it.CreatedBy)
	if isPgUniqueViolation(err) {
		return fmt.Errorf("create drive item: %w", domain.ErrConflict)
	}
	if err != nil {
		return fmt.Errorf("create drive item: %w", err)
	}
	return nil
}

func (r *driveRepo) RenameItem(ctx context.Context, tx pgx.Tx, orgID, id uuid.UUID, name string) error {
	_, err := conn(r.pool, tx).Exec(ctx,
		`UPDATE drive_items SET name = $3, updated_at = now()
		 WHERE org_id = $1 AND id = $2 AND trashed_at IS NULL`, orgID, id, name)
	if isPgUniqueViolation(err) {
		return fmt.Errorf("rename drive item: %w", domain.ErrConflict)
	}
	if err != nil {
		return fmt.Errorf("rename drive item: %w", err)
	}
	return nil
}

func (r *driveRepo) SubtreeStats(ctx context.Context, orgID, id uuid.UUID) (int, int, error) {
	var count, maxDepth int
	err := r.pool.QueryRow(ctx,
		`SELECT count(*), COALESCE(max(cardinality(ancestor_ids)), 0)
		 FROM drive_items WHERE org_id = $1 AND $2 = ANY(ancestor_ids)`, orgID, id).Scan(&count, &maxDepth)
	if err != nil {
		return 0, 0, fmt.Errorf("drive subtree stats: %w", err)
	}
	return count, maxDepth, nil
}

func (r *driveRepo) MoveItem(ctx context.Context, tx pgx.Tx, it *domain.DriveItem, parentID *uuid.UUID, ancestors []uuid.UUID) error {
	q := conn(r.pool, tx)
	if ancestors == nil {
		ancestors = []uuid.UUID{}
	}
	_, err := q.Exec(ctx,
		`UPDATE drive_items SET parent_id = $3, ancestor_ids = $4, updated_at = now()
		 WHERE org_id = $1 AND id = $2`, it.OrgID, it.ID, parentID, ancestors)
	if isPgUniqueViolation(err) {
		return fmt.Errorf("move drive item: %w", domain.ErrConflict)
	}
	if err != nil {
		return fmt.Errorf("move drive item: %w", err)
	}
	// Descendants keep their path below the item: old prefix (item's old
	// ancestors) is swapped for the new one; element L+1 onward starts at the item.
	_, err = q.Exec(ctx,
		`UPDATE drive_items SET ancestor_ids = $3::uuid[] || ancestor_ids[$4:]
		 WHERE org_id = $1 AND $2 = ANY(ancestor_ids)`,
		it.OrgID, it.ID, ancestors, len(it.AncestorIDs)+1)
	if err != nil {
		return fmt.Errorf("rewrite drive subtree ancestors: %w", err)
	}
	return nil
}

func (r *driveRepo) TrashSubtree(ctx context.Context, tx pgx.Tx, orgID, id, userID uuid.UUID) error {
	_, err := conn(r.pool, tx).Exec(ctx,
		`UPDATE drive_items SET trashed_at = now(), trashed_by = $3
		 WHERE org_id = $1 AND (id = $2 OR $2 = ANY(ancestor_ids)) AND trashed_at IS NULL`, orgID, id, userID)
	if err != nil {
		return fmt.Errorf("trash drive subtree: %w", err)
	}
	return nil
}

func (r *driveRepo) RestoreSubtree(ctx context.Context, tx pgx.Tx, orgID, id uuid.UUID, trashedAt time.Time, name string) error {
	// Only rows trashed in the same statement as the item come back; children
	// trashed separately earlier stay in the trash.
	_, err := conn(r.pool, tx).Exec(ctx,
		`UPDATE drive_items SET trashed_at = NULL, trashed_by = NULL,
		        name = CASE WHEN id = $2 THEN $4 ELSE name END,
		        updated_at = CASE WHEN id = $2 THEN now() ELSE updated_at END
		 WHERE org_id = $1 AND (id = $2 OR $2 = ANY(ancestor_ids)) AND trashed_at = $3`,
		orgID, id, trashedAt, name)
	if isPgUniqueViolation(err) {
		return fmt.Errorf("restore drive subtree: %w", domain.ErrConflict)
	}
	if err != nil {
		return fmt.Errorf("restore drive subtree: %w", err)
	}
	return nil
}

// driveLimitExpr reads billing_plans.limits.storage_gb; a missing limit means unlimited.
const driveLimitExpr = `COALESCE((bp.limits->>'storage_gb')::numeric, -1)`

// storageLimitBytes converts a GB limit to bytes (-1 = unlimited).
func storageLimitBytes(gb float64) int64 {
	if gb < 0 {
		return -1
	}
	return int64(gb * (1 << 30))
}

func (r *driveRepo) ReserveQuota(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, size int64) error {
	q := conn(r.pool, tx)
	if _, err := q.Exec(ctx, `INSERT INTO drive_usage (org_id) VALUES ($1) ON CONFLICT DO NOTHING`, orgID); err != nil {
		return fmt.Errorf("init drive usage: %w", err)
	}
	var used int64
	var gb float64
	// FOR UPDATE serialises concurrent uploads of one org so they cannot overshoot.
	err := q.QueryRow(ctx,
		`SELECT du.bytes_used, `+driveLimitExpr+`
		 FROM drive_usage du JOIN orgs o ON o.id = du.org_id
		 LEFT JOIN billing_plans bp ON bp.id = o.plan
		 WHERE du.org_id = $1 FOR UPDATE OF du`, orgID).Scan(&used, &gb)
	if err != nil {
		return fmt.Errorf("lock drive usage: %w", err)
	}
	if limit := storageLimitBytes(gb); limit >= 0 && used+size > limit {
		return domain.ErrPlanLimitHit.WithDetail("storage quota exceeded")
	}
	if _, err := q.Exec(ctx, `UPDATE drive_usage SET bytes_used = bytes_used + $2 WHERE org_id = $1`, orgID, size); err != nil {
		return fmt.Errorf("update drive usage: %w", err)
	}
	return nil
}

func (r *driveRepo) Usage(ctx context.Context, orgID uuid.UUID) (int64, int64, error) {
	var used int64
	var gb float64
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(du.bytes_used, 0), `+driveLimitExpr+`
		 FROM orgs o
		 LEFT JOIN drive_usage du ON du.org_id = o.id
		 LEFT JOIN billing_plans bp ON bp.id = o.plan
		 WHERE o.id = $1`, orgID).Scan(&used, &gb)
	if err != nil {
		return 0, 0, fmt.Errorf("drive usage: %w", err)
	}
	return used, storageLimitBytes(gb), nil
}

func (r *driveRepo) ListSharedWithMe(ctx context.Context, orgID, userID uuid.UUID, limit, offset int) ([]*domain.DriveItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+driveItemCols+driveSpaceNameCol(2)+`
		 FROM (SELECT s.item_id, max(s.created_at) AS shared_at
		       FROM drive_shares s WHERE s.org_id = $1 AND `+driveShareMatch("s", 1, 2)+`
		       GROUP BY s.item_id) sh
		 JOIN drive_items i ON i.id = sh.item_id AND i.org_id = $1
		 LEFT JOIN users u ON u.id = i.created_by`+driveSpaceJoins+`
		 WHERE i.trashed_at IS NULL AND i.created_by <> $2
		   AND NOT (i.scope_type = 'user' AND i.owner_user_id = $2)
		 ORDER BY sh.shared_at DESC, i.id
		 LIMIT $3 OFFSET $4`, orgID, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list shared with me: %w", err)
	}
	return collectDriveItems(rows, true)
}

func (r *driveRepo) ListRecent(ctx context.Context, orgID uuid.UUID, f DriveAccessFilter, limit int) ([]*domain.DriveItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+driveItemCols+driveSpaceNameCol(2)+driveItemFrom+driveSpaceJoins+`
		 WHERE i.org_id = $1 AND i.created_by = $2 AND i.kind = 'file' AND i.trashed_at IS NULL
		   AND `+driveAccessCond(3)+`
		 ORDER BY i.updated_at DESC, i.id
		 LIMIT $6`, orgID, f.UserID, f.OrgReadable, f.TeamIDs, f.ProjectIDs, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent drive items: %w", err)
	}
	return collectDriveItems(rows, true)
}

func (r *driveRepo) Search(ctx context.Context, orgID uuid.UUID, f DriveAccessFilter, query string, scope *domain.DriveScope, scopeID *uuid.UUID, limit int) ([]*domain.DriveItem, error) {
	var scopeStr *string
	if scope != nil {
		s := string(*scope)
		scopeStr = &s
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+driveItemCols+driveSpaceNameCol(2)+driveItemFrom+driveSpaceJoins+`
		 WHERE i.org_id = $1 AND i.trashed_at IS NULL
		   AND lower(i.name) LIKE '%' || lower($6) || '%' ESCAPE '\'
		   AND ($7::text IS NULL OR i.scope_type = $7)
		   AND ($8::uuid IS NULL OR `+driveScopeIDExpr+` = $8)
		   AND `+driveAccessCond(3)+`
		 ORDER BY (i.kind = 'folder') DESC, lower(i.name), i.id
		 LIMIT $9`, orgID, f.UserID, f.OrgReadable, f.TeamIDs, f.ProjectIDs, EscapeLike(query), scopeStr, scopeID, limit)
	if err != nil {
		return nil, fmt.Errorf("search drive items: %w", err)
	}
	return collectDriveItems(rows, true)
}

func (r *driveRepo) ListTrash(ctx context.Context, orgID uuid.UUID, f DriveAccessFilter, limit int) ([]*domain.DriveItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+driveItemCols+driveSpaceNameCol(2)+driveItemFrom+driveSpaceJoins+`
		 WHERE i.org_id = $1 AND i.trashed_at IS NOT NULL
		   AND NOT EXISTS (SELECT 1 FROM drive_items pi
		                   WHERE pi.id = i.parent_id AND pi.trashed_at IS NOT NULL)
		   AND `+driveAccessCond(3)+`
		 ORDER BY i.trashed_at DESC, i.id
		 LIMIT $6`, orgID, f.UserID, f.OrgReadable, f.TeamIDs, f.ProjectIDs, limit)
	if err != nil {
		return nil, fmt.Errorf("list drive trash: %w", err)
	}
	return collectDriveItems(rows, true)
}

// --- Shares ---

func (r *driveRepo) ShareRoles(ctx context.Context, orgID, userID uuid.UUID, itemIDs []uuid.UUID) (map[uuid.UUID]domain.DriveRole, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT i.id, max(CASE s.role WHEN 'manager' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END)
		 FROM drive_items i
		 JOIN drive_shares s ON s.org_id = i.org_id AND (s.item_id = i.id OR s.item_id = ANY(i.ancestor_ids))
		 WHERE i.org_id = $1 AND i.id = ANY($3) AND `+driveShareMatch("s", 1, 2)+`
		 GROUP BY i.id`, orgID, userID, itemIDs)
	if err != nil {
		return nil, fmt.Errorf("drive share roles: %w", err)
	}
	defer rows.Close()
	roles := make(map[uuid.UUID]domain.DriveRole, len(itemIDs))
	byRank := [...]domain.DriveRole{domain.DriveRoleNone, domain.DriveRoleViewer, domain.DriveRoleEditor, domain.DriveRoleManager}
	for rows.Next() {
		var id uuid.UUID
		var rank int
		if err := rows.Scan(&id, &rank); err != nil {
			return nil, err
		}
		roles[id] = byRank[rank]
	}
	return roles, rows.Err()
}

func (r *driveRepo) SharedItemIDs(ctx context.Context, orgID, userID uuid.UUID, itemIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT s.item_id FROM drive_shares s
		 WHERE s.org_id = $1 AND s.item_id = ANY($3) AND `+driveShareMatch("s", 1, 2),
		orgID, userID, itemIDs)
	if err != nil {
		return nil, fmt.Errorf("drive shared item ids: %w", err)
	}
	defer rows.Close()
	out := map[uuid.UUID]bool{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

const driveShareSelect = `SELECT s.id, s.org_id, s.item_id, s.grantee_type, s.grantee_id,
	COALESCE(CASE s.grantee_type
		WHEN 'user' THEN COALESCE(NULLIF(gu.display_name, ''), NULLIF(gu.email, ''))
		WHEN 'team' THEN gt.name
		WHEN 'project' THEN gp.name
		WHEN 'org' THEN gorg.name
	END, 'Unknown'),
	CASE s.grantee_type WHEN 'user' THEN NULLIF(gu.avatar_url, '') WHEN 'org' THEN NULLIF(gorg.logo_url, '') END,
	s.role, s.created_by, s.created_at, s.expires_at, src.name
	FROM drive_shares s
	JOIN drive_items src ON src.id = s.item_id AND src.org_id = s.org_id
	LEFT JOIN users gu ON s.grantee_type = 'user' AND gu.id = s.grantee_id
	LEFT JOIN teams gt ON s.grantee_type = 'team' AND gt.id = s.grantee_id AND gt.org_id = s.org_id
	LEFT JOIN projects gp ON s.grantee_type = 'project' AND gp.id = s.grantee_id AND gp.org_id = s.org_id
	LEFT JOIN orgs gorg ON s.grantee_type = 'org' AND gorg.id = s.grantee_id`

func scanDriveShare(row pgx.Row) (*domain.DriveShare, error) {
	var sh domain.DriveShare
	var role string
	if err := row.Scan(&sh.ID, &sh.OrgID, &sh.ItemID, &sh.GranteeType, &sh.GranteeID, &sh.GranteeName,
		&sh.GranteeAvatarURL, &role, &sh.CreatedBy, &sh.CreatedAt, &sh.ExpiresAt, &sh.SourceItemName); err != nil {
		return nil, err
	}
	sh.Role = domain.DriveRole(role)
	sh.SourceItemID = sh.ItemID
	return &sh, nil
}

func (r *driveRepo) ListShares(ctx context.Context, orgID uuid.UUID, itemIDs []uuid.UUID, includeExpired bool) ([]*domain.DriveShare, error) {
	rows, err := r.pool.Query(ctx, driveShareSelect+`
		WHERE s.org_id = $1 AND s.item_id = ANY($2)
		  AND ($3 OR s.expires_at IS NULL OR s.expires_at > now())
		ORDER BY cardinality(src.ancestor_ids), s.created_at, s.id`, orgID, itemIDs, includeExpired)
	if err != nil {
		return nil, fmt.Errorf("list drive shares: %w", err)
	}
	defer rows.Close()
	shares := []*domain.DriveShare{}
	for rows.Next() {
		sh, err := scanDriveShare(rows)
		if err != nil {
			return nil, err
		}
		shares = append(shares, sh)
	}
	return shares, rows.Err()
}

func (r *driveRepo) GetShare(ctx context.Context, orgID, id uuid.UUID) (*domain.DriveShare, error) {
	sh, err := scanDriveShare(r.pool.QueryRow(ctx, driveShareSelect+` WHERE s.org_id = $1 AND s.id = $2`, orgID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get drive share: %w", err)
	}
	return sh, nil
}

func (r *driveRepo) UpsertShare(ctx context.Context, tx pgx.Tx, sh *domain.DriveShare) (uuid.UUID, error) {
	var id uuid.UUID
	err := conn(r.pool, tx).QueryRow(ctx,
		`INSERT INTO drive_shares (org_id, item_id, grantee_type, grantee_id, role, created_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (item_id, grantee_type, grantee_id)
		 DO UPDATE SET role = EXCLUDED.role, expires_at = EXCLUDED.expires_at
		 RETURNING id`,
		sh.OrgID, sh.ItemID, sh.GranteeType, sh.GranteeID, string(sh.Role), sh.CreatedBy, sh.ExpiresAt).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("upsert drive share: %w", err)
	}
	return id, nil
}

func (r *driveRepo) UpdateShareRole(ctx context.Context, tx pgx.Tx, orgID, id uuid.UUID, role domain.DriveRole) error {
	_, err := conn(r.pool, tx).Exec(ctx,
		`UPDATE drive_shares SET role = $3 WHERE org_id = $1 AND id = $2`, orgID, id, string(role))
	if err != nil {
		return fmt.Errorf("update drive share: %w", err)
	}
	return nil
}

func (r *driveRepo) DeleteShare(ctx context.Context, tx pgx.Tx, orgID, id uuid.UUID) error {
	_, err := conn(r.pool, tx).Exec(ctx, `DELETE FROM drive_shares WHERE org_id = $1 AND id = $2`, orgID, id)
	if err != nil {
		return fmt.Errorf("delete drive share: %w", err)
	}
	return nil
}

func (r *driveRepo) GranteeExists(ctx context.Context, orgID uuid.UUID, granteeType string, granteeID uuid.UUID) (bool, error) {
	var q string
	switch granteeType {
	case domain.DriveGranteeUser:
		q = `SELECT EXISTS (SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2)`
	case domain.DriveGranteeTeam:
		q = `SELECT EXISTS (SELECT 1 FROM teams WHERE org_id = $1 AND id = $2)`
	case domain.DriveGranteeProject:
		q = `SELECT EXISTS (SELECT 1 FROM projects WHERE org_id = $1 AND id = $2)`
	case domain.DriveGranteeOrg:
		return granteeID == orgID, nil
	default:
		return false, nil
	}
	var ok bool
	if err := r.pool.QueryRow(ctx, q, orgID, granteeID).Scan(&ok); err != nil {
		return false, fmt.Errorf("check drive grantee: %w", err)
	}
	return ok, nil
}

// --- Spaces & audience ---

func (r *driveRepo) SpaceName(ctx context.Context, orgID uuid.UUID, scope domain.DriveScope, scopeID uuid.UUID) (string, error) {
	var q string
	switch scope {
	case domain.DriveScopeOrg:
		if scopeID != orgID {
			return "", domain.ErrNotFound
		}
		return "Organization", nil
	case domain.DriveScopeTeam:
		q = `SELECT name FROM teams WHERE org_id = $1 AND id = $2`
	case domain.DriveScopeProject:
		q = `SELECT name FROM projects WHERE org_id = $1 AND id = $2`
	case domain.DriveScopeUser:
		q = `SELECT COALESCE(NULLIF(u.display_name, ''), 'Personal') || '''s files'
		     FROM org_members om LEFT JOIN users u ON u.id = om.user_id
		     WHERE om.org_id = $1 AND om.user_id = $2`
	default:
		return "", domain.ErrNotFound
	}
	var name string
	err := r.pool.QueryRow(ctx, q, orgID, scopeID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("drive space name: %w", err)
	}
	return name, nil
}

func (r *driveRepo) ListSpaceCandidates(ctx context.Context, orgID, userID uuid.UUID, all bool) ([]domain.DriveSpace, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT kind, id, name FROM (
		 SELECT 'team' AS kind, t.id, t.name FROM teams t
		 WHERE t.org_id = $1 AND ($3 OR EXISTS (
		     SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $2))
		 UNION ALL
		 SELECT 'project', p.id, p.name FROM projects p
		 WHERE p.org_id = $1 AND ($3
		     OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2)
		     OR EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.team_id
		                WHERE pt.project_id = p.id AND tm.user_id = $2))
		 ) x ORDER BY kind DESC, lower(name), id`, orgID, userID, all)
	if err != nil {
		return nil, fmt.Errorf("list drive space candidates: %w", err)
	}
	defer rows.Close()
	var spaces []domain.DriveSpace
	for rows.Next() {
		var sp domain.DriveSpace
		var scope string
		if err := rows.Scan(&scope, &sp.ScopeID, &sp.Name); err != nil {
			return nil, err
		}
		sp.Scope = domain.DriveScope(scope)
		spaces = append(spaces, sp)
	}
	return spaces, rows.Err()
}

func (r *driveRepo) TeamMemberIDs(ctx context.Context, orgID, teamID uuid.UUID, limit int) ([]uuid.UUID, error) {
	return r.userIDs(ctx,
		`SELECT tm.user_id FROM team_members tm JOIN teams t ON t.id = tm.team_id
		 WHERE t.org_id = $1 AND tm.team_id = $2 LIMIT $3`, orgID, teamID, limit)
}

// driveGranteeUsers expands share rows (selected by filter) into user ids.
// filter is a fixed SQL condition on s using $2; never user input.
func driveGranteeUsers(filter string) string {
	return `SELECT DISTINCT uid FROM (
		SELECT s.grantee_id AS uid FROM drive_shares s
		 WHERE s.org_id = $1 AND ` + filter + ` AND s.grantee_type = 'user' AND s.grantee_type = ANY($3)
		UNION
		SELECT tm.user_id FROM drive_shares s
		 JOIN teams t ON t.id = s.grantee_id AND t.org_id = s.org_id
		 JOIN team_members tm ON tm.team_id = t.id
		 WHERE s.org_id = $1 AND ` + filter + ` AND s.grantee_type = 'team' AND s.grantee_type = ANY($3)
		UNION
		SELECT pm.user_id FROM drive_shares s
		 JOIN projects p ON p.id = s.grantee_id AND p.org_id = s.org_id
		 JOIN project_members pm ON pm.project_id = p.id
		 WHERE s.org_id = $1 AND ` + filter + ` AND s.grantee_type = 'project' AND s.grantee_type = ANY($3)
		UNION
		SELECT om.user_id FROM drive_shares s
		 JOIN org_members om ON om.org_id = s.org_id
		 WHERE s.org_id = $1 AND ` + filter + ` AND s.grantee_type = 'org' AND s.grantee_id = s.org_id
		   AND s.grantee_type = ANY($3)
	) x LIMIT $4`
}

var allDriveGranteeTypes = []string{domain.DriveGranteeUser, domain.DriveGranteeTeam, domain.DriveGranteeProject, domain.DriveGranteeOrg}

func (r *driveRepo) ItemGranteeUserIDs(ctx context.Context, orgID uuid.UUID, itemIDs []uuid.UUID, limit int) ([]uuid.UUID, error) {
	return r.userIDs(ctx,
		driveGranteeUsers(`s.item_id = ANY($2) AND (s.expires_at IS NULL OR s.expires_at > now())`),
		orgID, itemIDs, allDriveGranteeTypes, limit)
}

func (r *driveRepo) ShareGranteeUserIDs(ctx context.Context, orgID uuid.UUID, shareIDs []uuid.UUID, types []string, limit int) ([]uuid.UUID, error) {
	return r.userIDs(ctx, driveGranteeUsers(`s.id = ANY($2)`), orgID, shareIDs, types, limit)
}

func (r *driveRepo) userIDs(ctx context.Context, q string, args ...any) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("drive user ids: %w", err)
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *driveRepo) UserDisplayName(ctx context.Context, userID uuid.UUID) (string, error) {
	var name string
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(NULLIF(display_name, ''), NULLIF(email, ''), 'Someone') FROM users WHERE id = $1`, userID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "Someone", nil
	}
	if err != nil {
		return "", fmt.Errorf("drive user display name: %w", err)
	}
	return name, nil
}

// --- helpers ---

func driveScopeColumns(scope domain.DriveScope, scopeID uuid.UUID) (team, project, owner *uuid.UUID) {
	switch scope {
	case domain.DriveScopeTeam:
		team = &scopeID
	case domain.DriveScopeProject:
		project = &scopeID
	case domain.DriveScopeUser:
		owner = &scopeID
	}
	return team, project, owner
}

// parentKey maps a nil parent to the zero UUID used by the COALESCE expressions.
func parentKey(id *uuid.UUID) uuid.UUID {
	if id == nil {
		return uuid.Nil
	}
	return *id
}

// EscapeLike escapes LIKE wildcards so user input matches literally (ESCAPE '\').
func EscapeLike(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r == '\\' || r == '%' || r == '_' {
			out = append(out, '\\')
		}
		out = append(out, r)
	}
	return string(out)
}
