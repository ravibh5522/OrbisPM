package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type projectMemberRepo struct {
	pool *pgxpool.Pool
}

func NewProjectMemberRepo(pool *pgxpool.Pool) ProjectMemberRepository {
	return &projectMemberRepo{pool: pool}
}

func (r *projectMemberRepo) Add(ctx context.Context, tx pgx.Tx, m *domain.ProjectMember) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		m.ProjectID, m.UserID, m.Role)
	if err != nil {
		return fmt.Errorf("add project member: %w", err)
	}
	return nil
}

func (r *projectMemberRepo) Remove(ctx context.Context, tx pgx.Tx, projectID, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, projectID, userID)
	return err
}

func (r *projectMemberRepo) ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT project_id, user_id, role, joined_at FROM project_members WHERE project_id = $1 ORDER BY joined_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*domain.ProjectMember
	for rows.Next() {
		var m domain.ProjectMember
		if err := rows.Scan(&m.ProjectID, &m.UserID, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}
