package domain

// Event types for real-time and notification systems.
const (
	EventTaskCreated       = "task.created"
	EventTaskUpdated       = "task.updated"
	EventTaskDeleted       = "task.deleted"
	EventTaskStatusChanged = "task.status_changed"
	EventTaskAssigned      = "task.assigned"
	EventCommentCreated    = "comment.created"
	EventChecklistToggled  = "checklist.toggled"
	EventProjectCreated    = "project.created"
	EventProjectUpdated    = "project.updated"
	EventTeamCreated       = "team.created"
	EventTeamUpdated       = "team.updated"
	EventMemberInvited     = "member.invited"
	EventImportProgress    = "import.progress"
	EventImportCompleted   = "import.completed"
	EventExportReady       = "export.ready"
	EventReviewRequested   = "review.requested"
	EventReviewCompleted   = "review.completed"

	// Change request events.
	EventChangeRequestCreated  = "change_request.created"
	EventChangeRequestApproved = "change_request.approved"
	EventChangeRequestRejected = "change_request.rejected"

	// Announcement events.
	EventAnnouncementCreated = "announcement.created"
	EventAnnouncementUpdated = "announcement.updated"
	EventAnnouncementDeleted = "announcement.deleted"

	// Team lifecycle events (for messaging sync).
	EventTeamDeleted        = "team.deleted"
	EventTeamManagerChanged = "team.manager_changed"
	EventTeamMemberAdded    = "team.member_added"
	EventTeamMemberRemoved  = "team.member_removed"

	// Project lifecycle events (for messaging sync).
	EventProjectDeleted       = "project.deleted"
	EventProjectTeamLinked    = "project.team_linked"
	EventProjectTeamUnlinked  = "project.team_unlinked"
	EventProjectMemberAdded   = "project.member_added"
	EventProjectMemberRemoved = "project.member_removed"

	// Checklist events.
	EventChecklistCreated = "checklist.created"
	EventChecklistUpdated = "checklist.updated"
	EventChecklistDeleted = "checklist.deleted"

	// Comment events.
	EventCommentDeleted = "comment.deleted"

	// Dependency events.
	EventDependencyAdded   = "dependency.added"
	EventDependencyRemoved = "dependency.removed"

	// Org member events.
	EventOrgMemberRoleUpdated = "member.role_updated"
	EventOrgMemberRemoved     = "member.removed"

	// Drive events. Delivered over WS only to payload.audience (see OrgHub.Start).
	EventDriveItemCreated  = "drive.item.created"
	EventDriveItemUpdated  = "drive.item.updated"
	EventDriveItemTrashed  = "drive.item.trashed"
	EventDriveItemRestored = "drive.item.restored"
	EventDriveItemShared   = "drive.item.shared"
	EventDriveShareRevoked = "drive.share.revoked"
)

// DomainEvent carries event data for pub/sub and notifications.
type DomainEvent struct {
	Type     string         `json:"type"`
	OrgID    string         `json:"org_id"`
	ActorID  string         `json:"actor_id"`
	EntityID string         `json:"entity_id"`
	Payload  map[string]any `json:"payload,omitempty"`
}
