package domain

import (
	"time"

	"github.com/google/uuid"
)

// User represents a user entity (mirrors GoTrue user).
type User struct {
	ID    uuid.UUID
	Email string
	Name  string
}

// Org-level role slugs (reference only — actual roles are DB-driven via `roles` table).
const (
	RoleOrgOwner        = "owner"
	RoleOrgAdmin        = "admin"
	RoleOrgMember       = "member"
	RoleOrgViewer       = "viewer"
	RoleOrgBillingAdmin = "billing_admin"
)

// Team-level role slugs.
const (
	RoleTeamLead   = "team_lead"
	RoleTeamMember = "member"
)

// Project-level role slugs.
const (
	RoleProjectLead        = "lead"
	RoleProjectContributor = "contributor"
	RoleProjectReviewer    = "reviewer"
	RoleProjectObserver    = "observer"
)

// Deprecated: CustomRole is replaced by domain.Role with DB-driven permissions.
// Kept for backward compatibility during migration.
type CustomRole struct {
	ID          uuid.UUID      `json:"id"`
	OrgID       uuid.UUID      `json:"org_id"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Permissions map[string]any `json:"permissions"`
	CreatedAt   time.Time      `json:"created_at"`
}

// DefaultTeamProjectRoleMap is the default mapping of team roles to project roles.
// Stored in orgs.settings.team_project_role_map JSONB and configurable per org.
var DefaultTeamProjectRoleMap = map[string]string{
	"team_lead": "lead",
	"member":    "contributor",
	"viewer":    "observer",
}
