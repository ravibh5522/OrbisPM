package domain

import (
	"time"

	"github.com/google/uuid"
)

// TaskTemplate represents a reusable task structure template.
type TaskTemplate struct {
	ID          uuid.UUID      `json:"id"`
	OrgID       uuid.UUID      `json:"org_id"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Structure   map[string]any `json:"structure"`
	IsShared    bool           `json:"is_shared"`
	CreatedBy   uuid.UUID      `json:"created_by"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}
