package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type pinRepo struct {
	pool *pgxpool.Pool
}

// NewPinRepository creates a new PinRepository.
func NewPinRepository(pool *pgxpool.Pool) PinRepository {
	return &pinRepo{pool: pool}
}

func (r *pinRepo) Pin(ctx context.Context, tx pgx.Tx, pin *domain.PinnedMessage) error {
	db := conn(r.pool, tx)
	_, err := db.Exec(ctx, `
		INSERT INTO pinned_messages (channel_id, message_id, pinned_by)
		VALUES ($1, $2, $3)`,
		pin.ChannelID, pin.MessageID, pin.PinnedBy,
	)
	if err != nil {
		if isPgUniqueViolation(err) {
			return domain.ErrConflict.WithDetail("message already pinned")
		}
		return fmt.Errorf("pin message: %w", err)
	}
	return nil
}

func (r *pinRepo) Unpin(ctx context.Context, tx pgx.Tx, channelID, messageID uuid.UUID) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `DELETE FROM pinned_messages WHERE channel_id = $1 AND message_id = $2`, channelID, messageID)
	if err != nil {
		return fmt.Errorf("unpin message: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *pinRepo) ListByChannel(ctx context.Context, tx pgx.Tx, channelID uuid.UUID) ([]domain.PinnedMessage, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT pm.channel_id, pm.message_id, pm.pinned_by, pm.pinned_at,
		       m.id, m.org_id, m.channel_id, m.user_id, m.body, m.body_format,
		       m.created_at, m.updated_at
		FROM pinned_messages pm
		INNER JOIN messages m ON m.id = pm.message_id
		WHERE pm.channel_id = $1 ORDER BY pm.pinned_at DESC`, channelID,
	)
	if err != nil {
		return nil, fmt.Errorf("list pins: %w", err)
	}
	defer rows.Close()

	var pins []domain.PinnedMessage
	for rows.Next() {
		var p domain.PinnedMessage
		var msg domain.Message
		if err := rows.Scan(
			&p.ChannelID, &p.MessageID, &p.PinnedBy, &p.PinnedAt,
			&msg.ID, &msg.OrgID, &msg.ChannelID, &msg.UserID, &msg.Body, &msg.BodyFormat,
			&msg.CreatedAt, &msg.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan pin: %w", err)
		}
		p.Message = &msg
		pins = append(pins, p)
	}
	return pins, nil
}
