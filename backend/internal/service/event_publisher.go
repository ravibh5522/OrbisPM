package service

import (
	"context"

	"github.com/orbispm/orbispm/internal/domain"
)

// EventPublisher is an interface for publishing domain events (e.g. to Redis Pub/Sub).
type EventPublisher interface {
	Publish(ctx context.Context, event domain.DomainEvent) error
}
