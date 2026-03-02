package domain

import (
	"time"

	"github.com/google/uuid"
)

// MaxTaskDepth is the maximum allowed depth for subtasks (0-based: 0,1,2,3 = 4 levels).
const MaxTaskDepth = 3

// Task status constants.
const (
	TaskStatusTodo       = "todo"
	TaskStatusInProgress = "in_progress"
	TaskStatusDone       = "done"
	TaskStatusBlocked    = "blocked"
)

// Task priority constants.
const (
	PriorityCritical = "critical"
	PriorityHigh     = "high"
	PriorityMedium   = "medium"
	PriorityLow      = "low"
)

// Review status constants.
const (
	ReviewPending  = "pending_review"
	ReviewApproved = "approved"
	ReviewRejected = "rejected"
)

// Task represents a task (or subtask) within a project.
type Task struct {
	ID             uuid.UUID      `json:"id"`
	OrgID          uuid.UUID      `json:"org_id"`
	ProjectID      uuid.UUID      `json:"project_id"`
	ParentTaskID   *uuid.UUID     `json:"parent_task_id,omitempty"`
	Title          string         `json:"title"`
	Description    string         `json:"description,omitempty"`
	Status         string         `json:"status"`
	Priority       string         `json:"priority"`
	AssigneeID     *uuid.UUID     `json:"assignee_id,omitempty"`
	ReporterID     *uuid.UUID     `json:"reporter_id,omitempty"`
	Depth          int            `json:"depth"`
	Position       int            `json:"position"`
	DueDate        *time.Time     `json:"due_date,omitempty"`
	StartDate      *time.Time     `json:"start_date,omitempty"`
	EstimatedHours *float64       `json:"estimated_hours,omitempty"`
	ActualHours    *float64       `json:"actual_hours,omitempty"`
	Labels         []string       `json:"labels,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	ReviewStatus   *string        `json:"review_status,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// TaskTree represents a task with its children in a tree.
type TaskTree struct {
	Task     *Task       `json:"task"`
	Children []*TaskTree `json:"children,omitempty"`
}

// CanAddChild checks if a new child can be added under this task.
func (t *Task) CanAddChild() bool {
	return t.Depth < MaxTaskDepth
}

// TaskDependency represents a dependency between tasks.
type TaskDependency struct {
	TaskID      uuid.UUID `json:"task_id"`
	DependsOnID uuid.UUID `json:"depends_on_id"`
	Type        string    `json:"type"`
}

// TaskWatcher represents a user watching a task.
type TaskWatcher struct {
	TaskID uuid.UUID `json:"task_id"`
	UserID uuid.UUID `json:"user_id"`
}
