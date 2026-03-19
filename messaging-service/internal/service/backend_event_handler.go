package service

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/repository"
)

const redisChannelPrefix = "orbispm:events:"

// BackendEvent mirrors the backend's DomainEvent struct.
type BackendEvent struct {
	Type     string         `json:"type"`
	OrgID    string         `json:"org_id"`
	ActorID  string         `json:"actor_id"`
	EntityID string         `json:"entity_id"`
	Payload  map[string]any `json:"payload,omitempty"`
}

// BackendEventHandler listens to backend Redis events and syncs
// channels/members in the messaging service.
type BackendEventHandler struct {
	rdb      *redis.Client
	txMgr    *repository.TxManager
	channelR repository.ChannelRepository
	memberR  repository.ChannelMemberRepository
}

// NewBackendEventHandler creates a new handler for backend events.
func NewBackendEventHandler(
	rdb *redis.Client,
	txMgr *repository.TxManager,
	channelR repository.ChannelRepository,
	memberR repository.ChannelMemberRepository,
) *BackendEventHandler {
	return &BackendEventHandler{
		rdb:      rdb,
		txMgr:    txMgr,
		channelR: channelR,
		memberR:  memberR,
	}
}

// Start subscribes to all backend events and dispatches them.
func (h *BackendEventHandler) Start(ctx context.Context) error {
	// Subscribe to the wildcard channel that backend publishes to
	pubsub := h.rdb.PSubscribe(ctx, redisChannelPrefix+"*")

	go func() {
		defer pubsub.Close()
		ch := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				h.handleMessage(ctx, msg)
			}
		}
	}()

	log.Info().Msg("backend event handler started — listening for Redis events")
	return nil
}

func (h *BackendEventHandler) handleMessage(ctx context.Context, msg *redis.Message) {
	var event BackendEvent
	if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
		log.Error().Err(err).Str("channel", msg.Channel).Msg("failed to unmarshal backend event")
		return
	}

	logger := log.With().
		Str("event_type", event.Type).
		Str("entity_id", event.EntityID).
		Str("org_id", event.OrgID).
		Logger()

	var err error
	switch event.Type {
	case domain.BackendEventTeamCreated:
		err = h.handleTeamCreated(ctx, event)
	case domain.BackendEventTeamDeleted:
		err = h.handleTeamDeleted(ctx, event)
	case domain.BackendEventTeamMemberAdded:
		err = h.handleTeamMemberAdded(ctx, event)
	case domain.BackendEventTeamMemberRemoved:
		err = h.handleTeamMemberRemoved(ctx, event)
	case domain.BackendEventProjectCreated:
		err = h.handleProjectCreated(ctx, event)
	case domain.BackendEventProjectDeleted:
		err = h.handleProjectDeleted(ctx, event)
	case domain.BackendEventProjectMemberAdded:
		err = h.handleProjectMemberAdded(ctx, event)
	case domain.BackendEventProjectMemberRemoved:
		err = h.handleProjectMemberRemoved(ctx, event)
	default:
		// Ignore events we don't handle
		return
	}

	if err != nil {
		logger.Error().Err(err).Msg("failed to handle backend event")
	} else {
		logger.Debug().Msg("backend event handled")
	}
}

// handleTeamCreated creates a #general channel for the new team.
func (h *BackendEventHandler) handleTeamCreated(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	teamID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	teamName, _ := event.Payload["name"].(string)
	if teamName == "" {
		teamName = "Team"
	}

	actorID, _ := uuid.Parse(event.ActorID)

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		// Check if channel already exists (idempotency)
		var exists bool
		err := tx.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM channels WHERE auto_source = 'team' AND auto_source_id = $1 AND name = 'general')`,
			teamID,
		).Scan(&exists)
		if err != nil {
			return err
		}
		if exists {
			return nil
		}

		// Create the #general channel
		ch := &domain.Channel{
			OrgID:       orgID,
			Name:        "general",
			Description: "General discussion for " + teamName,
			Type:        domain.ChannelTypeTeam,
			TeamID:      &teamID,
		}
		if err := h.channelR.Create(ctx, tx, ch); err != nil {
			return err
		}

		// Set auto-managed fields
		_, err = tx.Exec(ctx,
			`UPDATE channels SET is_auto_managed = true, auto_source = 'team', auto_source_id = $1 WHERE id = $2`,
			teamID, ch.ID,
		)
		if err != nil {
			return err
		}

		// Add the team creator as owner of the channel
		if actorID != uuid.Nil {
			cm := &domain.ChannelMember{
				ChannelID: ch.ID,
				UserID:    actorID,
				Role:      domain.MemberRoleOwner,
			}
			if err := h.memberR.Add(ctx, tx, cm); err != nil {
				log.Warn().Err(err).Str("channel_id", ch.ID.String()).Str("user_id", actorID.String()).Msg("failed to add creator to channel")
			}
		}

		return nil
	})
}

// handleTeamDeleted archives all auto-managed channels for the team.
func (h *BackendEventHandler) handleTeamDeleted(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	teamID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`UPDATE channels SET is_archived = true, updated_at = now() WHERE auto_source = 'team' AND auto_source_id = $1`,
			teamID,
		)
		return err
	})
}

// handleTeamMemberAdded adds a user to all of the team's channels.
func (h *BackendEventHandler) handleTeamMemberAdded(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	teamID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	userIDStr, _ := event.Payload["user_id"].(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return err
	}

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		// Find all channels for this team
		rows, err := tx.Query(ctx,
			`SELECT id FROM channels WHERE auto_source = 'team' AND auto_source_id = $1 AND NOT is_archived`,
			teamID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		var channelIDs []uuid.UUID
		for rows.Next() {
			var cid uuid.UUID
			if err := rows.Scan(&cid); err != nil {
				return err
			}
			channelIDs = append(channelIDs, cid)
		}

		for _, channelID := range channelIDs {
			isMember, err := h.memberR.IsMember(ctx, tx, channelID, userID)
			if err != nil {
				return err
			}
			if !isMember {
				cm := &domain.ChannelMember{
					ChannelID: channelID,
					UserID:    userID,
					Role:      domain.MemberRoleMember,
				}
				if err := h.memberR.Add(ctx, tx, cm); err != nil {
					log.Warn().Err(err).
						Str("channel_id", channelID.String()).
						Str("user_id", userID.String()).
						Msg("failed to add team member to channel")
				}
			}
		}
		return nil
	})
}

// handleTeamMemberRemoved removes a user from all of the team's auto-managed channels.
func (h *BackendEventHandler) handleTeamMemberRemoved(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	teamID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	userIDStr, _ := event.Payload["user_id"].(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return err
	}

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id FROM channels WHERE auto_source = 'team' AND auto_source_id = $1 AND NOT is_archived`,
			teamID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		var channelIDs []uuid.UUID
		for rows.Next() {
			var cid uuid.UUID
			if err := rows.Scan(&cid); err != nil {
				return err
			}
			channelIDs = append(channelIDs, cid)
		}

		for _, channelID := range channelIDs {
			if err := h.memberR.Remove(ctx, tx, channelID, userID); err != nil {
				if err != domain.ErrNotFound {
					log.Warn().Err(err).
						Str("channel_id", channelID.String()).
						Str("user_id", userID.String()).
						Msg("failed to remove team member from channel")
				}
			}
		}
		return nil
	})
}

// handleProjectCreated creates a channel for the new project.
func (h *BackendEventHandler) handleProjectCreated(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	projectID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	projectName, _ := event.Payload["name"].(string)
	if projectName == "" {
		projectName = "Project"
	}

	actorID, _ := uuid.Parse(event.ActorID)

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		var exists bool
		err := tx.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM channels WHERE auto_source = 'project' AND auto_source_id = $1)`,
			projectID,
		).Scan(&exists)
		if err != nil {
			return err
		}
		if exists {
			return nil
		}

		ch := &domain.Channel{
			OrgID:       orgID,
			Name:        projectName,
			Description: "Project channel for " + projectName,
			Type:        domain.ChannelTypeProject,
			ProjectID:   &projectID,
		}
		if err := h.channelR.Create(ctx, tx, ch); err != nil {
			return err
		}

		_, err = tx.Exec(ctx,
			`UPDATE channels SET is_auto_managed = true, auto_source = 'project', auto_source_id = $1 WHERE id = $2`,
			projectID, ch.ID,
		)
		if err != nil {
			return err
		}

		// Add the project creator as owner of the channel
		if actorID != uuid.Nil {
			cm := &domain.ChannelMember{
				ChannelID: ch.ID,
				UserID:    actorID,
				Role:      domain.MemberRoleOwner,
			}
			if err := h.memberR.Add(ctx, tx, cm); err != nil {
				log.Warn().Err(err).Str("channel_id", ch.ID.String()).Str("user_id", actorID.String()).Msg("failed to add creator to project channel")
			}
		}

		return nil
	})
}

// handleProjectDeleted archives all auto-managed channels for the project.
func (h *BackendEventHandler) handleProjectDeleted(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	projectID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`UPDATE channels SET is_archived = true, updated_at = now() WHERE auto_source = 'project' AND auto_source_id = $1`,
			projectID,
		)
		return err
	})
}

// handleProjectMemberAdded adds a user to the project's channel.
func (h *BackendEventHandler) handleProjectMemberAdded(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	projectID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	userIDStr, _ := event.Payload["user_id"].(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return err
	}

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id FROM channels WHERE auto_source = 'project' AND auto_source_id = $1 AND NOT is_archived`,
			projectID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		var channelIDs []uuid.UUID
		for rows.Next() {
			var cid uuid.UUID
			if err := rows.Scan(&cid); err != nil {
				return err
			}
			channelIDs = append(channelIDs, cid)
		}

		for _, channelID := range channelIDs {
			isMember, err := h.memberR.IsMember(ctx, tx, channelID, userID)
			if err != nil {
				return err
			}
			if !isMember {
				cm := &domain.ChannelMember{
					ChannelID: channelID,
					UserID:    userID,
					Role:      domain.MemberRoleMember,
				}
				if err := h.memberR.Add(ctx, tx, cm); err != nil {
					log.Warn().Err(err).
						Str("channel_id", channelID.String()).
						Str("user_id", userID.String()).
						Msg("failed to add project member to channel")
				}
			}
		}
		return nil
	})
}

// handleProjectMemberRemoved removes a user from the project's channels.
func (h *BackendEventHandler) handleProjectMemberRemoved(ctx context.Context, event BackendEvent) error {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return err
	}
	projectID, err := uuid.Parse(event.EntityID)
	if err != nil {
		return err
	}

	userIDStr, _ := event.Payload["user_id"].(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return err
	}

	return h.txMgr.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id FROM channels WHERE auto_source = 'project' AND auto_source_id = $1 AND NOT is_archived`,
			projectID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()

		var channelIDs []uuid.UUID
		for rows.Next() {
			var cid uuid.UUID
			if err := rows.Scan(&cid); err != nil {
				return err
			}
			channelIDs = append(channelIDs, cid)
		}

		for _, channelID := range channelIDs {
			if err := h.memberR.Remove(ctx, tx, channelID, userID); err != nil {
				if err != domain.ErrNotFound {
					log.Warn().Err(err).
						Str("channel_id", channelID.String()).
						Str("user_id", userID.String()).
						Msg("failed to remove project member from channel")
				}
			}
		}
		return nil
	})
}
