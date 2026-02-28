package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

type CreateTaskParams struct {
	OrgID        uuid.UUID  `json:"-"`
	ProjectID    uuid.UUID  `json:"-"`
	ParentTaskID *uuid.UUID `json:"parent_task_id,omitempty"`
	Title        string     `json:"title" validate:"required,min=1,max=500"`
	Description  string     `json:"description,omitempty"`
	Priority     string     `json:"priority,omitempty" validate:"omitempty,oneof=critical high medium low"`
	AssigneeID   *uuid.UUID `json:"assignee_id,omitempty"`
	ReporterID   *uuid.UUID `json:"reporter_id,omitempty"`
	DueDate      *time.Time `json:"due_date,omitempty"`
	StartDate    *time.Time `json:"start_date,omitempty"`
	Labels       []string   `json:"labels,omitempty"`
}

type UpdateTaskParams struct {
	Title          *string    `json:"title,omitempty" validate:"omitempty,min=1,max=500"`
	Description    *string    `json:"description,omitempty"`
	Status         *string    `json:"status,omitempty" validate:"omitempty,oneof=todo in_progress done blocked"`
	Priority       *string    `json:"priority,omitempty" validate:"omitempty,oneof=critical high medium low"`
	AssigneeID     *uuid.UUID `json:"assignee_id,omitempty"`
	DueDate        *time.Time `json:"due_date,omitempty"`
	StartDate      *time.Time `json:"start_date,omitempty"`
	EstimatedHours *float64   `json:"estimated_hours,omitempty"`
	ActualHours    *float64   `json:"actual_hours,omitempty"`
	Labels         []string   `json:"labels,omitempty"`
}

type TaskService struct {
	taskRepo      repository.TaskRepository
	checklistRepo repository.ChecklistRepository
	ruleRepo      repository.TaskRuleRepository
	txm           *repository.TxManager
}

func NewTaskService(
	taskRepo repository.TaskRepository,
	checklistRepo repository.ChecklistRepository,
	ruleRepo repository.TaskRuleRepository,
	txm *repository.TxManager,
) *TaskService {
	return &TaskService{
		taskRepo:      taskRepo,
		checklistRepo: checklistRepo,
		ruleRepo:      ruleRepo,
		txm:           txm,
	}
}

func (s *TaskService) Create(ctx context.Context, params CreateTaskParams) (*domain.Task, error) {
	priority := params.Priority
	if priority == "" {
		priority = domain.PriorityMedium
	}

	task := &domain.Task{
		OrgID:        params.OrgID,
		ProjectID:    params.ProjectID,
		ParentTaskID: params.ParentTaskID,
		Title:        strings.TrimSpace(params.Title),
		Description:  strings.TrimSpace(params.Description),
		Status:       domain.TaskStatusTodo,
		Priority:     priority,
		AssigneeID:   params.AssigneeID,
		ReporterID:   params.ReporterID,
		DueDate:      params.DueDate,
		StartDate:    params.StartDate,
		Labels:       params.Labels,
		Metadata:     map[string]any{},
		Depth:        0,
	}

	if task.Labels == nil {
		task.Labels = []string{}
	}

	// If this is a subtask, calculate depth
	if params.ParentTaskID != nil {
		parent, err := s.taskRepo.GetByID(ctx, *params.ParentTaskID)
		if err != nil {
			return nil, fmt.Errorf("get parent task: %w", err)
		}
		if !parent.CanAddChild() {
			return nil, domain.ErrMaxDepth
		}
		task.Depth = parent.Depth + 1
	}

	var created *domain.Task
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.taskRepo.Create(ctx, tx, task)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create task: %w", err)
	}
	return created, nil
}

func (s *TaskService) Get(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	return s.taskRepo.GetByID(ctx, id)
}

func (s *TaskService) GetTree(ctx context.Context, rootID uuid.UUID) ([]*domain.Task, error) {
	return s.taskRepo.GetTree(ctx, rootID)
}

func (s *TaskService) List(ctx context.Context, projectID uuid.UUID, filter repository.TaskFilter) ([]*domain.Task, int, error) {
	return s.taskRepo.List(ctx, projectID, filter)
}

func (s *TaskService) Update(ctx context.Context, id uuid.UUID, params UpdateTaskParams) (*domain.Task, error) {
	task, err := s.taskRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.Title != nil {
		task.Title = strings.TrimSpace(*params.Title)
	}
	if params.Description != nil {
		task.Description = strings.TrimSpace(*params.Description)
	}
	if params.Status != nil {
		task.Status = *params.Status
	}
	if params.Priority != nil {
		task.Priority = *params.Priority
	}
	if params.AssigneeID != nil {
		task.AssigneeID = params.AssigneeID
	}
	if params.DueDate != nil {
		task.DueDate = params.DueDate
	}
	if params.StartDate != nil {
		task.StartDate = params.StartDate
	}
	if params.EstimatedHours != nil {
		task.EstimatedHours = params.EstimatedHours
	}
	if params.ActualHours != nil {
		task.ActualHours = params.ActualHours
	}
	if params.Labels != nil {
		task.Labels = params.Labels
	}

	var updated *domain.Task
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.taskRepo.Update(ctx, tx, task)
		return err
	})
	return updated, err
}

func (s *TaskService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.taskRepo.Delete(ctx, tx, id)
	})
}

// SubmitForReview evaluates automatic rules and sets the task to pending_review.
func (s *TaskService) SubmitForReview(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	task, err := s.taskRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	rules, err := s.ruleRepo.ListByTask(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("list rules: %w", err)
	}

	// Evaluate automatic rules
	for _, rule := range rules {
		if !rule.IsRequired {
			continue
		}
		switch rule.RuleType {
		case domain.RuleAllChecklistsDone:
			checked, total, err := s.checklistRepo.CountChecked(ctx, id)
			if err != nil {
				return nil, fmt.Errorf("count checklists: %w", err)
			}
			if total > 0 && checked < total {
				return nil, domain.ErrRulesNotMet.WithDetail(
					fmt.Sprintf("checklists: %d/%d completed", checked, total))
			}
		}
	}

	reviewStatus := domain.ReviewPending
	task.ReviewStatus = &reviewStatus

	var updated *domain.Task
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.taskRepo.Update(ctx, tx, task)
		return err
	})
	return updated, err
}

// MarkComplete marks a task as done after review.
func (s *TaskService) MarkComplete(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	task, err := s.taskRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	task.Status = domain.TaskStatusDone
	approved := domain.ReviewApproved
	task.ReviewStatus = &approved

	var updated *domain.Task
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.taskRepo.Update(ctx, tx, task)
		return err
	})
	return updated, err
}
