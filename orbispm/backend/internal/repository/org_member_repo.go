package repository

import (
	"context"
	"fmt"

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
		`SELECT m.org_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.raw_user_meta_data->>'name', ''), m.role, m.joined_at
		 FROM org_members m
		 LEFT JOIN auth.users u ON u.id = m.user_id
		 WHERE m.org_id = $1 AND m.user_id = $2`,
		orgID, userID)
	var m domain.OrgMember
	if err := row.Scan(&m.OrgID, &m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

func (r *orgMemberRepo) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.OrgMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT m.org_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.raw_user_meta_data->>'name', ''), m.role, m.joined_at
		 FROM org_members m
		 LEFT JOIN auth.users u ON u.id = m.user_id
		 WHERE m.org_id = $1 ORDER BY m.joined_at`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*domain.OrgMember
	for rows.Next() {
		var m domain.OrgMember
		if err := rows.Scan(&m.OrgID, &m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}

func (r *orgMemberRepo) UpdateRole(ctx context.Context, tx pgx.Tx, orgID, userID uuid.UUID, role string) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3`, role, orgID, userID)
	return err
}
