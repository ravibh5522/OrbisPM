package domain

import (
	"github.com/google/uuid"
)

// User represents a user entity (mirrors GoTrue user).
type User struct {
	ID    uuid.UUID
	Email string
	Name  string
}

// Org-level roles.
const (
	RoleOrgOwner       = "owner"
	RoleOrgAdmin       = "admin"
	RoleOrgMember      = "member"
	RoleOrgViewer      = "viewer"
	RoleOrgBillingAdmin = "billing_admin"
)

// Team-level roles.
const (
	RoleTeamLead   = "team_lead"
	RoleTeamMember = "member"
)

// Project-level roles.
const (
	RoleProjectLead        = "lead"
	RoleProjectContributor = "contributor"
	RoleProjectReviewer    = "reviewer"
	RoleProjectObserver    = "observer"
)

// CustomRole represents an org-specific custom role.
type CustomRole struct {
	ID          uuid.UUID      `json:"id"`
	OrgID       uuid.UUID      `json:"org_id"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Permissions map[string]any `json:"permissions"`
}
