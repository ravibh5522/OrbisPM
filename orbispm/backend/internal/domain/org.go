package domain

import (
	"time"

	"github.com/google/uuid"
)

// Org represents an organization (top-level tenant).
type Org struct {
	ID                uuid.UUID      `json:"id"`
	Name              string         `json:"name"`
	Slug              string         `json:"slug"`
	LogoURL           string         `json:"logo_url,omitempty"`
	Plan              string         `json:"plan"`
	BillingCustomerID string         `json:"billing_customer_id,omitempty"`
	Settings          map[string]any `json:"settings,omitempty"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
}

// OrgMember represents a user's membership in an organization.
type OrgMember struct {
	OrgID       uuid.UUID `json:"org_id"`
	UserID      uuid.UUID `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name,omitempty"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
}
