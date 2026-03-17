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
)

// DomainEvent carries event data for pub/sub and notifications.
type DomainEvent struct {
	Type     string         `json:"type"`
	OrgID    string         `json:"org_id"`
	ActorID  string         `json:"actor_id"`
	EntityID string         `json:"entity_id"`
	Payload  map[string]any `json:"payload,omitempty"`
}
