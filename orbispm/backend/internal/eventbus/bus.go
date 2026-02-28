package eventbus

import (
	"context"

	"github.com/orbispm/orbispm/internal/domain"
)

// Publisher publishes domain events.
type Publisher interface {
	Publish(ctx context.Context, event domain.DomainEvent) error
}

// Subscriber subscribes to domain events.
type Subscriber interface {
	Subscribe(ctx context.Context, eventType string, handler func(domain.DomainEvent)) error
	Close() error
}

// Handler processes domain events.
type Handler func(ctx context.Context, event domain.DomainEvent) error
