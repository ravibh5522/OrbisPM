package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type channelRepo struct {
	pool *pgxpool.Pool
}

// NewChannelRepository creates a new ChannelRepository.
func NewChannelRepository(pool *pgxpool.Pool) ChannelRepository {
	return &channelRepo{pool: pool}
}

func (r *channelRepo) Create(ctx context.Context, tx pgx.Tx, ch *domain.Channel) error {
	db := conn(r.pool, tx)
	err := db.QueryRow(ctx, `
		INSERT INTO channels (org_id, name, description, type, team_id, project_id, dm_pair, avatar_url, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at`,
		ch.OrgID, ch.Name, ch.Description, ch.Type, ch.TeamID, ch.ProjectID, nullIfEmpty(ch.DMPair), ch.AvatarURL, ch.CreatedBy,
	).Scan(&ch.ID, &ch.CreatedAt, &ch.UpdatedAt)
	if err != nil {
		if isPgUniqueViolation(err) {
			return domain.ErrConflict.WithDetail("channel already exists")
		}
		return fmt.Errorf("insert channel: %w", err)
	}
	return nil
}

func (r *channelRepo) GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Channel, error) {
	db := conn(r.pool, tx)
	ch := &domain.Channel{}
	err := db.QueryRow(ctx, `
		SELECT id, org_id, name, description, type, team_id, project_id, is_archived,
		       COALESCE(dm_pair, ''), avatar_url, created_by, created_at, updated_at,
		       (SELECT count(*) FROM channel_members WHERE channel_id = c.id) AS member_count
		FROM channels c WHERE id = $1`, id,
	).Scan(
		&ch.ID, &ch.OrgID, &ch.Name, &ch.Description, &ch.Type,
		&ch.TeamID, &ch.ProjectID, &ch.IsArchived, &ch.DMPair,
		&ch.AvatarURL, &ch.CreatedBy, &ch.CreatedAt, &ch.UpdatedAt, &ch.MemberCount,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get channel: %w", err)
	}
	return ch, nil
}

func (r *channelRepo) ListByUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID, limit, offset int) ([]domain.Channel, int, error) {
	db := conn(r.pool, tx)

	var total int
	err := db.QueryRow(ctx, `
		SELECT count(*) FROM channels c
		INNER JOIN channel_members cm ON cm.channel_id = c.id
		WHERE cm.user_id = $1`, userID,
	).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count channels: %w", err)
	}

	rows, err := db.Query(ctx, `
		SELECT c.id, c.org_id, c.name, c.description, c.type, c.team_id, c.project_id,
		       c.is_archived, COALESCE(c.dm_pair, ''), c.avatar_url, c.created_by, c.created_at, c.updated_at,
		       (SELECT count(*) FROM channel_members WHERE channel_id = c.id) AS member_count,
		       cm.is_muted, cm.is_pinned, cm.last_read_at,
		       (SELECT body FROM messages WHERE channel_id = c.id AND NOT is_deleted ORDER BY created_at DESC LIMIT 1) AS last_message,
		       (SELECT created_at FROM messages WHERE channel_id = c.id AND NOT is_deleted ORDER BY created_at DESC LIMIT 1) AS last_activity
		FROM channels c
		INNER JOIN channel_members cm ON cm.channel_id = c.id
		WHERE cm.user_id = $1
		ORDER BY COALESCE(
			(SELECT created_at FROM messages WHERE channel_id = c.id AND NOT is_deleted ORDER BY created_at DESC LIMIT 1),
			c.created_at
		) DESC
		LIMIT $2 OFFSET $3`, userID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list channels: %w", err)
	}
	defer rows.Close()

	var channels []domain.Channel
	for rows.Next() {
		var ch domain.Channel
		var isMuted, isPinned bool
		err := rows.Scan(
			&ch.ID, &ch.OrgID, &ch.Name, &ch.Description, &ch.Type,
			&ch.TeamID, &ch.ProjectID, &ch.IsArchived, &ch.DMPair,
			&ch.AvatarURL, &ch.CreatedBy, &ch.CreatedAt, &ch.UpdatedAt,
			&ch.MemberCount, &isMuted, &isPinned, nil,
			&ch.LastMessage, &ch.LastActivity,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("scan channel: %w", err)
		}
		channels = append(channels, ch)
	}
	return channels, total, nil
}

func (r *channelRepo) Update(ctx context.Context, tx pgx.Tx, ch *domain.Channel) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `
		UPDATE channels SET name = $1, description = $2, avatar_url = $3, updated_at = now()
		WHERE id = $4`,
		ch.Name, ch.Description, ch.AvatarURL, ch.ID,
	)
	if err != nil {
		return fmt.Errorf("update channel: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *channelRepo) Archive(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `UPDATE channels SET is_archived = true, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("archive channel: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *channelRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `DELETE FROM channels WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete channel: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *channelRepo) GetOrCreateDM(ctx context.Context, tx pgx.Tx, orgID, userA, userB uuid.UUID) (uuid.UUID, error) {
	db := conn(r.pool, tx)
	var channelID uuid.UUID
	err := db.QueryRow(ctx, `SELECT get_or_create_dm_channel($1, $2, $3)`, orgID, userA, userB).Scan(&channelID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("get or create dm: %w", err)
	}
	return channelID, nil
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
