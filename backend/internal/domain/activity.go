package domain

import (
	"time"

	"github.com/google/uuid"
)

// ActivityLog represents an immutable audit trail entry.
type ActivityLog struct {
	ID         uuid.UUID      `json:"id"`
	OrgID      uuid.UUID      `json:"org_id"`
	EntityType string         `json:"entity_type"`
	EntityID   uuid.UUID      `json:"entity_id"`
	Action     string         `json:"action"`
	ActorID    uuid.UUID      `json:"actor_id"`
	Changes    map[string]any `json:"changes,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`

	// EntityName is the task/project/team title, filled in when listing so
	// clients show it instead of EntityID. Not stored.
	EntityName string `json:"entity_name,omitempty"`
}
