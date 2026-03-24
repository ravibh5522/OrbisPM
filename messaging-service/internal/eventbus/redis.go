package eventbus

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
)

const channelPrefix = "orbispm:events:"

// RedisPublisher publishes domain events to Redis Pub/Sub so the backend
// OrgHub can broadcast chat notifications (e.g. unread badges) to all
// org members, even those not on the messages page.
type RedisPublisher struct {
	rdb *redis.Client
}

// NewRedisPublisher creates a new Redis event publisher.
func NewRedisPublisher(rdb *redis.Client) *RedisPublisher {
	return &RedisPublisher{rdb: rdb}
}

// Publish publishes a domain event to the Redis channel.
func (p *RedisPublisher) Publish(ctx context.Context, event domain.DomainEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	channel := channelPrefix + event.Type
	if err := p.rdb.Publish(ctx, channel, data).Err(); err != nil {
		return fmt.Errorf("publish to %s: %w", channel, err)
	}

	log.Debug().Str("type", event.Type).Str("channel", channel).Msg("chat event published to Redis")
	return nil
}
