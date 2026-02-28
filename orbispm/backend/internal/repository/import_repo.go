package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type importJobRepo struct {
	pool *pgxpool.Pool
}

func NewImportJobRepo(pool *pgxpool.Pool) ImportJobRepository {
	return &importJobRepo{pool: pool}
}

func (r *importJobRepo) Create(ctx context.Context, tx pgx.Tx, j *domain.ImportJob) (*domain.ImportJob, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO import_jobs (org_id, project_id, user_id, status, file_path, file_name, column_mapping)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, org_id, project_id, user_id, status, file_path, file_name, column_mapping,
		           total_rows, processed_rows, error_rows, errors, result, created_at, completed_at`,
		j.OrgID, j.ProjectID, j.UserID, j.Status, j.FilePath, j.FileName, j.ColumnMapping)

	var job domain.ImportJob
	err := row.Scan(&job.ID, &job.OrgID, &job.ProjectID, &job.UserID, &job.Status,
		&job.FilePath, &job.FileName, &job.ColumnMapping,
		&job.TotalRows, &job.ProcessedRows, &job.ErrorRows, &job.Errors, &job.Result,
		&job.CreatedAt, &job.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("create import job: %w", err)
	}
	return &job, nil
}

func (r *importJobRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.ImportJob, error) {
	var job domain.ImportJob
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, project_id, user_id, status, file_path, file_name, column_mapping,
		        total_rows, processed_rows, error_rows, errors, result, created_at, completed_at
		 FROM import_jobs WHERE id = $1`, id).
		Scan(&job.ID, &job.OrgID, &job.ProjectID, &job.UserID, &job.Status,
			&job.FilePath, &job.FileName, &job.ColumnMapping,
			&job.TotalRows, &job.ProcessedRows, &job.ErrorRows, &job.Errors, &job.Result,
			&job.CreatedAt, &job.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("get import job: %w", err)
	}
	return &job, nil
}

func (r *importJobRepo) Update(ctx context.Context, tx pgx.Tx, j *domain.ImportJob) (*domain.ImportJob, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE import_jobs SET status=$2, column_mapping=$3, total_rows=$4, processed_rows=$5,
		        error_rows=$6, errors=$7, result=$8, completed_at=$9
		 WHERE id=$1
		 RETURNING id, org_id, project_id, user_id, status, file_path, file_name, column_mapping,
		           total_rows, processed_rows, error_rows, errors, result, created_at, completed_at`,
		j.ID, j.Status, j.ColumnMapping, j.TotalRows, j.ProcessedRows,
		j.ErrorRows, j.Errors, j.Result, j.CompletedAt)

	var job domain.ImportJob
	err := row.Scan(&job.ID, &job.OrgID, &job.ProjectID, &job.UserID, &job.Status,
		&job.FilePath, &job.FileName, &job.ColumnMapping,
		&job.TotalRows, &job.ProcessedRows, &job.ErrorRows, &job.Errors, &job.Result,
		&job.CreatedAt, &job.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("update import job: %w", err)
	}
	return &job, nil
}

func (r *importJobRepo) ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ImportJob, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, project_id, user_id, status, file_path, file_name, column_mapping,
		        total_rows, processed_rows, error_rows, errors, result, created_at, completed_at
		 FROM import_jobs WHERE project_id = $1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []*domain.ImportJob
	for rows.Next() {
		var j domain.ImportJob
		if err := rows.Scan(&j.ID, &j.OrgID, &j.ProjectID, &j.UserID, &j.Status,
			&j.FilePath, &j.FileName, &j.ColumnMapping,
			&j.TotalRows, &j.ProcessedRows, &j.ErrorRows, &j.Errors, &j.Result,
			&j.CreatedAt, &j.CompletedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, &j)
	}
	return jobs, rows.Err()
}
