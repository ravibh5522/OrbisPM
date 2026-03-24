package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type teamRepo struct {
	pool *pgxpool.Pool
}

func NewTeamRepo(pool *pgxpool.Pool) TeamRepository {
	return &teamRepo{pool: pool}
}

func (r *teamRepo) Create(ctx context.Context, tx pgx.Tx, team *domain.Team) (*domain.Team, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO teams (org_id, name, description, manager_id)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, org_id, name, description, manager_id, is_auto_managed, auto_source, auto_source_id, created_at, updated_at`,
		team.OrgID, team.Name, nilStr(team.Description), nilUUID(team.ManagerID))
	return scanTeam(row)
}

func (r *teamRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Team, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT t.id, t.org_id, t.name, t.description, t.manager_id,
		        t.is_auto_managed, t.auto_source, t.auto_source_id,
		        t.created_at, t.updated_at,
		        COALESCE(u.display_name, '') AS manager_name,
		        (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id)::int AS member_count
		 FROM teams t
		 LEFT JOIN users u ON u.id = t.manager_id
		 WHERE t.id = $1`, id)
	t, err := scanTeamFull(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get team: %w", err)
	}
	return t, nil
}

func (r *teamRepo) Update(ctx context.Context, tx pgx.Tx, team *domain.Team) (*domain.Team, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE teams SET name=$1, description=$2, manager_id=$3, updated_at=now()
		 WHERE id=$4
		 RETURNING id, org_id, name, description, manager_id, is_auto_managed, auto_source, auto_source_id, created_at, updated_at`,
		team.Name, nilStr(team.Description), nilUUID(team.ManagerID), team.ID)
	return scanTeam(row)
}

func (r *teamRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM teams WHERE id = $1`, id)
	return err
}

func (r *teamRepo) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Team, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT t.id, t.org_id, t.name, t.description, t.manager_id,
		        t.is_auto_managed, t.auto_source, t.auto_source_id,
		        t.created_at, t.updated_at,
		        COALESCE(u.display_name, '') AS manager_name,
		        (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id)::int AS member_count
		 FROM teams t
		 LEFT JOIN users u ON u.id = t.manager_id
		 WHERE t.org_id = $1
		 ORDER BY t.name`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	defer rows.Close()

	var teams []*domain.Team
	for rows.Next() {
		t, err := scanTeamFullRow(rows)
		if err != nil {
			return nil, err
		}
		teams = append(teams, t)
	}
	return teams, rows.Err()
}

func (r *teamRepo) ListByOrgPaginated(ctx context.Context, orgID uuid.UUID, f TeamFilter) ([]*domain.Team, int, error) {
	where := []string{"t.org_id = $1"}
	args := []any{orgID}
	argIdx := 2

	if f.Search != nil && *f.Search != "" {
		where = append(where, fmt.Sprintf("(t.name ILIKE $%d OR t.description ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+*f.Search+"%")
		argIdx++
	}

	whereClause := strings.Join(where, " AND ")

	// Count
	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM teams t WHERE %s`, whereClause)
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count teams: %w", err)
	}

	// Sort
	orderClause := "t.name ASC"
	allowedSortCols := map[string]string{
		"name":         "t.name",
		"member_count": "member_count",
		"created_at":   "t.created_at",
	}
	if f.SortBy != "" {
		if col, ok := allowedSortCols[f.SortBy]; ok {
			dir := "ASC"
			if f.SortOrder == "desc" {
				dir = "DESC"
			}
			orderClause = fmt.Sprintf("%s %s", col, dir)
		}
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 20
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(
		`SELECT t.id, t.org_id, t.name, t.description, t.manager_id,
		        t.is_auto_managed, t.auto_source, t.auto_source_id,
		        t.created_at, t.updated_at,
		        COALESCE(u.display_name, '') AS manager_name,
		        (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id)::int AS member_count
		 FROM teams t
		 LEFT JOIN users u ON u.id = t.manager_id
		 WHERE %s
		 ORDER BY %s
		 LIMIT $%d OFFSET $%d`, whereClause, orderClause, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list teams paginated: %w", err)
	}
	defer rows.Close()

	var teams []*domain.Team
	for rows.Next() {
		t, err := scanTeamFullRow(rows)
		if err != nil {
			return nil, 0, err
		}
		teams = append(teams, t)
	}
	return teams, total, rows.Err()
}

func (r *teamRepo) SetManager(ctx context.Context, tx pgx.Tx, teamID uuid.UUID, managerID *uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`UPDATE teams SET manager_id = $1, updated_at = now() WHERE id = $2`,
		nilUUID(managerID), teamID)
	return err
}

func scanTeam(row pgx.Row) (*domain.Team, error) {
	var t domain.Team
	var desc, autoSource, autoSourceID *string
	err := row.Scan(&t.ID, &t.OrgID, &t.Name, &desc, &t.ManagerID,
		&t.IsAutoManaged, &autoSource, &autoSourceID,
		&t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		t.Description = *desc
	}
	if autoSource != nil {
		t.AutoSource = *autoSource
	}
	if autoSourceID != nil {
		t.AutoSourceID = *autoSourceID
	}
	return &t, nil
}

func scanTeamFull(row pgx.Row) (*domain.Team, error) {
	var t domain.Team
	var desc, autoSource, autoSourceID *string
	err := row.Scan(&t.ID, &t.OrgID, &t.Name, &desc, &t.ManagerID,
		&t.IsAutoManaged, &autoSource, &autoSourceID,
		&t.CreatedAt, &t.UpdatedAt,
		&t.ManagerName, &t.MemberCount)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		t.Description = *desc
	}
	if autoSource != nil {
		t.AutoSource = *autoSource
	}
	if autoSourceID != nil {
		t.AutoSourceID = *autoSourceID
	}
	return &t, nil
}

func scanTeamFullRow(rows pgx.Rows) (*domain.Team, error) {
	var t domain.Team
	var desc, autoSource, autoSourceID *string
	err := rows.Scan(&t.ID, &t.OrgID, &t.Name, &desc, &t.ManagerID,
		&t.IsAutoManaged, &autoSource, &autoSourceID,
		&t.CreatedAt, &t.UpdatedAt,
		&t.ManagerName, &t.MemberCount)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		t.Description = *desc
	}
	if autoSource != nil {
		t.AutoSource = *autoSource
	}
	if autoSourceID != nil {
		t.AutoSourceID = *autoSourceID
	}
	return &t, nil
}

// nilUUID returns nil if the UUID pointer is nil or zero value.
func nilUUID(id *uuid.UUID) *uuid.UUID {
	if id == nil || *id == uuid.Nil {
		return nil
	}
	return id
}
