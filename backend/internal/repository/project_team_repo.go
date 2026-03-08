package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type projectTeamRepo struct {
	pool *pgxpool.Pool
}

func NewProjectTeamRepo(pool *pgxpool.Pool) ProjectTeamRepository {
	return &projectTeamRepo{pool: pool}
}

func (r *projectTeamRepo) Link(ctx context.Context, tx pgx.Tx, projectID, teamID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO project_teams (project_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		projectID, teamID)
	if err != nil {
		return fmt.Errorf("link project team: %w", err)
	}
	return nil
}

func (r *projectTeamRepo) Unlink(ctx context.Context, tx pgx.Tx, projectID, teamID uuid.UUID) error {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx,
		`DELETE FROM project_teams WHERE project_id = $1 AND team_id = $2`,
		projectID, teamID)
	if err != nil {
		return fmt.Errorf("unlink project team: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *projectTeamRepo) ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ProjectTeam, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT pt.project_id, pt.team_id, t.name, pt.added_at
		 FROM project_teams pt
		 JOIN teams t ON t.id = pt.team_id
		 WHERE pt.project_id = $1
		 ORDER BY pt.added_at`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project teams: %w", err)
	}
	defer rows.Close()

	var teams []*domain.ProjectTeam
	for rows.Next() {
		var pt domain.ProjectTeam
		if err := rows.Scan(&pt.ProjectID, &pt.TeamID, &pt.TeamName, &pt.AddedAt); err != nil {
			return nil, err
		}
		teams = append(teams, &pt)
	}
	return teams, rows.Err()
}

func (r *projectTeamRepo) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*domain.ProjectTeam, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT pt.project_id, pt.team_id, t.name, pt.added_at
		 FROM project_teams pt
		 JOIN teams t ON t.id = pt.team_id
		 WHERE pt.team_id = $1
		 ORDER BY pt.added_at`, teamID)
	if err != nil {
		return nil, fmt.Errorf("list team projects: %w", err)
	}
	defer rows.Close()

	var teams []*domain.ProjectTeam
	for rows.Next() {
		var pt domain.ProjectTeam
		if err := rows.Scan(&pt.ProjectID, &pt.TeamID, &pt.TeamName, &pt.AddedAt); err != nil {
			return nil, err
		}
		teams = append(teams, &pt)
	}
	return teams, rows.Err()
}

func (r *projectTeamRepo) Count(ctx context.Context, projectID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_teams WHERE project_id = $1`, projectID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count project teams: %w", err)
	}
	return count, nil
}
