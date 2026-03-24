package eventbus

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
)

const channelPrefix = "orbispm:events:"

// RedisPublisher publishes domain events via Redis Pub/Sub.
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

	log.Debug().Str("type", event.Type).Str("entity_id", event.EntityID).Msg("event published")
	return nil
}

// RedisSubscriber subscribes to domain events via Redis Pub/Sub.
type RedisSubscriber struct {
	rdb    *redis.Client
	pubsub *redis.PubSub
}

// NewRedisSubscriber creates a new Redis event subscriber.
func NewRedisSubscriber(rdb *redis.Client) *RedisSubscriber {
	return &RedisSubscriber{rdb: rdb}
}

// Subscribe listens for events of the given type.
func (s *RedisSubscriber) Subscribe(ctx context.Context, eventType string, handler func(domain.DomainEvent)) error {
	channel := channelPrefix + eventType
	s.pubsub = s.rdb.Subscribe(ctx, channel)

	go func() {
		ch := s.pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				var event domain.DomainEvent
				if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
					log.Error().Err(err).Str("channel", msg.Channel).Msg("failed to unmarshal event")
					continue
				}
				handler(event)
			}
		}
	}()

	return nil
}

// SubscribeAll listens for all domain events using pattern subscribe.
func (s *RedisSubscriber) SubscribeAll(ctx context.Context, handler func(domain.DomainEvent)) error {
	s.pubsub = s.rdb.PSubscribe(ctx, channelPrefix+"*")

	go func() {
		ch := s.pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				var event domain.DomainEvent
				if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
					log.Error().Err(err).Str("channel", msg.Channel).Msg("failed to unmarshal event")
					continue
				}
				handler(event)
			}
		}
	}()

	return nil
}

// Close closes the subscriber.
func (s *RedisSubscriber) Close() error {
	if s.pubsub != nil {
		return s.pubsub.Close()
	}
	return nil
}
