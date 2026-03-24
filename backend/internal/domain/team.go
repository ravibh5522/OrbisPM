package domain

import (
	"time"

	"github.com/google/uuid"
)

// Team represents a team within an organization.
type Team struct {
	ID            uuid.UUID  `json:"id"`
	OrgID         uuid.UUID  `json:"org_id"`
	Name          string     `json:"name"`
	Description   string     `json:"description,omitempty"`
	ManagerID     *uuid.UUID `json:"manager_id,omitempty"`
	IsAutoManaged bool       `json:"is_auto_managed"`
	AutoSource    string     `json:"auto_source,omitempty"`
	AutoSourceID  string     `json:"auto_source_id,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`

	// Joined fields (not stored)
	ManagerName string `json:"manager_name,omitempty"`
	MemberCount int    `json:"member_count,omitempty"`
}

// TeamMember represents a user's membership in a team.
type TeamMember struct {
	TeamID      uuid.UUID `json:"team_id"`
	UserID      uuid.UUID `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name,omitempty"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
}

// TeamManagerHistory tracks changes to team manager assignments.
type TeamManagerHistory struct {
	ID                uuid.UUID  `json:"id"`
	TeamID            uuid.UUID  `json:"team_id"`
	OrgID             uuid.UUID  `json:"org_id"`
	PreviousManagerID *uuid.UUID `json:"previous_manager_id,omitempty"`
	NewManagerID      *uuid.UUID `json:"new_manager_id,omitempty"`
	ChangedBy         uuid.UUID  `json:"changed_by"`
	Reason            string     `json:"reason,omitempty"`
	ChangedAt         time.Time  `json:"changed_at"`
}
