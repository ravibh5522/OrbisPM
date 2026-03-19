package domain

import (
	"time"

	"github.com/google/uuid"
)

// ChannelType defines the type of a channel.
type ChannelType string

const (
	ChannelTypeDM      ChannelType = "dm"
	ChannelTypeGroup   ChannelType = "group"
	ChannelTypeTeam    ChannelType = "team"
	ChannelTypeProject ChannelType = "project"
)

// MemberRole defines a member's role within a channel.
type MemberRole string

const (
	MemberRoleOwner  MemberRole = "owner"
	MemberRoleAdmin  MemberRole = "admin"
	MemberRoleMember MemberRole = "member"
)

// MessageFormat defines the format for message body content.
type MessageFormat string

const (
	MessageFormatText     MessageFormat = "text"
	MessageFormatMarkdown MessageFormat = "markdown"
)

// MaxMessageLength is the maximum allowed message body length.
const MaxMessageLength = 4000

// EditWindowMinutes is how long a user can edit their own message.
const EditWindowMinutes = 15

// Channel represents a conversation (DM, group, team, or project).
type Channel struct {
	ID          uuid.UUID   `json:"id"`
	OrgID       uuid.UUID   `json:"org_id"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Type        ChannelType `json:"type"`
	TeamID      *uuid.UUID  `json:"team_id,omitempty"`
	ProjectID   *uuid.UUID  `json:"project_id,omitempty"`
	IsArchived  bool        `json:"is_archived"`
	DMPair      string      `json:"dm_pair,omitempty"`
	AvatarURL   string      `json:"avatar_url,omitempty"`
	CreatedBy   uuid.UUID   `json:"created_by"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`

	// Aggregated fields (not stored in channels table).
	MemberCount  int        `json:"member_count,omitempty"`
	UnreadCount  int        `json:"unread_count"`
	IsMuted      bool       `json:"is_muted"`
	IsPinned     bool       `json:"is_pinned"`
	LastMessage  string     `json:"last_message,omitempty"`
	LastActivity *time.Time `json:"last_activity,omitempty"`
}

// ChannelMember represents a user's membership in a channel.
type ChannelMember struct {
	ChannelID  uuid.UUID  `json:"channel_id"`
	UserID     uuid.UUID  `json:"user_id"`
	Role       MemberRole `json:"role"`
	LastReadAt *time.Time `json:"last_read_at,omitempty"`
	IsMuted    bool       `json:"is_muted"`
	IsPinned   bool       `json:"is_pinned"`
	JoinedAt   time.Time  `json:"joined_at"`

	// Joined fields.
	DisplayName string `json:"display_name,omitempty"`
	Email       string `json:"email,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}

// Message represents a chat message.
type Message struct {
	ID              uuid.UUID     `json:"id"`
	OrgID           uuid.UUID     `json:"org_id"`
	ChannelID       uuid.UUID     `json:"channel_id"`
	UserID          uuid.UUID     `json:"user_id"`
	Body            string        `json:"body"`
	BodyFormat      MessageFormat `json:"body_format"`
	ParentMessageID *uuid.UUID    `json:"parent_message_id,omitempty"`
	ThreadCount     int           `json:"thread_count"`
	ForwardedFromID *uuid.UUID    `json:"forwarded_from_id,omitempty"`
	Mentions        []uuid.UUID   `json:"mentions,omitempty"`
	IsDeleted       bool          `json:"is_deleted"`
	DeletedAt       *time.Time    `json:"deleted_at,omitempty"`
	IsEdited        bool          `json:"is_edited"`
	EditedAt        *time.Time    `json:"edited_at,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`

	// Joined fields.
	SenderName   string          `json:"sender_name,omitempty"`
	SenderAvatar string          `json:"sender_avatar,omitempty"`
	Reactions    []ReactionGroup `json:"reactions"`
	Attachments  []Attachment    `json:"attachments"`
}

// Reaction represents an emoji reaction on a message.
type Reaction struct {
	MessageID uuid.UUID `json:"message_id"`
	UserID    uuid.UUID `json:"user_id"`
	Emoji     string    `json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
}

// ReactionGroup is an aggregated view of reactions on a message.
type ReactionGroup struct {
	Emoji string      `json:"emoji"`
	Count int         `json:"count"`
	Users []uuid.UUID `json:"users"`
}

// Attachment represents a file attached to a message.
type Attachment struct {
	ID          uuid.UUID      `json:"id"`
	OrgID       uuid.UUID      `json:"org_id"`
	MessageID   uuid.UUID      `json:"message_id"`
	FileName    string         `json:"file_name"`
	FileSize    int64          `json:"file_size"`
	ContentType string         `json:"content_type"`
	StorageKey  string         `json:"-"` // Never expose to client
	URL         string         `json:"url,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
}

// PinnedMessage represents a pinned message in a channel.
type PinnedMessage struct {
	ChannelID uuid.UUID `json:"channel_id"`
	MessageID uuid.UUID `json:"message_id"`
	PinnedBy  uuid.UUID `json:"pinned_by"`
	PinnedAt  time.Time `json:"pinned_at"`
	Message   *Message  `json:"message,omitempty"`
}

// Bookmark represents a user's personal bookmarked message.
type Bookmark struct {
	UserID    uuid.UUID `json:"user_id"`
	MessageID uuid.UUID `json:"message_id"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
	Message   *Message  `json:"message,omitempty"`
}

// ReadReceipt represents a user's last-read position in a channel.
type ReadReceipt struct {
	ChannelID  uuid.UUID `json:"channel_id"`
	UserID     uuid.UUID `json:"user_id"`
	LastReadAt time.Time `json:"last_read_at"`
}

// TypingIndicator is an ephemeral presence event (not persisted).
type TypingIndicator struct {
	ChannelID uuid.UUID `json:"channel_id"`
	UserID    uuid.UUID `json:"user_id"`
	IsTyping  bool      `json:"is_typing"`
}

// ─── Sidebar Models ───────────────────────────

// SidebarTeam represents a team with its channels (for sidebar).
type SidebarTeam struct {
	ID        uuid.UUID  `json:"id"`
	Name      string     `json:"name"`
	ManagerID *uuid.UUID `json:"manager_id,omitempty"`
	Channels  []Channel  `json:"channels"`
}

// SidebarCategory represents a channel category for Discord-style sidebar.
type SidebarCategory struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Position     int       `json:"position"`
	IsCollapsed  bool      `json:"is_collapsed"`
	AutoSource   string    `json:"auto_source,omitempty"`
	AutoSourceID string    `json:"auto_source_id,omitempty"`
	Channels     []Channel `json:"channels"`
}

// SidebarData is the hierarchical sidebar response.
type SidebarData struct {
	Categories      []SidebarCategory `json:"categories"`
	Teams           []SidebarTeam     `json:"teams"`
	ProjectChannels []Channel         `json:"project_channels"`
	DMChannels      []Channel         `json:"dm_channels"`
	GroupChannels   []Channel         `json:"group_channels"`
}

// ─── Entity Mention Models ────────────────────

// EntityMention represents a rich mention in a message (@user, #project, etc.)
type EntityMention struct {
	Type string    `json:"type"` // user, task, project, team
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

// ─── OrgMember (read from main backend) ───────

// OrgMemberInfo is a lightweight user representation.
type OrgMemberInfo struct {
	UserID      uuid.UUID `json:"user_id"`
	DisplayName string    `json:"display_name"`
	Email       string    `json:"email"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
}

// ─── Channel Categories ───────────────────────

// ChannelCategory represents a Discord-style grouping for channels.
type ChannelCategory struct {
	ID           uuid.UUID  `json:"id"`
	OrgID        uuid.UUID  `json:"org_id"`
	Name         string     `json:"name"`
	Position     int        `json:"position"`
	AutoSource   string     `json:"auto_source,omitempty"`
	AutoSourceID *uuid.UUID `json:"auto_source_id,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// SystemMessage represents automatic messages posted by the system.
type SystemMessage struct {
	Type     string         `json:"type"`     // member_added, member_removed, channel_created, task_assigned, etc.
	Body     string         `json:"body"`     // Human-readable text
	Metadata map[string]any `json:"metadata"` // Machine-readable context
}

// ─── Backend Event Types ──────────────────────

// BackendEvent types that the messaging service listens for.
const (
	BackendEventTeamCreated          = "team.created"
	BackendEventTeamUpdated          = "team.updated"
	BackendEventTeamDeleted          = "team.deleted"
	BackendEventTeamManagerChanged   = "team.manager_changed"
	BackendEventTeamMemberAdded      = "team.member_added"
	BackendEventTeamMemberRemoved    = "team.member_removed"
	BackendEventProjectCreated       = "project.created"
	BackendEventProjectUpdated       = "project.updated"
	BackendEventProjectDeleted       = "project.deleted"
	BackendEventProjectMemberAdded   = "project.member_added"
	BackendEventProjectMemberRemoved = "project.member_removed"
)
