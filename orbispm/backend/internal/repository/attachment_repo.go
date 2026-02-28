package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type attachmentRepo struct {
	pool *pgxpool.Pool
}

func NewAttachmentRepo(pool *pgxpool.Pool) AttachmentRepository {
	return &attachmentRepo{pool: pool}
}

func (r *attachmentRepo) Create(ctx context.Context, tx pgx.Tx, a *domain.Attachment) (*domain.Attachment, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO attachments (org_id, task_id, comment_id, uploaded_by, filename, storage_path, file_size, mime_type)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, org_id, task_id, comment_id, uploaded_by, filename, storage_path, file_size, mime_type, created_at`,
		a.OrgID, a.TaskID, a.CommentID, a.UploadedBy, a.Filename, a.StoragePath, a.FileSize, a.MimeType)

	var att domain.Attachment
	err := row.Scan(&att.ID, &att.OrgID, &att.TaskID, &att.CommentID, &att.UploadedBy,
		&att.Filename, &att.StoragePath, &att.FileSize, &att.MimeType, &att.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create attachment: %w", err)
	}
	return &att, nil
}

func (r *attachmentRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Attachment, error) {
	var att domain.Attachment
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, task_id, comment_id, uploaded_by, filename, storage_path, file_size, mime_type, created_at
		 FROM attachments WHERE id = $1`, id).
		Scan(&att.ID, &att.OrgID, &att.TaskID, &att.CommentID, &att.UploadedBy,
			&att.Filename, &att.StoragePath, &att.FileSize, &att.MimeType, &att.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get attachment: %w", err)
	}
	return &att, nil
}

func (r *attachmentRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Attachment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, comment_id, uploaded_by, filename, storage_path, file_size, mime_type, created_at
		 FROM attachments WHERE task_id = $1 ORDER BY created_at DESC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var atts []*domain.Attachment
	for rows.Next() {
		var a domain.Attachment
		if err := rows.Scan(&a.ID, &a.OrgID, &a.TaskID, &a.CommentID, &a.UploadedBy,
			&a.Filename, &a.StoragePath, &a.FileSize, &a.MimeType, &a.CreatedAt); err != nil {
			return nil, err
		}
		atts = append(atts, &a)
	}
	return atts, rows.Err()
}

func (r *attachmentRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM attachments WHERE id = $1`, id)
	return err
}
