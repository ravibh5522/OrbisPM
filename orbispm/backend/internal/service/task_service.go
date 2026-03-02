package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/worker"
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
	workerSrv     *worker.Server
}

func NewTaskService(
	taskRepo repository.TaskRepository,
	checklistRepo repository.ChecklistRepository,
	ruleRepo repository.TaskRuleRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
) *TaskService {
	return &TaskService{
		taskRepo:      taskRepo,
		checklistRepo: checklistRepo,
		ruleRepo:      ruleRepo,
		txm:           txm,
		workerSrv:     workerSrv,
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

	// Enqueue activity log
	s.enqueueActivity(created.OrgID.String(), "task", created.ID.String(), "created", "", nil)
	// Enqueue search index
	s.enqueueSearchIndex("tasks", created)

	return created, nil
}

func (s *TaskService) Get(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	return s.taskRepo.GetByID(ctx, id)
}

func (s *TaskService) GetTree(ctx context.Context, rootID uuid.UUID) ([]*domain.Task, error) {
	return s.taskRepo.GetTree(ctx, rootID)
}

// Duplicate deep-copies a task and all its descendants, returning the new root task.
func (s *TaskService) Duplicate(ctx context.Context, taskID uuid.UUID) (*domain.Task, error) {
	// Get the full subtree (root + descendants, ordered by depth/sort_path)
	tree, err := s.taskRepo.GetTree(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("get tree for duplicate: %w", err)
	}
	if len(tree) == 0 {
		return nil, domain.ErrNotFound
	}

	// Map old IDs → new IDs for parent remapping
	idMap := make(map[uuid.UUID]uuid.UUID, len(tree))
	var createdTasks []*domain.Task
	var root *domain.Task

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for _, src := range tree {
			clone := &domain.Task{
				OrgID:       src.OrgID,
				ProjectID:   src.ProjectID,
				Title:       src.Title + " (copy)",
				Description: src.Description,
				Status:      domain.TaskStatusTodo,
				Priority:    src.Priority,
				AssigneeID:  src.AssigneeID,
				ReporterID:  src.ReporterID,
				Depth:       src.Depth,
				Position:    src.Position,
				DueDate:     src.DueDate,
				StartDate:   src.StartDate,
				Labels:      src.Labels,
				Metadata:    src.Metadata,
			}
			if clone.Labels == nil {
				clone.Labels = []string{}
			}
			if clone.Metadata == nil {
				clone.Metadata = map[string]any{}
			}

			// Remap parent
			if src.ParentTaskID != nil {
				if newParent, ok := idMap[*src.ParentTaskID]; ok {
					clone.ParentTaskID = &newParent
				}
			}

			created, err := s.taskRepo.Create(ctx, tx, clone)
			if err != nil {
				return fmt.Errorf("duplicate task %s: %w", src.ID, err)
			}
			idMap[src.ID] = created.ID
			createdTasks = append(createdTasks, created)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("duplicate: %w", err)
	}

	// Enqueue async jobs for all created tasks
	for _, t := range createdTasks {
		s.enqueueActivity(t.OrgID.String(), "task", t.ID.String(), "created", "", nil)
		s.enqueueSearchIndex("tasks", t)
	}

	if len(createdTasks) > 0 {
		root = createdTasks[0]
	}
	return root, nil
}

func (s *TaskService) ListTreeByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.Task, error) {
	return s.taskRepo.ListTreeByProject(ctx, projectID)
}

func (s *TaskService) List(ctx context.Context, projectID uuid.UUID, filter repository.TaskFilter) ([]*domain.Task, int, error) {
	return s.taskRepo.List(ctx, projectID, filter)
}

// ListMyTasks returns tasks assigned to the user across all projects in the org.
func (s *TaskService) ListMyTasks(ctx context.Context, orgID, userID uuid.UUID, limit, offset int) ([]*domain.Task, int, error) {
	return s.taskRepo.ListByOrgAndAssignee(ctx, orgID, userID, limit, offset)
}

// BulkUpdateParams defines the shape for a bulk update request.
type BulkUpdateParams struct {
	TaskIDs []uuid.UUID      `json:"task_ids" validate:"required,min=1,max=100"`
	Changes UpdateTaskParams `json:"changes"`
}

// BulkUpdate applies the same changes to multiple tasks in a single transaction.
func (s *TaskService) BulkUpdate(ctx context.Context, params BulkUpdateParams) ([]*domain.Task, error) {
	if len(params.TaskIDs) == 0 {
		return nil, fmt.Errorf("no task IDs provided")
	}

	updated := make([]*domain.Task, 0, len(params.TaskIDs))

	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for _, id := range params.TaskIDs {
			task, err := s.taskRepo.GetByID(ctx, id)
			if err != nil {
				return fmt.Errorf("get task %s: %w", id, err)
			}

			if params.Changes.Status != nil {
				task.Status = *params.Changes.Status
			}
			if params.Changes.Priority != nil {
				task.Priority = *params.Changes.Priority
			}
			if params.Changes.AssigneeID != nil {
				task.AssigneeID = params.Changes.AssigneeID
			}
			if params.Changes.Labels != nil {
				task.Labels = params.Changes.Labels
			}
			if params.Changes.DueDate != nil {
				task.DueDate = params.Changes.DueDate
			}

			result, err := s.taskRepo.Update(ctx, tx, task)
			if err != nil {
				return fmt.Errorf("update task %s: %w", id, err)
			}
			updated = append(updated, result)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("bulk update: %w", err)
	}

	// Enqueue async jobs
	for _, t := range updated {
		s.enqueueActivity(t.OrgID.String(), "task", t.ID.String(), "updated", "", nil)
		s.enqueueSearchIndex("tasks", t)
	}

	return updated, nil
}

func (s *TaskService) Update(ctx context.Context, id uuid.UUID, params UpdateTaskParams) (*domain.Task, error) {
	task, err := s.taskRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	changes := map[string]any{}
	if params.Title != nil {
		changes["title"] = *params.Title
		task.Title = strings.TrimSpace(*params.Title)
	}
	if params.Description != nil {
		changes["description"] = *params.Description
		task.Description = strings.TrimSpace(*params.Description)
	}
	if params.Status != nil {
		changes["status"] = *params.Status
		task.Status = *params.Status
	}
	if params.Priority != nil {
		changes["priority"] = *params.Priority
		task.Priority = *params.Priority
	}
	if params.AssigneeID != nil {
		changes["assignee_id"] = (*params.AssigneeID).String()
		task.AssigneeID = params.AssigneeID
	}
	if params.DueDate != nil {
		changes["due_date"] = (*params.DueDate).Format(time.RFC3339)
		task.DueDate = params.DueDate
	}
	if params.StartDate != nil {
		changes["start_date"] = (*params.StartDate).Format(time.RFC3339)
		task.StartDate = params.StartDate
	}
	if params.EstimatedHours != nil {
		changes["estimated_hours"] = *params.EstimatedHours
		task.EstimatedHours = params.EstimatedHours
	}
	if params.ActualHours != nil {
		changes["actual_hours"] = *params.ActualHours
		task.ActualHours = params.ActualHours
	}
	if params.Labels != nil {
		changes["labels"] = params.Labels
		task.Labels = params.Labels
	}

	var updated *domain.Task
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.taskRepo.Update(ctx, tx, task)
		return err
	})
	if err != nil {
		return nil, err
	}

	// Enqueue activity log
	s.enqueueActivity(task.OrgID.String(), "task", task.ID.String(), "updated", "", changes)
	// Enqueue search index update
	s.enqueueSearchIndex("tasks", updated)

	return updated, nil
}

func (s *TaskService) Delete(ctx context.Context, id uuid.UUID) error {
	task, err := s.taskRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.taskRepo.Delete(ctx, tx, id)
	})
	if err != nil {
		return err
	}

	// Enqueue activity log
	s.enqueueActivity(task.OrgID.String(), "task", task.ID.String(), "deleted", "", nil)
	// Enqueue search delete
	s.enqueueSearchDelete("tasks", id.String())

	return nil
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

// ReorderItem represents a single task reorder operation.
type ReorderItem struct {
	ID       uuid.UUID  `json:"id" validate:"required"`
	Position int        `json:"position" validate:"min=0"`
	ParentID *uuid.UUID `json:"parent_id,omitempty"`
}

// Reorder updates the positions (and optionally parents) of multiple tasks in a single transaction.
func (s *TaskService) Reorder(ctx context.Context, items []ReorderItem) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for _, item := range items {
			if item.ParentID != nil {
				// Reparent + reposition
				if err := s.taskRepo.Reparent(ctx, tx, item.ID, item.ParentID, item.Position); err != nil {
					return fmt.Errorf("reparent task %s: %w", item.ID, err)
				}
			} else {
				if err := s.taskRepo.UpdatePosition(ctx, tx, item.ID, item.Position); err != nil {
					return fmt.Errorf("reorder task %s: %w", item.ID, err)
				}
			}
		}
		return nil
	})
}

// --- Worker helpers (fire-and-forget, log errors) ---

func (s *TaskService) enqueueActivity(orgID, entityType, entityID, action, actorID string, changes map[string]any) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewActivityLogTask(worker.ActivityLogPayload{
		OrgID:      orgID,
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
		Changes:    changes,
	})
	if err != nil {
		log.Error().Err(err).Msg("build activity log task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("enqueue activity log task")
	}
}

func (s *TaskService) enqueueSearchIndex(index string, doc any) {
	if s.workerSrv == nil {
		return
	}
	m, ok := doc.(*domain.Task)
	if !ok {
		return
	}
	task, err := worker.NewSearchIndexTask(worker.SearchIndexPayload{
		Index: index,
		Document: map[string]any{
			"id":         m.ID.String(),
			"org_id":     m.OrgID.String(),
			"project_id": m.ProjectID.String(),
			"title":      m.Title,
			"status":     m.Status,
			"priority":   m.Priority,
			"labels":     m.Labels,
		},
	})
	if err != nil {
		log.Error().Err(err).Msg("build search index task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("enqueue search index task")
	}
}

func (s *TaskService) enqueueSearchDelete(index, docID string) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewSearchDeleteTask(worker.SearchDeletePayload{
		Index: index,
		DocID: docID,
	})
	if err != nil {
		log.Error().Err(err).Msg("build search delete task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("enqueue search delete task")
	}
}
