package domain

import (
	"time"

	"github.com/google/uuid"
)

// Comment represents a comment on a task.
type Comment struct {
	ID        uuid.UUID  `json:"id"`
	OrgID     uuid.UUID  `json:"org_id"`
	TaskID    uuid.UUID  `json:"task_id"`
	UserID    uuid.UUID  `json:"user_id"`
	Body      string     `json:"body"`
	ParentID  *uuid.UUID `json:"parent_id,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}
