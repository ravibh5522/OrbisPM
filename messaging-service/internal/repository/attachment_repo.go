package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type attachmentRepo struct {
	pool *pgxpool.Pool
}

// NewAttachmentRepository creates a new AttachmentRepository.
func NewAttachmentRepository(pool *pgxpool.Pool) AttachmentRepository {
	return &attachmentRepo{pool: pool}
}

func (r *attachmentRepo) Create(ctx context.Context, tx pgx.Tx, att *domain.Attachment) error {
	db := conn(r.pool, tx)
	err := db.QueryRow(ctx, `
		INSERT INTO message_attachments (org_id, message_id, file_name, file_size, content_type, storage_key, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at`,
		att.OrgID, att.MessageID, att.FileName, att.FileSize, att.ContentType, att.StorageKey, att.Metadata,
	).Scan(&att.ID, &att.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert attachment: %w", err)
	}
	return nil
}

func (r *attachmentRepo) ListByMessage(ctx context.Context, tx pgx.Tx, messageID uuid.UUID) ([]domain.Attachment, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT id, org_id, message_id, file_name, file_size, content_type, storage_key, metadata, created_at
		FROM message_attachments WHERE message_id = $1 ORDER BY created_at`, messageID,
	)
	if err != nil {
		return nil, fmt.Errorf("list attachments: %w", err)
	}
	defer rows.Close()

	var attachments []domain.Attachment
	for rows.Next() {
		var a domain.Attachment
		if err := rows.Scan(&a.ID, &a.OrgID, &a.MessageID, &a.FileName, &a.FileSize, &a.ContentType, &a.StorageKey, &a.Metadata, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan attachment: %w", err)
		}
		attachments = append(attachments, a)
	}
	return attachments, nil
}

func (r *attachmentRepo) ListByMessages(ctx context.Context, tx pgx.Tx, messageIDs []uuid.UUID) (map[uuid.UUID][]domain.Attachment, error) {
	if len(messageIDs) == 0 {
		return map[uuid.UUID][]domain.Attachment{}, nil
	}
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT id, org_id, message_id, file_name, file_size, content_type, storage_key, metadata, created_at
		FROM message_attachments WHERE message_id = ANY($1) ORDER BY created_at`, messageIDs,
	)
	if err != nil {
		return nil, fmt.Errorf("batch list attachments: %w", err)
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]domain.Attachment, len(messageIDs))
	for rows.Next() {
		var a domain.Attachment
		if err := rows.Scan(&a.ID, &a.OrgID, &a.MessageID, &a.FileName, &a.FileSize, &a.ContentType, &a.StorageKey, &a.Metadata, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan batch attachment: %w", err)
		}
		result[a.MessageID] = append(result[a.MessageID], a)
	}
	return result, nil
}

func (r *attachmentRepo) GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Attachment, error) {
	db := conn(r.pool, tx)
	a := &domain.Attachment{}
	err := db.QueryRow(ctx, `
		SELECT id, org_id, message_id, file_name, file_size, content_type, storage_key, metadata, created_at
		FROM message_attachments WHERE id = $1`, id,
	).Scan(&a.ID, &a.OrgID, &a.MessageID, &a.FileName, &a.FileSize, &a.ContentType, &a.StorageKey, &a.Metadata, &a.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get attachment: %w", err)
	}
	return a, nil
}
