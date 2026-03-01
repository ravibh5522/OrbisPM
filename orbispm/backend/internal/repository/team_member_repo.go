package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type teamMemberRepo struct {
	pool *pgxpool.Pool
}

func NewTeamMemberRepo(pool *pgxpool.Pool) TeamMemberRepository {
	return &teamMemberRepo{pool: pool}
}

func (r *teamMemberRepo) Add(ctx context.Context, tx pgx.Tx, m *domain.TeamMember) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		m.TeamID, m.UserID, m.Role)
	if err != nil {
		return fmt.Errorf("add team member: %w", err)
	}
	return nil
}

func (r *teamMemberRepo) Remove(ctx context.Context, tx pgx.Tx, teamID, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, teamID, userID)
	return err
}

func (r *teamMemberRepo) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*domain.TeamMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT m.team_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.raw_user_meta_data->>'name', ''), m.role, m.joined_at
		 FROM team_members m
		 LEFT JOIN auth.users u ON u.id = m.user_id
		 WHERE m.team_id = $1 ORDER BY m.joined_at`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*domain.TeamMember
	for rows.Next() {
		var m domain.TeamMember
		if err := rows.Scan(&m.TeamID, &m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}
