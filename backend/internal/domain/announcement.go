package domain

import (
	"time"

	"github.com/google/uuid"
)

// Announcement priority constants.
const (
	AnnouncementPriorityLow    = "low"
	AnnouncementPriorityNormal = "normal"
	AnnouncementPriorityHigh   = "high"
	AnnouncementPriorityUrgent = "urgent"
)

// Announcement represents an org-wide or project-scoped announcement.
type Announcement struct {
	ID          uuid.UUID  `json:"id"`
	OrgID       uuid.UUID  `json:"org_id"`
	ProjectID   *uuid.UUID `json:"project_id,omitempty"`
	AuthorID    uuid.UUID  `json:"author_id"`
	Title       string     `json:"title"`
	Body        string     `json:"body"`
	Priority    string     `json:"priority"`
	Pinned      bool       `json:"pinned"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	ReadCount   int        `json:"read_count"`
	Unread      bool       `json:"unread"`
}

// AnnouncementRead tracks which users have read an announcement.
type AnnouncementRead struct {
	AnnouncementID uuid.UUID `json:"announcement_id"`
	UserID         uuid.UUID `json:"user_id"`
	ReadAt         time.Time `json:"read_at"`
}

// Validate checks that required fields are present and values are valid.
func (a *Announcement) Validate() error {
	if a.Title == "" {
		return ErrBadRequest.WithDetail("title is required")
	}
	if a.Body == "" {
		return ErrBadRequest.WithDetail("body is required")
	}
	switch a.Priority {
	case AnnouncementPriorityLow, AnnouncementPriorityNormal, AnnouncementPriorityHigh, AnnouncementPriorityUrgent:
		// valid
	default:
		return ErrBadRequest.WithDetail("priority must be one of: low, normal, high, urgent")
	}
	return nil
}
