package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type memberRepo struct {
	pool *pgxpool.Pool
}

// NewChannelMemberRepository creates a new ChannelMemberRepository.
func NewChannelMemberRepository(pool *pgxpool.Pool) ChannelMemberRepository {
	return &memberRepo{pool: pool}
}

func (r *memberRepo) Add(ctx context.Context, tx pgx.Tx, m *domain.ChannelMember) error {
	db := conn(r.pool, tx)
	_, err := db.Exec(ctx, `
		INSERT INTO channel_members (channel_id, user_id, role)
		VALUES ($1, $2, $3)`,
		m.ChannelID, m.UserID, m.Role,
	)
	if err != nil {
		if isPgUniqueViolation(err) {
			return domain.ErrConflict.WithDetail("already a member")
		}
		return fmt.Errorf("add member: %w", err)
	}
	return nil
}

func (r *memberRepo) Remove(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2`, channelID, userID)
	if err != nil {
		return fmt.Errorf("remove member: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *memberRepo) GetRole(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) (domain.MemberRole, error) {
	db := conn(r.pool, tx)
	var role domain.MemberRole
	err := db.QueryRow(ctx, `SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2`, channelID, userID).Scan(&role)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", domain.ErrNotChannelMember
		}
		return "", fmt.Errorf("get role: %w", err)
	}
	return role, nil
}

func (r *memberRepo) IsMember(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) (bool, error) {
	db := conn(r.pool, tx)
	var exists bool
	err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2)`, channelID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check membership: %w", err)
	}
	return exists, nil
}

func (r *memberRepo) ListByChannel(ctx context.Context, tx pgx.Tx, channelID uuid.UUID) ([]domain.ChannelMember, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT channel_id, user_id, role, last_read_at, is_muted, is_pinned, joined_at
		FROM channel_members WHERE channel_id = $1 ORDER BY joined_at`, channelID,
	)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()

	var members []domain.ChannelMember
	for rows.Next() {
		var m domain.ChannelMember
		if err := rows.Scan(&m.ChannelID, &m.UserID, &m.Role, &m.LastReadAt, &m.IsMuted, &m.IsPinned, &m.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, m)
	}
	return members, nil
}

func (r *memberRepo) UpdateRole(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID, role domain.MemberRole) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `UPDATE channel_members SET role = $1 WHERE channel_id = $2 AND user_id = $3`, role, channelID, userID)
	if err != nil {
		return fmt.Errorf("update role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *memberRepo) UpdateMutePin(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID, isMuted, isPinned bool) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `
		UPDATE channel_members SET is_muted = $1, is_pinned = $2 WHERE channel_id = $3 AND user_id = $4`,
		isMuted, isPinned, channelID, userID,
	)
	if err != nil {
		return fmt.Errorf("update mute/pin: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *memberRepo) MarkRead(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `UPDATE channel_members SET last_read_at = now() WHERE channel_id = $1 AND user_id = $2`, channelID, userID)
	if err != nil {
		return fmt.Errorf("mark read: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}
