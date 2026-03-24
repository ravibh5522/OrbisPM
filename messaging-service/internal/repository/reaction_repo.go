package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type reactionRepo struct {
	pool *pgxpool.Pool
}

// NewReactionRepository creates a new ReactionRepository.
func NewReactionRepository(pool *pgxpool.Pool) ReactionRepository {
	return &reactionRepo{pool: pool}
}

func (r *reactionRepo) Add(ctx context.Context, tx pgx.Tx, reaction *domain.Reaction) error {
	db := conn(r.pool, tx)
	_, err := db.Exec(ctx, `
		INSERT INTO message_reactions (message_id, user_id, emoji)
		VALUES ($1, $2, $3)`,
		reaction.MessageID, reaction.UserID, reaction.Emoji,
	)
	if err != nil {
		if isPgUniqueViolation(err) {
			return domain.ErrConflict.WithDetail("reaction already exists")
		}
		return fmt.Errorf("add reaction: %w", err)
	}
	return nil
}

func (r *reactionRepo) Remove(ctx context.Context, tx pgx.Tx, messageID, userID uuid.UUID, emoji string) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `
		DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
		messageID, userID, emoji,
	)
	if err != nil {
		return fmt.Errorf("remove reaction: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *reactionRepo) ListByMessage(ctx context.Context, tx pgx.Tx, messageID uuid.UUID) ([]domain.ReactionGroup, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT emoji, count(*), array_agg(user_id ORDER BY created_at)
		FROM message_reactions WHERE message_id = $1
		GROUP BY emoji ORDER BY min(created_at)`, messageID,
	)
	if err != nil {
		return nil, fmt.Errorf("list reactions: %w", err)
	}
	defer rows.Close()

	var groups []domain.ReactionGroup
	for rows.Next() {
		var g domain.ReactionGroup
		if err := rows.Scan(&g.Emoji, &g.Count, &g.Users); err != nil {
			return nil, fmt.Errorf("scan reaction group: %w", err)
		}
		groups = append(groups, g)
	}
	return groups, nil
}
