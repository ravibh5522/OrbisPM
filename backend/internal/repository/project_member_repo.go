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
		`SELECT m.project_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.display_name, ''), COALESCE(u.avatar_url, ''), m.role, m.joined_at
		 FROM project_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 WHERE m.project_id = $1 ORDER BY m.joined_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*domain.ProjectMember
	for rows.Next() {
		var m domain.ProjectMember
		if err := rows.Scan(&m.ProjectID, &m.UserID, &m.Email, &m.DisplayName, &m.AvatarURL, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		m.Source = "direct"
		members = append(members, &m)
	}
	return members, rows.Err()
}

func (r *projectMemberRepo) ListEffectiveMembers(ctx context.Context, projectID uuid.UUID) ([]*domain.EffectiveMember, error) {
	// UNION of direct project members + team members from linked teams,
	// with direct members taking precedence (higher priority via source ordering).
	rows, err := r.pool.Query(ctx,
		`WITH direct AS (
			SELECT pm.user_id, COALESCE(u.email, '') AS email,
			       COALESCE(u.display_name, '') AS display_name,
			       COALESCE(u.avatar_url, '') AS avatar_url,
			       pm.role, 'direct' AS source, NULL::uuid AS source_team_id, '' AS source_team_name,
			       pm.joined_at,
			       1 AS priority
			FROM project_members pm
			LEFT JOIN users u ON u.id = pm.user_id
			WHERE pm.project_id = $1
		),
		team_inherited AS (
			SELECT tm.user_id, COALESCE(u.email, '') AS email,
			       COALESCE(u.display_name, '') AS display_name,
			       COALESCE(u.avatar_url, '') AS avatar_url,
			       tm.role, 'team' AS source, t.id AS source_team_id, t.name AS source_team_name,
			       tm.joined_at,
			       2 AS priority
			FROM project_teams pt
			JOIN team_members tm ON tm.team_id = pt.team_id
			JOIN teams t ON t.id = pt.team_id
			LEFT JOIN users u ON u.id = tm.user_id
			WHERE pt.project_id = $1
			AND tm.user_id NOT IN (SELECT user_id FROM project_members WHERE project_id = $1)
		)
		SELECT user_id, email, display_name, avatar_url, role, source, source_team_id, source_team_name, joined_at
		FROM (
			SELECT * FROM direct
			UNION ALL
			SELECT * FROM team_inherited
		) combined
		ORDER BY priority, display_name`, projectID)
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
