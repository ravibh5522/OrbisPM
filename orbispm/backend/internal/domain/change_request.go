package domain

import (
	"time"

	"github.com/google/uuid"
)

// Change request status constants.
const (
	CRPending  = "pending"
	CRApproved = "approved"
	CRRejected = "rejected"
)

// TaskChangeRequest represents a request to change reviewable fields on a task.
type TaskChangeRequest struct {
	ID         uuid.UUID      `json:"id"`
	OrgID      uuid.UUID      `json:"org_id"`
	TaskID     uuid.UUID      `json:"task_id"`
	ProposerID uuid.UUID      `json:"proposer_id"`
	ReviewerID *uuid.UUID     `json:"reviewer_id,omitempty"`
	Status     string         `json:"status"`
	Changes    map[string]any `json:"changes"`
	Reason     string         `json:"reason,omitempty"`
	ReviewNote string         `json:"review_note,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	ReviewedAt *time.Time     `json:"reviewed_at,omitempty"`
}

// TaskUpdateResult is returned from task update when review pipeline is involved.
type TaskUpdateResult struct {
	Task           *Task              `json:"task"`
	ChangeRequest  *TaskChangeRequest `json:"change_request,omitempty"`
	AppliedChanges map[string]any     `json:"applied_changes,omitempty"`
	PendingReview  bool               `json:"pending_review"`
}
