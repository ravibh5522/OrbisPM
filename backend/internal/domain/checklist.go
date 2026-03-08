package domain

import (
	"time"

	"github.com/google/uuid"
)

// Checklist represents a checklist item within a task.
type Checklist struct {
	ID        uuid.UUID `json:"id"`
	OrgID     uuid.UUID `json:"org_id"`
	TaskID    uuid.UUID `json:"task_id"`
	Title     string    `json:"title"`
	IsChecked bool      `json:"is_checked"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
}
