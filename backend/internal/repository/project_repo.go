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

type projectRepo struct {
	pool *pgxpool.Pool
}

func NewProjectRepo(pool *pgxpool.Pool) ProjectRepository {
	return &projectRepo{pool: pool}
}

func (r *projectRepo) Create(ctx context.Context, tx pgx.Tx, project *domain.Project) (*domain.Project, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO projects (org_id, team_id, name, description, status, settings, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, org_id, team_id, name, description, status, settings, created_by, created_at, updated_at`,
		project.OrgID, project.TeamID, project.Name, nilStr(project.Description), project.Status, project.Settings, project.CreatedBy)
	return scanProject(row)
}

func (r *projectRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Project, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, org_id, team_id, name, description, status, settings, created_by, created_at, updated_at
		 FROM projects WHERE id = $1`, id)
	p, err := scanProject(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get project: %w", err)
	}
	return p, nil
}

func (r *projectRepo) Update(ctx context.Context, tx pgx.Tx, project *domain.Project) (*domain.Project, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE projects SET name=$1, description=$2, status=$3, settings=$4 WHERE id=$5
		 RETURNING id, org_id, team_id, name, description, status, settings, created_by, created_at, updated_at`,
		project.Name, nilStr(project.Description), project.Status, project.Settings, project.ID)
	return scanProject(row)
}

func (r *projectRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM projects WHERE id = $1`, id)
	return err
}

func (r *projectRepo) ListByOrg(ctx context.Context, orgID uuid.UUID, teamID *uuid.UUID) ([]*domain.Project, error) {
	var rows pgx.Rows
	var err error
	if teamID != nil {
		rows, err = r.pool.Query(ctx,
			`SELECT p.id, p.org_id, p.team_id, p.name, p.description, p.status, p.settings, p.created_by, p.created_at, p.updated_at
			 FROM projects p
			 JOIN project_teams pt ON pt.project_id = p.id
			 WHERE p.org_id = $1 AND pt.team_id = $2
			 ORDER BY p.name`, orgID, *teamID)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT id, org_id, team_id, name, description, status, settings, created_by, created_at, updated_at
			 FROM projects WHERE org_id = $1 ORDER BY name`, orgID)
	}
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()

	var projects []*domain.Project
	for rows.Next() {
		p, err := scanProjectRow(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (r *projectRepo) ListByOrgPaginated(ctx context.Context, orgID uuid.UUID, f ProjectFilter) ([]*domain.Project, int, error) {
	where := []string{"p.org_id = $1"}
	args := []any{orgID}
	argIdx := 2

	if f.Search != nil && *f.Search != "" {
		where = append(where, fmt.Sprintf("(p.name ILIKE $%d OR p.description ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+*f.Search+"%")
		argIdx++
	}
	if f.Status != nil && *f.Status != "" {
		where = append(where, fmt.Sprintf("p.status = $%d", argIdx))
		args = append(args, *f.Status)
		argIdx++
	}
	if f.TeamID != nil {
		where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM project_teams pt WHERE pt.project_id = p.id AND pt.team_id = $%d)", argIdx))
		args = append(args, *f.TeamID)
		argIdx++
	}

	if f.UserID != nil {
		where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.user_id = $%d)", argIdx))
		args = append(args, *f.UserID)
		argIdx++
	}

	whereClause := strings.Join(where, " AND ")

	// Count
	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM projects p WHERE %s`, whereClause)
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count projects: %w", err)
	}

	// Sort
	orderClause := "p.name ASC"
	allowedSortCols := map[string]string{
		"name":         "p.name",
		"status":       "p.status",
		"created_at":   "p.created_at",
		"updated_at":   "p.updated_at",
		"member_count": "member_count",
		"task_count":   "task_count",
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
		`SELECT p.id, p.org_id, p.team_id, p.name, p.description, p.status, p.settings, p.created_by, p.created_at, p.updated_at,
		        (SELECT count(*) FROM project_members pm WHERE pm.project_id = p.id)::int AS member_count,
		        (SELECT count(*) FROM tasks tk WHERE tk.project_id = p.id)::int AS task_count
		 FROM projects p
		 WHERE %s
		 ORDER BY %s
		 LIMIT $%d OFFSET $%d`, whereClause, orderClause, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list projects paginated: %w", err)
	}
	defer rows.Close()

	var projects []*domain.Project
	for rows.Next() {
		p, err := scanProjectFullRow(rows)
		if err != nil {
			return nil, 0, err
		}
		projects = append(projects, p)
	}
	return projects, total, rows.Err()
}

func scanProjectFullRow(rows pgx.Rows) (*domain.Project, error) {
	var p domain.Project
	var desc *string
	err := rows.Scan(&p.ID, &p.OrgID, &p.TeamID, &p.Name, &desc, &p.Status, &p.Settings, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
		&p.MemberCount, &p.TaskCount)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		p.Description = *desc
	}
	return &p, nil
}

func scanProject(row pgx.Row) (*domain.Project, error) {
	var p domain.Project
	var desc *string
	err := row.Scan(&p.ID, &p.OrgID, &p.TeamID, &p.Name, &desc, &p.Status, &p.Settings, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		p.Description = *desc
	}
	return &p, nil
}

func scanProjectRow(rows pgx.Rows) (*domain.Project, error) {
	var p domain.Project
	var desc *string
	err := rows.Scan(&p.ID, &p.OrgID, &p.TeamID, &p.Name, &desc, &p.Status, &p.Settings, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if desc != nil {
		p.Description = *desc
	}
	return &p, nil
}
