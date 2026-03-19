package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
	natspkg "github.com/orbispm/messaging-service/internal/nats"
	"github.com/orbispm/messaging-service/internal/pkg/tenant"
	"github.com/orbispm/messaging-service/internal/repository"
)

// ChannelService handles channel business logic.
type ChannelService struct {
	txMgr     *repository.TxManager
	channelR  repository.ChannelRepository
	memberR   repository.ChannelMemberRepository
	publisher *natspkg.Publisher
}

// NewChannelService creates a new ChannelService.
func NewChannelService(
	txMgr *repository.TxManager,
	channelR repository.ChannelRepository,
	memberR repository.ChannelMemberRepository,
	publisher *natspkg.Publisher,
) *ChannelService {
	return &ChannelService{
		txMgr:     txMgr,
		channelR:  channelR,
		memberR:   memberR,
		publisher: publisher,
	}
}

// CreateChannel creates a new channel and adds the creator as owner.
func (s *ChannelService) CreateChannel(ctx context.Context, ch *domain.Channel) error {
	userID := tenant.UserID(ctx)
	ch.CreatedBy = userID
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.channelR.Create(ctx, tx, ch); err != nil {
			return err
		}
		member := &domain.ChannelMember{
			ChannelID: ch.ID,
			UserID:    userID,
			Role:      domain.MemberRoleOwner,
		}
		return s.memberR.Add(ctx, tx, member)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventChannelCreated, ch.ID.String(), ch)
	return nil
}

// GetChannel returns a channel by ID.
func (s *ChannelService) GetChannel(ctx context.Context, id uuid.UUID) (*domain.Channel, error) {
	var ch *domain.Channel
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		ch, err = s.channelR.GetByID(ctx, tx, id)
		return err
	})
	return ch, err
}

// ListUserChannels returns channels the user is a member of.
func (s *ChannelService) ListUserChannels(ctx context.Context, limit, offset int) ([]domain.Channel, int, error) {
	var channels []domain.Channel
	var total int
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		channels, total, err = s.channelR.ListByUser(ctx, tx, userID, limit, offset)
		return err
	})
	return channels, total, err
}

// UpdateChannel updates a channel's name, description, or avatar.
func (s *ChannelService) UpdateChannel(ctx context.Context, ch *domain.Channel) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		role, err := s.memberR.GetRole(ctx, tx, ch.ID, userID)
		if err != nil {
			return err
		}
		if role != domain.MemberRoleOwner && role != domain.MemberRoleAdmin {
			return domain.ErrForbidden.WithDetail("only channel owner or admin can update")
		}
		return s.channelR.Update(ctx, tx, ch)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventChannelUpdated, ch.ID.String(), ch)
	return nil
}

// ArchiveChannel archives a channel.
func (s *ChannelService) ArchiveChannel(ctx context.Context, channelID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		role, err := s.memberR.GetRole(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if role != domain.MemberRoleOwner {
			return domain.ErrForbidden.WithDetail("only channel owner can archive")
		}
		return s.channelR.Archive(ctx, tx, channelID)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventChannelArchived, channelID.String(), nil)
	return nil
}

// DeleteChannel permanently deletes a channel.
func (s *ChannelService) DeleteChannel(ctx context.Context, channelID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		role, err := s.memberR.GetRole(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if role != domain.MemberRoleOwner {
			return domain.ErrForbidden.WithDetail("only channel owner can delete")
		}
		return s.channelR.Delete(ctx, tx, channelID)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventChannelDeleted, channelID.String(), nil)
	return nil
}

// GetOrCreateDM returns or creates a DM channel between two users.
func (s *ChannelService) GetOrCreateDM(ctx context.Context, otherUserID uuid.UUID) (*domain.Channel, error) {
	userID := tenant.UserID(ctx)
	orgID := tenant.OrgID(ctx)
	// Prevent self-DM
	if userID == otherUserID {
		return nil, domain.ErrDMSelf
	}
	var ch *domain.Channel
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		channelID, err := s.channelR.GetOrCreateDM(ctx, tx, orgID, userID, otherUserID)
		if err != nil {
			return err
		}
		ch, err = s.channelR.GetByID(ctx, tx, channelID)
		return err
	})
	return ch, err
}

// AddMember adds a user to a channel.
func (s *ChannelService) AddMember(ctx context.Context, channelID, targetUserID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		ch, err := s.channelR.GetByID(ctx, tx, channelID)
		if err != nil {
			return err
		}
		if ch.Type == domain.ChannelTypeDM {
			return domain.ErrDMCannotAddMore
		}
		if ch.IsArchived {
			return domain.ErrChannelArchived
		}
		role, err := s.memberR.GetRole(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if role != domain.MemberRoleOwner && role != domain.MemberRoleAdmin {
			return domain.ErrForbidden.WithDetail("only channel owner or admin can add members")
		}
		member := &domain.ChannelMember{
			ChannelID: channelID,
			UserID:    targetUserID,
			Role:      domain.MemberRoleMember,
		}
		return s.memberR.Add(ctx, tx, member)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventMemberJoined, channelID.String(), map[string]any{"user_id": targetUserID})
	return nil
}

// RemoveMember removes a user from a channel.
func (s *ChannelService) RemoveMember(ctx context.Context, channelID, targetUserID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		// Self-leave is always allowed
		if userID != targetUserID {
			role, err := s.memberR.GetRole(ctx, tx, channelID, userID)
			if err != nil {
				return err
			}
			if role != domain.MemberRoleOwner && role != domain.MemberRoleAdmin {
				return domain.ErrForbidden.WithDetail("only channel owner or admin can remove members")
			}
		}
		return s.memberR.Remove(ctx, tx, channelID, targetUserID)
	})
	if err != nil {
		return err
	}
	eventType := domain.EventMemberLeft
	if userID != targetUserID {
		eventType = domain.EventMemberKicked
	}
	s.publishEvent(ctx, eventType, channelID.String(), map[string]any{"user_id": targetUserID})
	return nil
}

// ListMembers returns all members of a channel.
func (s *ChannelService) ListMembers(ctx context.Context, channelID uuid.UUID) ([]domain.ChannelMember, error) {
	var members []domain.ChannelMember
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		if _, err := s.memberR.GetRole(ctx, tx, channelID, tenant.UserID(ctx)); err != nil {
			return err
		}
		var err error
		members, err = s.memberR.ListByChannel(ctx, tx, channelID)
		return err
	})
	return members, err
}

// UpdateMemberRole changes a member's role.
func (s *ChannelService) UpdateMemberRole(ctx context.Context, channelID, targetUserID uuid.UUID, role domain.MemberRole) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		callerRole, err := s.memberR.GetRole(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if callerRole != domain.MemberRoleOwner {
			return domain.ErrForbidden.WithDetail("only channel owner can change roles")
		}
		return s.memberR.UpdateRole(ctx, tx, channelID, targetUserID, role)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventRoleChanged, channelID.String(), map[string]any{
		"user_id": targetUserID,
		"role":    role,
	})
	return nil
}

// UpdateMutePin updates mute/pin preferences for the current user.
func (s *ChannelService) UpdateMutePin(ctx context.Context, channelID uuid.UUID, isMuted, isPinned bool) error {
	userID := tenant.UserID(ctx)
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return s.memberR.UpdateMutePin(ctx, tx, channelID, userID, isMuted, isPinned)
	})
}

// MarkRead marks the channel as read for the current user.
func (s *ChannelService) MarkRead(ctx context.Context, channelID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return s.memberR.MarkRead(ctx, tx, channelID, userID)
	})
	if err != nil {
		return err
	}
	s.publishEvent(ctx, domain.EventReadReceipt, channelID.String(), map[string]any{
		"user_id": userID,
	})
	return nil
}

func (s *ChannelService) publishEvent(ctx context.Context, eventType, entityID string, payload any) {
	orgID := tenant.OrgID(ctx)
	userID := tenant.UserID(ctx)
	payloadMap, ok := payload.(map[string]any)
	if !ok && payload != nil {
		payloadMap = map[string]any{"data": payload}
	}
	event := domain.DomainEvent{
		Type:      eventType,
		OrgID:     orgID.String(),
		ChannelID: entityID,
		ActorID:   userID.String(),
		EntityID:  entityID,
		Payload:   payloadMap,
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		log.Error().Err(err).Str("type", eventType).Msg("failed to publish event")
	}
}

// EnsureMember verifies the user is a member of the channel. Exported for handler use.
func (s *ChannelService) EnsureMember(ctx context.Context, channelID uuid.UUID) error {
	userID := tenant.UserID(ctx)
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		ok, err := s.memberR.IsMember(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNotChannelMember
		}
		return nil
	})
}

// CheckArchived returns an error if the channel is archived.
func (s *ChannelService) CheckArchived(ctx context.Context, channelID uuid.UUID) error {
	return s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		ch, err := s.channelR.GetByID(ctx, tx, channelID)
		if err != nil {
			return err
		}
		if ch.IsArchived {
			return domain.ErrChannelArchived
		}
		return nil
	})
}

func mustMarshalPayload(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{"data": fmt.Sprintf("%v", v)}
}
