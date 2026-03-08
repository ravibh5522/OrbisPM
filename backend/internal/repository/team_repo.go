package repository

import (
	"context"
	"errors"
	"fmt"

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
		`INSERT INTO teams (org_id, name, description) VALUES ($1, $2, $3)
		 RETURNING id, org_id, name, description, created_at, updated_at`,
		team.OrgID, team.Name, nilStr(team.Description))
	return scanTeam(row)
}

func (r *teamRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Team, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, org_id, name, description, created_at, updated_at FROM teams WHERE id = $1`, id)
	t, err := scanTeam(row)
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
		`UPDATE teams SET name=$1, description=$2 WHERE id=$3
		 RETURNING id, org_id, name, description, created_at, updated_at`,
		team.Name, nilStr(team.Description), team.ID)
	return scanTeam(row)
}

func (r *teamRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM teams WHERE id = $1`, id)
	return err
}

func (r *teamRepo) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Team, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, name, description, created_at, updated_at FROM teams WHERE org_id = $1 ORDER BY name`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	defer rows.Close()

	var teams []*domain.Team
	for rows.Next() {
		t, err := scanTeamRow(rows)
		if err != nil {
			return nil, err
		}
		teams = append(teams, t)
	}
	return teams, rows.Err()
}

func scanTeam(row pgx.Row) (*domain.Team, error) {
	var t domain.Team
	var desc *string
	err := row.Scan(&t.ID, &t.OrgID, &t.Name, &desc, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		t.Description = *desc
	}
	return &t, nil
}

func scanTeamRow(rows pgx.Rows) (*domain.Team, error) {
	var t domain.Team
	var desc *string
	err := rows.Scan(&t.ID, &t.OrgID, &t.Name, &desc, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		t.Description = *desc
	}
	return &t, nil
}
