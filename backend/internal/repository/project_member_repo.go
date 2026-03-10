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
	source := m.Source
	if source == "" {
		source = "direct"
	}
	_, err := q.Exec(ctx,
		`INSERT INTO project_members (project_id, user_id, role, source, source_team_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
		m.ProjectID, m.UserID, m.Role, source, m.SourceTeamID)
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

func (r *projectMemberRepo) UpdateRole(ctx context.Context, tx pgx.Tx, projectID, userID uuid.UUID, role string) error {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx,
		`UPDATE project_members SET role = $3 WHERE project_id = $1 AND user_id = $2`,
		projectID, userID, role)
	if err != nil {
		return fmt.Errorf("update project member role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("project member not found")
	}
	return nil
}

func (r *projectMemberRepo) ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT m.project_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.display_name, ''), COALESCE(u.avatar_url, ''),
		        m.role, m.source, m.source_team_id, COALESCE(t.name, ''), m.joined_at
		 FROM project_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 LEFT JOIN teams t ON t.id = m.source_team_id
		 WHERE m.project_id = $1 ORDER BY m.joined_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*domain.ProjectMember
	for rows.Next() {
		var m domain.ProjectMember
		if err := rows.Scan(&m.ProjectID, &m.UserID, &m.Email, &m.DisplayName, &m.AvatarURL,
			&m.Role, &m.Source, &m.SourceTeamID, &m.SourceTeamName, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}

func (r *projectMemberRepo) ListEffectiveMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.EffectiveMember, error) {
	// All members are now explicitly stored in project_members (no more auto-inheritance via UNION).
	rows, err := r.pool.Query(ctx,
		`SELECT m.user_id, COALESCE(u.email, '') AS email,
		        COALESCE(u.display_name, '') AS display_name,
		        COALESCE(u.avatar_url, '') AS avatar_url,
		        m.role, m.source, m.source_team_id, COALESCE(t.name, '') AS source_team_name,
		        m.joined_at
		 FROM project_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 LEFT JOIN teams t ON t.id = m.source_team_id
		 WHERE m.project_id = $1
		 ORDER BY m.source, COALESCE(u.display_name, u.email, '')`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list effective members: %w", err)
	}
	defer rows.Close()

	var members []*domain.EffectiveMember
	for rows.Next() {
		var m domain.EffectiveMember
		if err := rows.Scan(&m.UserID, &m.Email, &m.DisplayName, &m.AvatarURL,
			&m.Role, &m.Source, &m.SourceTeamID, &m.SourceTeamName, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}

func (r *projectMemberRepo) RemoveBySourceTeam(ctx context.Context, tx pgx.Tx, projectID, sourceTeamID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`DELETE FROM project_members WHERE project_id = $1 AND source_team_id = $2`,
		projectID, sourceTeamID)
	return err
}
