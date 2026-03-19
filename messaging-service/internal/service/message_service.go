package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
	natspkg "github.com/orbispm/messaging-service/internal/nats"
	"github.com/orbispm/messaging-service/internal/pkg/tenant"
	"github.com/orbispm/messaging-service/internal/repository"
)

// MessageService handles message business logic.
type MessageService struct {
	txMgr       *repository.TxManager
	messageR    repository.MessageRepository
	memberR     repository.ChannelMemberRepository
	channelR    repository.ChannelRepository
	reactionR   repository.ReactionRepository
	attachmentR repository.AttachmentRepository
	pinR        repository.PinRepository
	bookmarkR   repository.BookmarkRepository
	publisher   *natspkg.Publisher
	editWindow  time.Duration
}

// NewMessageService creates a new MessageService.
func NewMessageService(
	txMgr *repository.TxManager,
	messageR repository.MessageRepository,
	memberR repository.ChannelMemberRepository,
	channelR repository.ChannelRepository,
	reactionR repository.ReactionRepository,
	attachmentR repository.AttachmentRepository,
	pinR repository.PinRepository,
	bookmarkR repository.BookmarkRepository,
	publisher *natspkg.Publisher,
	editWindowMinutes int,
) *MessageService {
	return &MessageService{
		txMgr:       txMgr,
		messageR:    messageR,
		memberR:     memberR,
		channelR:    channelR,
		reactionR:   reactionR,
		attachmentR: attachmentR,
		pinR:        pinR,
		bookmarkR:   bookmarkR,
		publisher:   publisher,
		editWindow:  time.Duration(editWindowMinutes) * time.Minute,
	}
}

// SendMessage creates a new message in a channel.
func (s *MessageService) SendMessage(ctx context.Context, msg *domain.Message) error {
	userID := tenant.UserID(ctx)
	orgID := tenant.OrgID(ctx)
	msg.UserID = userID
	msg.OrgID = orgID

	// Populate sender info from auth context
	displayName := tenant.DisplayName(ctx)
	email := tenant.Email(ctx)
	if displayName != "" {
		msg.SenderName = displayName
	} else if email != "" {
		msg.SenderName = email
	}

	if len(msg.Body) > domain.MaxMessageLength {
		return domain.ErrMessageTooLong
	}
	if msg.BodyFormat == "" {
		msg.BodyFormat = domain.MessageFormatText
	}

	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		// Verify membership
		ok, err := s.memberR.IsMember(ctx, tx, msg.ChannelID, userID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNotChannelMember
		}
		// Verify channel not archived
		ch, err := s.channelR.GetByID(ctx, tx, msg.ChannelID)
		if err != nil {
			return err
		}
		if ch.IsArchived {
			return domain.ErrChannelArchived
		}
		// Create message
		if err := s.messageR.Create(ctx, tx, msg); err != nil {
			return err
		}
		// If reply, increment parent thread count
		if msg.ParentMessageID != nil {
			if err := s.messageR.IncrementThreadCount(ctx, tx, *msg.ParentMessageID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	s.publishEvent(ctx, domain.EventMessageCreated, msg.ChannelID.String(), msg.ID.String(), msg)
	return nil
}

// EditMessage edits an existing message within the edit window.
func (s *MessageService) EditMessage(ctx context.Context, messageID uuid.UUID, body string, bodyFormat domain.MessageFormat) (*domain.Message, error) {
	userID := tenant.UserID(ctx)

	if len(body) > domain.MaxMessageLength {
		return nil, domain.ErrMessageTooLong
	}

	var msg *domain.Message
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		msg, err = s.messageR.GetByID(ctx, tx, messageID)
		if err != nil {
			return err
		}
		if msg.UserID != userID {
			return domain.ErrForbidden.WithDetail("can only edit own messages")
		}
		if msg.IsDeleted {
			return domain.ErrNotFound
		}
		if time.Since(msg.CreatedAt) > s.editWindow {
			return domain.ErrEditWindowClosed
		}
		msg.Body = body
		msg.BodyFormat = bodyFormat
		return s.messageR.Update(ctx, tx, msg)
	})
	if err != nil {
		return nil, err
	}

	s.publishEvent(ctx, domain.EventMessageEdited, msg.ChannelID.String(), msg.ID.String(), msg)
	return msg, nil
}

// DeleteMessage soft-deletes a message.
func (s *MessageService) DeleteMessage(ctx context.Context, messageID uuid.UUID) error {
	userID := tenant.UserID(ctx)

	var channelID uuid.UUID
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		msg, err := s.messageR.GetByID(ctx, tx, messageID)
		if err != nil {
			return err
		}
		channelID = msg.ChannelID
		// Owner can delete own, channel admin/owner can delete any
		if msg.UserID != userID {
			role, err := s.memberR.GetRole(ctx, tx, msg.ChannelID, userID)
			if err != nil {
				return err
			}
			if role != domain.MemberRoleOwner && role != domain.MemberRoleAdmin {
				return domain.ErrForbidden.WithDetail("can only delete own messages or be channel admin")
			}
		}
		return s.messageR.SoftDelete(ctx, tx, messageID)
	})
	if err != nil {
		return err
	}

	s.publishEvent(ctx, domain.EventMessageDeleted, channelID.String(), messageID.String(), nil)
	return nil
}

// ListMessages returns paginated messages for a channel.
func (s *MessageService) ListMessages(ctx context.Context, channelID uuid.UUID, before *uuid.UUID, limit int) ([]domain.Message, error) {
	userID := tenant.UserID(ctx)
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var messages []domain.Message
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		ok, err := s.memberR.IsMember(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNotChannelMember
		}
		messages, err = s.messageR.ListByChannel(ctx, tx, channelID, before, limit)
		if err != nil {
			return err
		}
		return s.enrichMessages(ctx, tx, messages)
	})
	return messages, err
}

// ListThread returns thread replies for a parent message.
func (s *MessageService) ListThread(ctx context.Context, parentID uuid.UUID, limit, offset int) ([]domain.Message, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var messages []domain.Message
	var total int
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		messages, total, err = s.messageR.ListThread(ctx, tx, parentID, limit, offset)
		if err != nil {
			return err
		}
		return s.enrichMessages(ctx, tx, messages)
	})
	return messages, total, err
}

// ForwardMessage creates a new message that references a forwarded source.
func (s *MessageService) ForwardMessage(ctx context.Context, sourceMessageID, targetChannelID uuid.UUID) (*domain.Message, error) {
	userID := tenant.UserID(ctx)
	orgID := tenant.OrgID(ctx)

	var newMsg *domain.Message
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		source, err := s.messageR.GetByID(ctx, tx, sourceMessageID)
		if err != nil {
			return err
		}
		if source.IsDeleted {
			return domain.ErrNotFound
		}
		// Ensure user is member of target channel
		ok, err := s.memberR.IsMember(ctx, tx, targetChannelID, userID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNotChannelMember
		}
		newMsg = &domain.Message{
			OrgID:           orgID,
			ChannelID:       targetChannelID,
			UserID:          userID,
			Body:            source.Body,
			BodyFormat:      source.BodyFormat,
			ForwardedFromID: &sourceMessageID,
		}
		return s.messageR.Create(ctx, tx, newMsg)
	})
	if err != nil {
		return nil, err
	}

	s.publishEvent(ctx, domain.EventMessageCreated, targetChannelID.String(), newMsg.ID.String(), newMsg)
	return newMsg, nil
}

// SearchMessages searches messages in a channel.
func (s *MessageService) SearchMessages(ctx context.Context, channelID uuid.UUID, query string, limit, offset int) ([]domain.Message, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var messages []domain.Message
	var total int
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		messages, total, err = s.messageR.Search(ctx, tx, channelID, query, limit, offset)
		if err != nil {
			return err
		}
		return s.enrichMessages(ctx, tx, messages)
	})
	return messages, total, err
}

// ToggleReaction adds or removes a reaction.
func (s *MessageService) ToggleReaction(ctx context.Context, messageID uuid.UUID, emoji string) (bool, error) {
	userID := tenant.UserID(ctx)
	var added bool
	var channelID uuid.UUID

	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		msg, err := s.messageR.GetByID(ctx, tx, messageID)
		if err != nil {
			return err
		}
		channelID = msg.ChannelID

		// Use savepoint so a unique-violation doesn't abort the whole transaction.
		if _, err := tx.Exec(ctx, "SAVEPOINT reaction_toggle"); err != nil {
			return err
		}

		reaction := &domain.Reaction{MessageID: messageID, UserID: userID, Emoji: emoji}
		err = s.reactionR.Add(ctx, tx, reaction)
		if err != nil {
			if appErr, ok := domain.IsAppError(err); ok && appErr.Code == 409 {
				// Rollback to savepoint to clear the aborted transaction state.
				if _, err := tx.Exec(ctx, "ROLLBACK TO SAVEPOINT reaction_toggle"); err != nil {
					return err
				}
				// Already exists — remove it (toggle)
				if err := s.reactionR.Remove(ctx, tx, messageID, userID, emoji); err != nil {
					return err
				}
				added = false
				return nil
			}
			return err
		}
		added = true
		return nil
	})
	if err != nil {
		return false, err
	}

	eventType := domain.EventReactionAdded
	if !added {
		eventType = domain.EventReactionRemoved
	}
	s.publishEvent(ctx, eventType, channelID.String(), messageID.String(), map[string]any{
		"emoji":   emoji,
		"user_id": userID,
	})
	return added, nil
}

// PinMessage pins a message in a channel.
func (s *MessageService) PinMessage(ctx context.Context, channelID, messageID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		role, err := s.memberR.GetRole(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if role != domain.MemberRoleOwner && role != domain.MemberRoleAdmin {
			return domain.ErrForbidden.WithDetail("only channel owner or admin can pin messages")
		}
		pin := &domain.PinnedMessage{ChannelID: channelID, MessageID: messageID, PinnedBy: userID}
		return s.pinR.Pin(ctx, tx, pin)
	})
	if err != nil {
		return err
	}

	s.publishEvent(ctx, domain.EventMessagePinned, channelID.String(), messageID.String(), nil)
	return nil
}

// UnpinMessage unpins a message.
func (s *MessageService) UnpinMessage(ctx context.Context, channelID, messageID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		role, err := s.memberR.GetRole(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if role != domain.MemberRoleOwner && role != domain.MemberRoleAdmin {
			return domain.ErrForbidden.WithDetail("only channel owner or admin can unpin messages")
		}
		return s.pinR.Unpin(ctx, tx, channelID, messageID)
	})
	if err != nil {
		return err
	}

	s.publishEvent(ctx, domain.EventMessageUnpinned, channelID.String(), messageID.String(), nil)
	return nil
}

// ListPins returns all pinned messages in a channel.
func (s *MessageService) ListPins(ctx context.Context, channelID uuid.UUID) ([]domain.PinnedMessage, error) {
	var pins []domain.PinnedMessage
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		pins, err = s.pinR.ListByChannel(ctx, tx, channelID)
		return err
	})
	return pins, err
}

// AddBookmark adds a message bookmark for the current user.
func (s *MessageService) AddBookmark(ctx context.Context, messageID uuid.UUID, note string) error {
	userID := tenant.UserID(ctx)
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		bm := &domain.Bookmark{UserID: userID, MessageID: messageID, Note: note}
		return s.bookmarkR.Add(ctx, tx, bm)
	})
}

// RemoveBookmark removes a message bookmark.
func (s *MessageService) RemoveBookmark(ctx context.Context, messageID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return s.bookmarkR.Remove(ctx, tx, userID, messageID)
	})
}

// ListBookmarks returns the user's bookmarked messages.
func (s *MessageService) ListBookmarks(ctx context.Context, limit, offset int) ([]domain.Bookmark, int, error) {
	userID := tenant.UserID(ctx)
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var bookmarks []domain.Bookmark
	var total int
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		bookmarks, total, err = s.bookmarkR.ListByUser(ctx, tx, userID, limit, offset)
		return err
	})
	return bookmarks, total, err
}

// enrichMessages populates reactions and attachments for a slice of messages.
func (s *MessageService) enrichMessages(ctx context.Context, tx pgx.Tx, messages []domain.Message) error {
	for i := range messages {
		reactions, err := s.reactionR.ListByMessage(ctx, tx, messages[i].ID)
		if err != nil {
			return err
		}
		if reactions == nil {
			reactions = []domain.ReactionGroup{}
		}
		messages[i].Reactions = reactions

		attachments, err := s.attachmentR.ListByMessage(ctx, tx, messages[i].ID)
		if err != nil {
			return err
		}
		if attachments == nil {
			attachments = []domain.Attachment{}
		}
		messages[i].Attachments = attachments
	}
	return nil
}

func (s *MessageService) publishEvent(ctx context.Context, eventType, channelID, entityID string, payload any) {
	orgID := tenant.OrgID(ctx)
	userID := tenant.UserID(ctx)

	payloadMap, ok := payload.(map[string]any)
	if !ok && payload != nil {
		payloadMap = map[string]any{"data": payload}
	}

	event := domain.DomainEvent{
		Type:      eventType,
		OrgID:     orgID.String(),
		ChannelID: channelID,
		ActorID:   userID.String(),
		EntityID:  entityID,
		Payload:   payloadMap,
	}

	if err := s.publisher.Publish(ctx, event); err != nil {
		log.Error().Err(err).Str("type", eventType).Msg("failed to publish event")
	}
}
