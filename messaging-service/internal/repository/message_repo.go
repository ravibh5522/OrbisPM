package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type messageRepo struct {
	pool *pgxpool.Pool
}

// NewMessageRepository creates a new MessageRepository.
func NewMessageRepository(pool *pgxpool.Pool) MessageRepository {
	return &messageRepo{pool: pool}
}

func (r *messageRepo) Create(ctx context.Context, tx pgx.Tx, msg *domain.Message) error {
	db := conn(r.pool, tx)
	err := db.QueryRow(ctx, `
		INSERT INTO messages (org_id, channel_id, user_id, body, body_format, parent_message_id, forwarded_from_id, mentions, sender_name)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at`,
		msg.OrgID, msg.ChannelID, msg.UserID, msg.Body, msg.BodyFormat,
		msg.ParentMessageID, msg.ForwardedFromID, msg.Mentions, msg.SenderName,
	).Scan(&msg.ID, &msg.CreatedAt, &msg.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert message: %w", err)
	}
	return nil
}

func (r *messageRepo) GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Message, error) {
	db := conn(r.pool, tx)
	msg := &domain.Message{}
	err := db.QueryRow(ctx, `
		SELECT id, org_id, channel_id, user_id, body, body_format, parent_message_id,
		       thread_count, forwarded_from_id, mentions, is_deleted, deleted_at,
		       is_edited, edited_at, created_at, updated_at, sender_name
		FROM messages WHERE id = $1`, id,
	).Scan(
		&msg.ID, &msg.OrgID, &msg.ChannelID, &msg.UserID, &msg.Body, &msg.BodyFormat,
		&msg.ParentMessageID, &msg.ThreadCount, &msg.ForwardedFromID, &msg.Mentions,
		&msg.IsDeleted, &msg.DeletedAt, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt, &msg.UpdatedAt,
		&msg.SenderName,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get message: %w", err)
	}
	return msg, nil
}

func (r *messageRepo) ListByChannel(ctx context.Context, tx pgx.Tx, channelID uuid.UUID, before *uuid.UUID, limit int) ([]domain.Message, error) {
	db := conn(r.pool, tx)

	var rows pgx.Rows
	var err error
	if before != nil {
		rows, err = db.Query(ctx, `
			SELECT id, org_id, channel_id, user_id, body, body_format, parent_message_id,
			       thread_count, forwarded_from_id, mentions, is_deleted, deleted_at,
			       is_edited, edited_at, created_at, updated_at, sender_name
			FROM messages
			WHERE channel_id = $1 AND parent_message_id IS NULL AND created_at < (SELECT created_at FROM messages WHERE id = $2)
			ORDER BY created_at DESC LIMIT $3`, channelID, *before, limit,
		)
	} else {
		rows, err = db.Query(ctx, `
			SELECT id, org_id, channel_id, user_id, body, body_format, parent_message_id,
			       thread_count, forwarded_from_id, mentions, is_deleted, deleted_at,
			       is_edited, edited_at, created_at, updated_at, sender_name
			FROM messages
			WHERE channel_id = $1 AND parent_message_id IS NULL
			ORDER BY created_at DESC LIMIT $2`, channelID, limit,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()

	var messages []domain.Message
	for rows.Next() {
		var m domain.Message
		if err := rows.Scan(
			&m.ID, &m.OrgID, &m.ChannelID, &m.UserID, &m.Body, &m.BodyFormat,
			&m.ParentMessageID, &m.ThreadCount, &m.ForwardedFromID, &m.Mentions,
			&m.IsDeleted, &m.DeletedAt, &m.IsEdited, &m.EditedAt, &m.CreatedAt, &m.UpdatedAt,
			&m.SenderName,
		); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func (r *messageRepo) ListThread(ctx context.Context, tx pgx.Tx, parentID uuid.UUID, limit, offset int) ([]domain.Message, int, error) {
	db := conn(r.pool, tx)

	var total int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM messages WHERE parent_message_id = $1`, parentID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count thread: %w", err)
	}

	rows, err := db.Query(ctx, `
		SELECT id, org_id, channel_id, user_id, body, body_format, parent_message_id,
		       thread_count, forwarded_from_id, mentions, is_deleted, deleted_at,
		       is_edited, edited_at, created_at, updated_at, sender_name
		FROM messages WHERE parent_message_id = $1
		ORDER BY created_at ASC LIMIT $2 OFFSET $3`, parentID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list thread: %w", err)
	}
	defer rows.Close()

	var messages []domain.Message
	for rows.Next() {
		var m domain.Message
		if err := rows.Scan(
			&m.ID, &m.OrgID, &m.ChannelID, &m.UserID, &m.Body, &m.BodyFormat,
			&m.ParentMessageID, &m.ThreadCount, &m.ForwardedFromID, &m.Mentions,
			&m.IsDeleted, &m.DeletedAt, &m.IsEdited, &m.EditedAt, &m.CreatedAt, &m.UpdatedAt,
			&m.SenderName,
		); err != nil {
			return nil, 0, fmt.Errorf("scan thread message: %w", err)
		}
		messages = append(messages, m)
	}
	return messages, total, nil
}

func (r *messageRepo) Update(ctx context.Context, tx pgx.Tx, msg *domain.Message) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `
		UPDATE messages SET body = $1, body_format = $2, is_edited = true, edited_at = now(), updated_at = now()
		WHERE id = $3`,
		msg.Body, msg.BodyFormat, msg.ID,
	)
	if err != nil {
		return fmt.Errorf("update message: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *messageRepo) SoftDelete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `
		UPDATE messages SET is_deleted = true, deleted_at = now(), body = '[deleted]', updated_at = now()
		WHERE id = $1`, id,
	)
	if err != nil {
		return fmt.Errorf("soft delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *messageRepo) Search(ctx context.Context, tx pgx.Tx, channelID uuid.UUID, query string, limit, offset int) ([]domain.Message, int, error) {
	db := conn(r.pool, tx)
	searchPattern := "%" + query + "%"

	var total int
	if err := db.QueryRow(ctx, `
		SELECT count(*) FROM messages WHERE channel_id = $1 AND NOT is_deleted AND body ILIKE $2`,
		channelID, searchPattern,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("search count: %w", err)
	}

	rows, err := db.Query(ctx, `
		SELECT id, org_id, channel_id, user_id, body, body_format, parent_message_id,
		       thread_count, forwarded_from_id, mentions, is_deleted, deleted_at,
		       is_edited, edited_at, created_at, updated_at, sender_name
		FROM messages WHERE channel_id = $1 AND NOT is_deleted AND body ILIKE $2
		ORDER BY created_at DESC LIMIT $3 OFFSET $4`, channelID, searchPattern, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("search messages: %w", err)
	}
	defer rows.Close()

	var messages []domain.Message
	for rows.Next() {
		var m domain.Message
		if err := rows.Scan(
			&m.ID, &m.OrgID, &m.ChannelID, &m.UserID, &m.Body, &m.BodyFormat,
			&m.ParentMessageID, &m.ThreadCount, &m.ForwardedFromID, &m.Mentions,
			&m.IsDeleted, &m.DeletedAt, &m.IsEdited, &m.EditedAt, &m.CreatedAt, &m.UpdatedAt,
			&m.SenderName,
		); err != nil {
			return nil, 0, fmt.Errorf("scan search result: %w", err)
		}
		messages = append(messages, m)
	}
	return messages, total, nil
}

func (r *messageRepo) IncrementThreadCount(ctx context.Context, tx pgx.Tx, parentID uuid.UUID) error {
	db := conn(r.pool, tx)
	_, err := db.Exec(ctx, `UPDATE messages SET thread_count = thread_count + 1 WHERE id = $1`, parentID)
	if err != nil {
		return fmt.Errorf("increment thread count: %w", err)
	}
	return nil
}
