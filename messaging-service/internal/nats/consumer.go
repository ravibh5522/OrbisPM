package nats

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
)

// EventHandler is called for each received domain event.
type EventHandler func(event domain.DomainEvent)

// Consumer subscribes to NATS JetStream and delivers events to a handler.
type Consumer struct {
	js      jetstream.JetStream
	handler EventHandler
}

// NewConsumer creates a new NATS JetStream consumer.
func NewConsumer(nc *nats.Conn, handler EventHandler) (*Consumer, error) {
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, fmt.Errorf("create jetstream context: %w", err)
	}
	return &Consumer{js: js, handler: handler}, nil
}

// Start begins consuming events from the CHAT stream. Blocks until ctx is canceled.
func (c *Consumer) Start(ctx context.Context) error {
	stream, err := c.js.Stream(ctx, domain.NatsStreamName)
	if err != nil {
		return fmt.Errorf("get stream: %w", err)
	}

	consumer, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       domain.NatsConsumerDurable,
		AckPolicy:     jetstream.AckExplicitPolicy,
		DeliverPolicy: jetstream.DeliverAllPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    5,
		FilterSubject: domain.NatsSubjectChat + ".>",
	})
	if err != nil {
		return fmt.Errorf("create consumer: %w", err)
	}

	log.Info().
		Str("consumer", domain.NatsConsumerDurable).
		Str("stream", domain.NatsStreamName).
		Msg("NATS consumer started")

	iter, err := consumer.Messages()
	if err != nil {
		return fmt.Errorf("start message iterator: %w", err)
	}

	go func() {
		<-ctx.Done()
		iter.Stop()
	}()

	for {
		msg, err := iter.Next()
		if err != nil {
			return nil // iterator stopped
		}
		var event domain.DomainEvent
		if err := json.Unmarshal(msg.Data(), &event); err != nil {
			log.Error().Err(err).Msg("failed to unmarshal NATS event")
			if err := msg.Nak(); err != nil {
				log.Error().Err(err).Msg("failed to nak message")
			}
			continue
		}

		c.handler(event)

		if err := msg.Ack(); err != nil {
			log.Error().Err(err).Msg("failed to ack message")
		}
	}
}
