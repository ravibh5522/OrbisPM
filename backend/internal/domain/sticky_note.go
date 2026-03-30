package domain

import (
	"time"

	"github.com/google/uuid"
)

// Checkpoint represents a single checkbox item in a sticky note.
type Checkpoint struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Checked bool   `json:"checked"`
}

// StickyNote represents a personal todo sticky note.
type StickyNote struct {
	ID          uuid.UUID    `json:"id"`
	UserID      uuid.UUID    `json:"user_id"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Color       string       `json:"color"`
	Priority    string       `json:"priority"`
	StartDate   *time.Time   `json:"start_date,omitempty"`
	DueDate     *time.Time   `json:"due_date,omitempty"`
	Completed   bool         `json:"completed"`
	Checkpoints []Checkpoint `json:"checkpoints"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

// StickyNoteStats holds aggregate stats for a user's sticky notes.
type StickyNoteStats struct {
	Total     int `json:"total"`
	Completed int `json:"completed"`
	Overdue   int `json:"overdue"`
	Upcoming  int `json:"upcoming"`
}
