package domain

import (
	"time"

	"github.com/google/uuid"
)

// Permission represents a canonical permission in the system.
type Permission struct {
	ID          uuid.UUID `json:"id"`
	Resource    string    `json:"resource"`
	Action      string    `json:"action"`
	Scope       string    `json:"scope"` // "org", "team", "project"
	Description string    `json:"description,omitempty"`
}

// Role represents a DB-driven role definition.
type Role struct {
	ID          uuid.UUID    `json:"id"`
	OrgID       uuid.UUID    `json:"org_id"`
	Scope       string       `json:"scope"` // "org", "team", "project"
	Slug        string       `json:"slug"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	IsSystem    bool         `json:"is_system"`
	CreatedAt   time.Time    `json:"created_at"`
	Permissions []Permission `json:"permissions,omitempty"` // populated on demand
}

// RolePermission represents the join between a role and a permission.
type RolePermission struct {
	RoleID       uuid.UUID `json:"role_id"`
	PermissionID uuid.UUID `json:"permission_id"`
}

// Scope constants for roles and permissions.
const (
	ScopeOrg     = "org"
	ScopeTeam    = "team"
	ScopeProject = "project"
)

// EffectiveMember represents a project member with their source information.
type EffectiveMember struct {
	UserID         uuid.UUID  `json:"user_id"`
	Email          string     `json:"email"`
	DisplayName    string     `json:"display_name,omitempty"`
	AvatarURL      string     `json:"avatar_url,omitempty"`
	Role           string     `json:"role"`
	Source         string     `json:"source"`                    // "direct" or "team"
	SourceTeamID   *uuid.UUID `json:"source_team_id,omitempty"`
	SourceTeamName string     `json:"source_team_name,omitempty"`
}

// ProjectTeam represents the link between a project and a team.
type ProjectTeam struct {
	ProjectID uuid.UUID `json:"project_id"`
	TeamID    uuid.UUID `json:"team_id"`
	TeamName  string    `json:"team_name,omitempty"` // populated on read
	AddedAt   time.Time `json:"added_at"`
}
