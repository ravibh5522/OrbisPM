package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type bookmarkRepo struct {
	pool *pgxpool.Pool
}

// NewBookmarkRepository creates a new BookmarkRepository.
func NewBookmarkRepository(pool *pgxpool.Pool) BookmarkRepository {
	return &bookmarkRepo{pool: pool}
}

func (r *bookmarkRepo) Add(ctx context.Context, tx pgx.Tx, bm *domain.Bookmark) error {
	db := conn(r.pool, tx)
	_, err := db.Exec(ctx, `
		INSERT INTO message_bookmarks (user_id, message_id, note)
		VALUES ($1, $2, $3)`,
		bm.UserID, bm.MessageID, bm.Note,
	)
	if err != nil {
		if isPgUniqueViolation(err) {
			return domain.ErrConflict.WithDetail("bookmark already exists")
		}
		return fmt.Errorf("add bookmark: %w", err)
	}
	return nil
}

func (r *bookmarkRepo) Remove(ctx context.Context, tx pgx.Tx, userID, messageID uuid.UUID) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `DELETE FROM message_bookmarks WHERE user_id = $1 AND message_id = $2`, userID, messageID)
	if err != nil {
		return fmt.Errorf("remove bookmark: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *bookmarkRepo) ListByUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID, limit, offset int) ([]domain.Bookmark, int, error) {
	db := conn(r.pool, tx)

	var total int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM message_bookmarks WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count bookmarks: %w", err)
	}

	rows, err := db.Query(ctx, `
		SELECT mb.user_id, mb.message_id, mb.note, mb.created_at,
		       m.id, m.org_id, m.channel_id, m.user_id, m.body, m.body_format,
		       m.created_at, m.updated_at
		FROM message_bookmarks mb
		INNER JOIN messages m ON m.id = mb.message_id
		WHERE mb.user_id = $1 ORDER BY mb.created_at DESC LIMIT $2 OFFSET $3`, userID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list bookmarks: %w", err)
	}
	defer rows.Close()

	var bookmarks []domain.Bookmark
	for rows.Next() {
		var bm domain.Bookmark
		var msg domain.Message
		if err := rows.Scan(
			&bm.UserID, &bm.MessageID, &bm.Note, &bm.CreatedAt,
			&msg.ID, &msg.OrgID, &msg.ChannelID, &msg.UserID, &msg.Body, &msg.BodyFormat,
			&msg.CreatedAt, &msg.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan bookmark: %w", err)
		}
		bm.Message = &msg
		bookmarks = append(bookmarks, bm)
	}
	return bookmarks, total, nil
}
