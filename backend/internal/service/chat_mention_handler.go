package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/eventbus"
	"github.com/orbispm/orbispm/internal/worker"
)

const chatMentionEventType = "message.mention"

// ChatMentionHandler subscribes to mention events published by the messaging
// service and enqueues in-app + email notifications for each mentioned user.
type ChatMentionHandler struct {
	asynqClient *asynq.Client
	subscriber  *eventbus.RedisSubscriber
}

// NewChatMentionHandler creates a new ChatMentionHandler.
func NewChatMentionHandler(asynqClient *asynq.Client, subscriber *eventbus.RedisSubscriber) *ChatMentionHandler {
	return &ChatMentionHandler{asynqClient: asynqClient, subscriber: subscriber}
}

// Start begins listening for mention events. It runs until ctx is cancelled.
func (h *ChatMentionHandler) Start(ctx context.Context) error {
	return h.subscriber.Subscribe(ctx, chatMentionEventType, func(event domain.DomainEvent) {
		h.handleMentionEvent(ctx, event)
	})
}

func (h *ChatMentionHandler) handleMentionEvent(ctx context.Context, event domain.DomainEvent) {
	if event.Payload == nil {
		return
	}

	orgID := event.OrgID
	senderName, _ := event.Payload["sender_name"].(string)
	channelName, _ := event.Payload["channel_name"].(string)
	messageBody, _ := event.Payload["message_body"].(string)
	channelID, _ := event.Payload["channel_id"].(string)
	messageID, _ := event.Payload["message_id"].(string)

	if senderName == "" {
		senderName = "Someone"
	}

	title := fmt.Sprintf("%s mentioned you", senderName)
	if channelName != "" {
		title = fmt.Sprintf("%s mentioned you in #%s", senderName, channelName)
	}

	// mentioned_user_ids comes as []interface{} when deserialized from JSON.
	mentionedIDs, _ := event.Payload["mentioned_user_ids"].([]interface{})
	for _, raw := range mentionedIDs {
		userID, ok := raw.(string)
		if !ok || userID == "" {
			continue
		}

		notifPayload := worker.NotificationPayload{
			UserID: userID,
			OrgID:  orgID,
			Type:   chatMentionEventType,
			Title:  title,
			Body:   messageBody,
			Payload: map[string]any{
				"channel_id": channelID,
				"message_id": messageID,
				"sender_id":  event.ActorID,
			},
		}

		data, err := json.Marshal(notifPayload)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to marshal mention notification payload")
			continue
		}

		task := asynq.NewTask(worker.TypeNotification, data)
		if _, err := h.asynqClient.EnqueueContext(ctx, task); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to enqueue mention notification")
		} else {
			log.Debug().Str("user_id", userID).Str("channel_id", channelID).Msg("mention notification enqueued")
		}
	}
}
