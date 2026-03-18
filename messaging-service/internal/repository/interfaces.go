package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/messaging-service/internal/domain"
)

// ChannelRepository handles channel persistence.
type ChannelRepository interface {
	Create(ctx context.Context, tx pgx.Tx, ch *domain.Channel) error
	GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Channel, error)
	ListByUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID, limit, offset int) ([]domain.Channel, int, error)
	Update(ctx context.Context, tx pgx.Tx, ch *domain.Channel) error
	Archive(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	GetOrCreateDM(ctx context.Context, tx pgx.Tx, orgID, userA, userB uuid.UUID) (uuid.UUID, error)
}

// ChannelMemberRepository handles channel membership persistence.
type ChannelMemberRepository interface {
	Add(ctx context.Context, tx pgx.Tx, member *domain.ChannelMember) error
	Remove(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) error
	GetRole(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) (domain.MemberRole, error)
	IsMember(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) (bool, error)
	ListByChannel(ctx context.Context, tx pgx.Tx, channelID uuid.UUID) ([]domain.ChannelMember, error)
	UpdateRole(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID, role domain.MemberRole) error
	UpdateMutePin(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID, isMuted, isPinned bool) error
	MarkRead(ctx context.Context, tx pgx.Tx, channelID, userID uuid.UUID) error
}

// MessageRepository handles message persistence.
type MessageRepository interface {
	Create(ctx context.Context, tx pgx.Tx, msg *domain.Message) error
	GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Message, error)
	ListByChannel(ctx context.Context, tx pgx.Tx, channelID uuid.UUID, before *uuid.UUID, limit int) ([]domain.Message, error)
	ListThread(ctx context.Context, tx pgx.Tx, parentID uuid.UUID, limit, offset int) ([]domain.Message, int, error)
	Update(ctx context.Context, tx pgx.Tx, msg *domain.Message) error
	SoftDelete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	Search(ctx context.Context, tx pgx.Tx, channelID uuid.UUID, query string, limit, offset int) ([]domain.Message, int, error)
	IncrementThreadCount(ctx context.Context, tx pgx.Tx, parentID uuid.UUID) error
}

// ReactionRepository handles message reaction persistence.
type ReactionRepository interface {
	Add(ctx context.Context, tx pgx.Tx, r *domain.Reaction) error
	Remove(ctx context.Context, tx pgx.Tx, messageID, userID uuid.UUID, emoji string) error
	ListByMessage(ctx context.Context, tx pgx.Tx, messageID uuid.UUID) ([]domain.ReactionGroup, error)
}

// AttachmentRepository handles message attachment persistence.
type AttachmentRepository interface {
	Create(ctx context.Context, tx pgx.Tx, att *domain.Attachment) error
	ListByMessage(ctx context.Context, tx pgx.Tx, messageID uuid.UUID) ([]domain.Attachment, error)
	GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.Attachment, error)
}

// PinRepository handles pinned message persistence.
type PinRepository interface {
	Pin(ctx context.Context, tx pgx.Tx, pin *domain.PinnedMessage) error
	Unpin(ctx context.Context, tx pgx.Tx, channelID, messageID uuid.UUID) error
	ListByChannel(ctx context.Context, tx pgx.Tx, channelID uuid.UUID) ([]domain.PinnedMessage, error)
}

// BookmarkRepository handles user bookmarks.
type BookmarkRepository interface {
	Add(ctx context.Context, tx pgx.Tx, bm *domain.Bookmark) error
	Remove(ctx context.Context, tx pgx.Tx, userID, messageID uuid.UUID) error
	ListByUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID, limit, offset int) ([]domain.Bookmark, int, error)
}
