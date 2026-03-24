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

// Publisher publishes domain events to NATS JetStream.
type Publisher struct {
	js jetstream.JetStream
}

// NewPublisher creates a new NATS JetStream publisher and ensures the stream exists.
// It retries stream creation with backoff to tolerate JetStream initialisation lag
// (e.g. file-storage recovery on a freshly-started NATS container).
func NewPublisher(nc *nats.Conn) (*Publisher, error) {
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, fmt.Errorf("create jetstream context: %w", err)
	}

	streamCfg := jetstream.StreamConfig{
		Name:        domain.NatsStreamName,
		Description: "OrbisPM chat events",
		Subjects:    []string{domain.NatsSubjectChat + ".>"},
		Retention:   jetstream.WorkQueuePolicy,
		MaxAge:      24 * time.Hour,
		Storage:     jetstream.FileStorage,
		Replicas:    1,
	}

	const maxAttempts = 10
	backoff := 2 * time.Second
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		_, lastErr = js.CreateOrUpdateStream(ctx, streamCfg)
		cancel()
		if lastErr == nil {
			break
		}
		log.Warn().
			Err(lastErr).
			Int("attempt", attempt).
			Int("max", maxAttempts).
			Dur("retry_in", backoff).
			Msg("NATS JetStream not ready, retrying...")
		time.Sleep(backoff)
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
	if lastErr != nil {
		return nil, fmt.Errorf("create/update stream: %w", lastErr)
	}

	log.Info().Str("stream", domain.NatsStreamName).Msg("NATS JetStream stream ready")
	return &Publisher{js: js}, nil
}

// Publish publishes a domain event to NATS JetStream.
// Subject format: chat.<org_id>.<event_type>
func (p *Publisher) Publish(ctx context.Context, event domain.DomainEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	subject := fmt.Sprintf("%s.%s.%s", domain.NatsSubjectChat, event.OrgID, event.Type)
	_, err = p.js.Publish(ctx, subject, data)
	if err != nil {
		return fmt.Errorf("publish event: %w", err)
	}

	log.Debug().
		Str("subject", subject).
		Str("type", event.Type).
		Str("org_id", event.OrgID).
		Msg("event published to NATS")
	return nil
}
