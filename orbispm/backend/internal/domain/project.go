package domain

import (
	"time"

	"github.com/google/uuid"
)

// Project represents a project within an organization.
type Project struct {
	ID          uuid.UUID      `json:"id"`
	OrgID       uuid.UUID      `json:"org_id"`
	TeamID      *uuid.UUID     `json:"team_id,omitempty"`  // Legacy single team (nullable after migration 000006)
	TeamIDs     []uuid.UUID    `json:"team_ids,omitempty"` // Multi-team: populated from project_teams
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Status      string         `json:"status"`
	Settings    map[string]any `json:"settings,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// ProjectMember represents a user's role within a project.
type ProjectMember struct {
	ProjectID      uuid.UUID  `json:"project_id"`
	UserID         uuid.UUID  `json:"user_id"`
	Email          string     `json:"email"`
	DisplayName    string     `json:"display_name,omitempty"`
	AvatarURL      string     `json:"avatar_url,omitempty"`
	Role           string     `json:"role"`
	Source         string     `json:"source,omitempty"` // "direct" or "team"
	SourceTeamID   *uuid.UUID `json:"source_team_id,omitempty"`
	SourceTeamName string     `json:"source_team_name,omitempty"`
	JoinedAt       time.Time  `json:"joined_at"`
}
