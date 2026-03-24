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
func NewPublisher(nc *nats.Conn) (*Publisher, error) {
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, fmt.Errorf("create jetstream context: %w", err)
	}

	// Create or update the CHAT stream
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:        domain.NatsStreamName,
		Description: "OrbisPM chat events",
		Subjects:    []string{domain.NatsSubjectChat + ".>"},
		Retention:   jetstream.WorkQueuePolicy,
		MaxAge:      24 * time.Hour,
		Storage:     jetstream.FileStorage,
		Replicas:    1,
	})
	if err != nil {
		return nil, fmt.Errorf("create/update stream: %w", err)
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
