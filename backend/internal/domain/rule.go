package domain

import (
	"time"

	"github.com/google/uuid"
)

// Rule type constants.
const (
	RuleAllChecklistsDone  = "all_checklists_done"
	RuleAllSubtasksComplete = "all_subtasks_complete"
	RuleReviewerApproved   = "reviewer_approved"
	RuleAIApproved         = "ai_approved"
	RuleCustom             = "custom"
)

// TaskRule represents a completion criterion on a task.
type TaskRule struct {
	ID         uuid.UUID      `json:"id"`
	OrgID      uuid.UUID      `json:"org_id"`
	TaskID     uuid.UUID      `json:"task_id"`
	RuleType   string         `json:"rule_type"`
	RuleConfig map[string]any `json:"rule_config,omitempty"`
	IsRequired bool           `json:"is_required"`
	CreatedAt  time.Time      `json:"created_at"`
}
