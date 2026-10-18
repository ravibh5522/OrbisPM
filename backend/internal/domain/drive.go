package domain

import (
	"net/http"
	"time"

	"github.com/google/uuid"
)

// DriveScope identifies the kind of space an item lives in.
type DriveScope string

const (
	DriveScopeOrg     DriveScope = "org"
	DriveScopeTeam    DriveScope = "team"
	DriveScopeProject DriveScope = "project"
	DriveScopeUser    DriveScope = "user"
)

// ParseDriveScope validates a client-supplied scope.
func ParseDriveScope(s string) (DriveScope, bool) {
	switch DriveScope(s) {
	case DriveScopeOrg, DriveScopeTeam, DriveScopeProject, DriveScopeUser:
		return DriveScope(s), true
	}
	return "", false
}

// DriveRole is an item-level role. The zero value means no access.
type DriveRole string

const (
	DriveRoleNone    DriveRole = ""
	DriveRoleViewer  DriveRole = "viewer"
	DriveRoleEditor  DriveRole = "editor"
	DriveRoleManager DriveRole = "manager"
)

// ParseDriveRole validates a client-supplied role; "none" is not grantable.
func ParseDriveRole(s string) (DriveRole, bool) {
	switch DriveRole(s) {
	case DriveRoleViewer, DriveRoleEditor, DriveRoleManager:
		return DriveRole(s), true
	}
	return DriveRoleNone, false
}

// Rank orders roles: none < viewer < editor < manager.
func (r DriveRole) Rank() int {
	switch r {
	case DriveRoleViewer:
		return 1
	case DriveRoleEditor:
		return 2
	case DriveRoleManager:
		return 3
	}
	return 0
}

// AtLeast reports whether r grants at least min.
func (r DriveRole) AtLeast(min DriveRole) bool { return r.Rank() >= min.Rank() }

// MaxDriveRole returns the stronger of two roles.
func MaxDriveRole(a, b DriveRole) DriveRole {
	if b.Rank() > a.Rank() {
		return b
	}
	return a
}

// Drive item kinds.
const (
	DriveKindFolder = "folder"
	DriveKindFile   = "file"
)

// DriveUserRef is the joined display info for a user.
type DriveUserRef struct {
	ID          uuid.UUID `json:"id"`
	DisplayName string    `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url"`
}

// DriveItem is a folder or file in a space.
type DriveItem struct {
	ID          uuid.UUID     `json:"id"`
	OrgID       uuid.UUID     `json:"org_id"`
	Scope       DriveScope    `json:"scope"`
	ScopeID     uuid.UUID     `json:"scope_id"` // team / project / owner user / org id
	ParentID    *uuid.UUID    `json:"parent_id"`
	AncestorIDs []uuid.UUID   `json:"-"` // root → parent
	Kind        string        `json:"kind"`
	Name        string        `json:"name"`
	MimeType    *string       `json:"mime_type"`
	SizeBytes   *int64        `json:"size_bytes"`
	StorageKey  *string       `json:"-"`
	SHA256      *string       `json:"-"`
	CreatedBy   uuid.UUID     `json:"created_by"`
	Creator     *DriveUserRef `json:"creator"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
	TrashedAt   *time.Time    `json:"trashed_at"`
	MyRole      DriveRole     `json:"my_role"` // filled by the service, never stored
	Shared      bool          `json:"shared"`
	SpaceName   *string       `json:"space_name"`
}

// DriveShare is an explicit grant on an item and its descendants.
type DriveShare struct {
	ID               uuid.UUID  `json:"id"`
	OrgID            uuid.UUID  `json:"-"`
	ItemID           uuid.UUID  `json:"item_id"`
	GranteeType      string     `json:"grantee_type"`
	GranteeID        uuid.UUID  `json:"grantee_id"`
	GranteeName      string     `json:"grantee_name"`
	GranteeAvatarURL *string    `json:"grantee_avatar_url"`
	Role             DriveRole  `json:"role"`
	CreatedBy        uuid.UUID  `json:"created_by"`
	CreatedAt        time.Time  `json:"created_at"`
	ExpiresAt        *time.Time `json:"expires_at"`
	Inherited        bool       `json:"inherited"`
	SourceItemID     uuid.UUID  `json:"source_item_id"`
	SourceItemName   string     `json:"source_item_name"`
}

// Drive share grantee types.
const (
	DriveGranteeUser    = "user"
	DriveGranteeTeam    = "team"
	DriveGranteeProject = "project"
	DriveGranteeOrg     = "org"
)

// DriveSpace is one browsable space.
type DriveSpace struct {
	Scope   DriveScope `json:"scope"`
	ScopeID uuid.UUID  `json:"scope_id"`
	Name    string     `json:"name"`
	MyRole  DriveRole  `json:"my_role,omitempty"`
}

// DriveBreadcrumb is one folder on the path to an item.
type DriveBreadcrumb struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

// Drive-specific errors.
var (
	ErrDriveFileTooLarge = &AppError{Code: http.StatusRequestEntityTooLarge, Message: "file too large"}
	ErrDriveInvalid      = &AppError{Code: http.StatusUnprocessableEntity, Message: "invalid drive request"}
)
