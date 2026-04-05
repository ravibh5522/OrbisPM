package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type orgMemberRepo struct {
	pool *pgxpool.Pool
}

func NewOrgMemberRepo(pool *pgxpool.Pool) OrgMemberRepository {
	return &orgMemberRepo{pool: pool}
}

func (r *orgMemberRepo) Add(ctx context.Context, tx pgx.Tx, m *domain.OrgMember) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		m.OrgID, m.UserID, m.Role)
	if err != nil {
		return fmt.Errorf("add org member: %w", err)
	}
	return nil
}

func (r *orgMemberRepo) Remove(ctx context.Context, tx pgx.Tx, orgID, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM org_members WHERE org_id = $1 AND user_id = $2`, orgID, userID)
	return err
}

func (r *orgMemberRepo) Get(ctx context.Context, orgID, userID uuid.UUID) (*domain.OrgMember, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT m.org_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.display_name, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), m.role, m.joined_at
		 FROM org_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 WHERE m.org_id = $1 AND m.user_id = $2`,
		orgID, userID)
	var m domain.OrgMember
	if err := row.Scan(&m.OrgID, &m.UserID, &m.Email, &m.DisplayName, &m.Phone, &m.AvatarURL, &m.Role, &m.JoinedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

func (r *orgMemberRepo) ListByOrg(ctx context.Context, orgID uuid.UUID, filter MemberFilter) ([]*domain.OrgMember, int, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	args := []any{orgID}
	where := ""

	if filter.Search != nil && *filter.Search != "" {
		args = append(args, "%"+strings.ToLower(*filter.Search)+"%")
		where += fmt.Sprintf(" AND (LOWER(u.display_name) LIKE $%d OR LOWER(u.email) LIKE $%d)", len(args), len(args))
	}
	if filter.Role != nil && *filter.Role != "" {
		args = append(args, *filter.Role)
		where += fmt.Sprintf(" AND m.role = $%d", len(args))
	}

	var total int
	countSQL := `SELECT COUNT(*) FROM org_members m LEFT JOIN users u ON u.id = m.user_id WHERE m.org_id = $1` + where
	if err := r.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count org members: %w", err)
	}

	sortCol := "m.joined_at"
	allowed := map[string]bool{"display_name": true, "email": true, "role": true, "joined_at": true}
	if allowed[filter.SortBy] {
		prefix := "m."
		if filter.SortBy == "display_name" || filter.SortBy == "email" {
			prefix = "u."
		}
		sortCol = prefix + filter.SortBy
	}
	sortDir := "ASC"
	if strings.EqualFold(filter.SortOrder, "desc") {
		sortDir = "DESC"
	}

	args = append(args, limit, offset)
	querySQL := fmt.Sprintf(
		`SELECT m.org_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.display_name, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), m.role, m.joined_at
		 FROM org_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 WHERE m.org_id = $1%s
		 ORDER BY %s %s
		 LIMIT $%d OFFSET $%d`,
		where, sortCol, sortDir, len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, querySQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var members []*domain.OrgMember
	for rows.Next() {
		var m domain.OrgMember
		if err := rows.Scan(&m.OrgID, &m.UserID, &m.Email, &m.DisplayName, &m.Phone, &m.AvatarURL, &m.Role, &m.JoinedAt); err != nil {
			return nil, 0, err
		}
		members = append(members, &m)
	}
	return members, total, rows.Err()
}

// FindUserByEmail looks up a user in public.users by email and returns their ID.
func (r *orgMemberRepo) FindUserByEmail(ctx context.Context, email string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx,
		`SELECT id FROM users WHERE email = $1 LIMIT 1`, email).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return uuid.Nil, domain.ErrNotFound
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (r *orgMemberRepo) UpdateRole(ctx context.Context, tx pgx.Tx, orgID, userID uuid.UUID, role string) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3`, role, orgID, userID)
	return err
}
