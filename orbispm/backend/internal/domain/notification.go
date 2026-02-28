package domain

import (
	"time"

	"github.com/google/uuid"
)

// Notification represents an in-app notification.
type Notification struct {
	ID        uuid.UUID      `json:"id"`
	UserID    uuid.UUID      `json:"user_id"`
	OrgID     uuid.UUID      `json:"org_id"`
	Type      string         `json:"type"`
	Title     string         `json:"title"`
	Body      string         `json:"body"`
	Payload   map[string]any `json:"payload,omitempty"`
	ReadAt    *time.Time     `json:"read_at,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}

// NotificationPreference represents a user's notification channel preference.
type NotificationPreference struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	OrgID     uuid.UUID `json:"org_id"`
	EventType string    `json:"event_type"`
	Channel   string    `json:"channel"`
	Enabled   bool      `json:"enabled"`
}
