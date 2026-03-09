package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/cache"
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
	ActorID        *uuid.UUID `json:"-"` // Set by handler from auth context
	BaseVersion    int64      `json:"base_version,omitempty"`
	Title          *string    `json:"title,omitempty" validate:"omitempty,min=1,max=500"`
	Description    *string    `json:"description,omitempty"`
	Status         *string    `json:"status,omitempty" validate:"omitempty,oneof=todo in_progress done blocked"`
	Priority       *string    `json:"priority,omitempty" validate:"omitempty,oneof=critical high medium low"`
	AssigneeID     *string    `json:"assignee_id"`
	ReporterID     *string    `json:"reporter_id"`
	DueDate        *time.Time `json:"due_date,omitempty"`
	StartDate      *time.Time `json:"start_date,omitempty"`
	EstimatedHours *float64   `json:"estimated_hours,omitempty"`
	ActualHours    *float64   `json:"actual_hours,omitempty"`
	Labels         []string   `json:"labels,omitempty"`
	RecurrenceRule *string    `json:"recurrence_rule,omitempty"`
}

type TaskService struct {
	taskRepo      repository.TaskRepository
	checklistRepo repository.ChecklistRepository
	ruleRepo      repository.TaskRuleRepository
	projectRepo   repository.ProjectRepository
	crRepo        repository.TaskChangeRequestRepository
	permResolver  *PermissionResolver
	txm           *repository.TxManager
	workerSrv     *worker.Server
	publisher     EventPublisher
	cache         *cache.Manager
}

func NewTaskService(
	taskRepo repository.TaskRepository,
	checklistRepo repository.ChecklistRepository,
	ruleRepo repository.TaskRuleRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
	publisher ...EventPublisher,
) *TaskService {
	s := &TaskService{
		taskRepo:      taskRepo,
		checklistRepo: checklistRepo,
		ruleRepo:      ruleRepo,
		txm:           txm,
		workerSrv:     workerSrv,
	}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
}

// SetCache injects the optional cache manager.
func (s *TaskService) SetCache(cm *cache.Manager) {
	s.cache = cm
}

// SetReviewDeps injects optional review-pipeline dependencies.
// Kept separate so the constructor signature stays backward-compatible.
func (s *TaskService) SetReviewDeps(projectRepo repository.ProjectRepository, crRepo repository.TaskChangeRequestRepository, resolver *PermissionResolver) {
	s.projectRepo = projectRepo
	s.crRepo = crRepo
	s.permResolver = resolver
}

// PreloadProjectCache loads project tasks into cache if not already loaded.
func (s *TaskService) PreloadProjectCache(ctx context.Context, projectID uuid.UUID) {
	if s.cache == nil {
		return
	}
	if s.cache.IsProjectLoaded(ctx, projectID) {
		s.cache.RefreshTTL(ctx, projectID)
		return
	}
	tasks, err := s.taskRepo.ListTreeByProject(ctx, projectID)
	if err != nil {
		log.Warn().Err(err).Str("project_id", projectID.String()).Msg("failed to load tasks for cache preload")
		return
	}
	if err := s.cache.PreloadProject(ctx, projectID, tasks); err != nil {
		log.Warn().Err(err).Str("project_id", projectID.String()).Msg("failed to preload project cache")
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

	// Update cache if project is loaded
	if s.cache != nil && s.cache.IsProjectLoaded(ctx, created.ProjectID) {
		if cacheErr := s.cache.SetTask(ctx, created.ProjectID, created); cacheErr != nil {
			log.Warn().Err(cacheErr).Str("task_id", created.ID.String()).Msg("failed to cache new task")
		}
	}

	// Enqueue activity log
	s.enqueueActivity(created.OrgID.String(), "task", created.ID.String(), "created", "", nil)
	// Enqueue search index
	s.enqueueSearchIndex("tasks", created)
	// Publish real-time event
	s.publishEvent(ctx, domain.EventTaskCreated, created.OrgID.String(), created.ID.String(), nil)

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
	// Cache-first for simple parent-ID lookups (column view pattern).
	// When the only filter is parent_id and the project is cached in Redis,
	// serve directly from cache (~5ms) instead of hitting PostgreSQL (~500ms).
	if s.cache != nil && filter.ParentID != nil &&
		filter.Status == nil && filter.Priority == nil &&
		filter.AssigneeID == nil && filter.Search == nil &&
		s.cache.IsProjectLoaded(ctx, projectID) {
		tasks, err := s.cache.ListTasks(ctx, projectID, *filter.ParentID)
		if err == nil {
			return tasks, len(tasks), nil
		}
		// Fall through to DB on cache miss
	}
	return s.taskRepo.List(ctx, projectID, filter)
}

// ListMyTasks returns tasks assigned to the user across all projects in the org.
func (s *TaskService) ListMyTasks(ctx context.Context, orgID, userID uuid.UUID, limit, offset int) ([]*domain.Task, int, error) {
	return s.taskRepo.ListByOrgAndAssignee(ctx, orgID, userID, limit, offset)
}

// BulkCreateParams defines the shape for a bulk create request.
type BulkCreateParams struct {
	OrgID        uuid.UUID  `json:"-"`
	ProjectID    uuid.UUID  `json:"-"`
	ParentTaskID *uuid.UUID `json:"parent_task_id,omitempty"`
	Titles       []string   `json:"titles" validate:"required,min=1,max=200"`
	Priority     string     `json:"priority,omitempty" validate:"omitempty,oneof=critical high medium low"`
	AssigneeID   *uuid.UUID `json:"assignee_id,omitempty"`
	ReporterID   *uuid.UUID `json:"reporter_id,omitempty"`
	DueDate      *time.Time `json:"due_date,omitempty"`
	StartDate    *time.Time `json:"start_date,omitempty"`
	Labels       []string   `json:"labels,omitempty"`
}

// BulkCreate creates multiple tasks in a single transaction with deduplication.
func (s *TaskService) BulkCreate(ctx context.Context, params BulkCreateParams) ([]*domain.Task, error) {
	// Deduplicate titles (case-insensitive, preserving first occurrence's casing)
	seen := make(map[string]struct{}, len(params.Titles))
	uniqueTitles := make([]string, 0, len(params.Titles))
	for _, t := range params.Titles {
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; !exists {
			seen[key] = struct{}{}
			uniqueTitles = append(uniqueTitles, trimmed)
		}
	}
	if len(uniqueTitles) == 0 {
		return nil, fmt.Errorf("no valid titles provided")
	}

	priority := params.Priority
	if priority == "" {
		priority = domain.PriorityMedium
	}

	var depth int
	if params.ParentTaskID != nil {
		parent, err := s.taskRepo.GetByID(ctx, *params.ParentTaskID)
		if err != nil {
			return nil, fmt.Errorf("get parent task: %w", err)
		}
		if !parent.CanAddChild() {
			return nil, domain.ErrMaxDepth
		}
		depth = parent.Depth + 1
	}

	labels := params.Labels
	if labels == nil {
		labels = []string{}
	}

	created := make([]*domain.Task, 0, len(uniqueTitles))

	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for _, title := range uniqueTitles {
			task := &domain.Task{
				OrgID:        params.OrgID,
				ProjectID:    params.ProjectID,
				ParentTaskID: params.ParentTaskID,
				Title:        title,
				Status:       domain.TaskStatusTodo,
				Priority:     priority,
				AssigneeID:   params.AssigneeID,
				ReporterID:   params.ReporterID,
				DueDate:      params.DueDate,
				StartDate:    params.StartDate,
				Labels:       labels,
				Metadata:     map[string]any{},
				Depth:        depth,
			}
			c, err := s.taskRepo.Create(ctx, tx, task)
			if err != nil {
				return fmt.Errorf("create task %q: %w", title, err)
			}
			created = append(created, c)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("bulk create: %w", err)
	}

	// Update cache for all created tasks
	if s.cache != nil && len(created) > 0 && s.cache.IsProjectLoaded(ctx, params.ProjectID) {
		for _, t := range created {
			if cacheErr := s.cache.SetTask(ctx, t.ProjectID, t); cacheErr != nil {
				log.Warn().Err(cacheErr).Str("task_id", t.ID.String()).Msg("failed to cache bulk-created task")
			}
		}
	}

	// Enqueue async jobs for all created tasks
	for _, t := range created {
		s.enqueueActivity(t.OrgID.String(), "task", t.ID.String(), "created", "", nil)
		s.enqueueSearchIndex("tasks", t)
	}

	return created, nil
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
				if *params.Changes.AssigneeID == "" {
					task.AssigneeID = nil
				} else if uid, parseErr := uuid.Parse(*params.Changes.AssigneeID); parseErr == nil {
					task.AssigneeID = &uid
				}
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

	// Update cache for all updated tasks
	if s.cache != nil && len(updated) > 0 {
		for _, t := range updated {
			if s.cache.IsProjectLoaded(ctx, t.ProjectID) {
				if cacheErr := s.cache.SetTask(ctx, t.ProjectID, t); cacheErr != nil {
					log.Warn().Err(cacheErr).Str("task_id", t.ID.String()).Msg("failed to update bulk-updated task in cache")
				}
			}
		}
	}

	// Enqueue async jobs
	for _, t := range updated {
		s.enqueueActivity(t.OrgID.String(), "task", t.ID.String(), "updated", "", nil)
		s.enqueueSearchIndex("tasks", t)
	}

	return updated, nil
}

func (s *TaskService) Update(ctx context.Context, id uuid.UUID, params UpdateTaskParams) (*domain.TaskUpdateResult, error) {
	task, err := s.taskRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Build changes map from params
	changes := map[string]any{}
	if params.Title != nil {
		changes["title"] = *params.Title
	}
	if params.Description != nil {
		changes["description"] = *params.Description
	}
	if params.Status != nil {
		changes["status"] = *params.Status
	}
	if params.Priority != nil {
		changes["priority"] = *params.Priority
	}
	if params.AssigneeID != nil {
		if *params.AssigneeID == "" {
			changes["assignee_id"] = nil
		} else {
			uid, parseErr := uuid.Parse(*params.AssigneeID)
			if parseErr == nil {
				changes["assignee_id"] = uid.String()
			}
		}
	}
	if params.ReporterID != nil {
		if *params.ReporterID == "" {
			changes["reporter_id"] = nil
		} else {
			uid, parseErr := uuid.Parse(*params.ReporterID)
			if parseErr == nil {
				changes["reporter_id"] = uid.String()
			}
		}
	}
	if params.DueDate != nil {
		changes["due_date"] = (*params.DueDate).Format(time.RFC3339)
	}
	if params.StartDate != nil {
		changes["start_date"] = (*params.StartDate).Format(time.RFC3339)
	}
	if params.EstimatedHours != nil {
		changes["estimated_hours"] = *params.EstimatedHours
	}
	if params.ActualHours != nil {
		changes["actual_hours"] = *params.ActualHours
	}
	if params.Labels != nil {
		changes["labels"] = params.Labels
	}
	if params.RecurrenceRule != nil {
		changes["recurrence_rule"] = *params.RecurrenceRule
	}

	// --- Optimistic version check via cache ---
	if s.cache != nil && params.BaseVersion > 0 && s.cache.IsProjectLoaded(ctx, task.ProjectID) {
		newVersion, vErr := s.cache.CheckAndIncrementVersion(ctx, task.ProjectID, task.ID, params.BaseVersion)
		if vErr != nil {
			log.Warn().Err(vErr).Str("task_id", id.String()).Msg("version check failed, falling through to DB")
		} else if newVersion != params.BaseVersion+1 {
			// Version mismatch — attempt field-level merge
			serverTask, sErr := s.cache.GetTask(ctx, task.ProjectID, task.ID)
			if sErr != nil {
				serverTask = task // Fall back to DB version
			}
			mergedChanges, resolution, mErr := cache.FieldLevelMerge(serverTask, params.BaseVersion, changes)
			if mErr != nil {
				return nil, mErr
			}
			if resolution == "auto-merged" {
				changes = mergedChanges
				// Proceed with the merge
			} else {
				return nil, &cache.ConflictError{
					TaskID:        task.ID,
					ServerVersion: newVersion,
					ServerState:   serverTask,
					YourChanges:   changes,
					Resolution:    "conflict",
				}
			}
		}
	}

	// --- Review pipeline ---
	// If review deps are wired and project has reviewable_fields, partition changes.
	var reviewableFields []string
	if s.projectRepo != nil && s.crRepo != nil && s.permResolver != nil {
		project, projErr := s.projectRepo.GetByID(ctx, task.ProjectID)
		if projErr == nil {
			reviewableFields = extractReviewableFields(project.Settings)
		}
	}

	directChanges := changes
	var reviewChanges map[string]any

	if len(reviewableFields) > 0 {
		directChanges, reviewChanges = partitionChanges(changes, reviewableFields)

		// If there are reviewable changes, check if the actor can bypass review
		if len(reviewChanges) > 0 && params.ActorID != nil && s.permResolver != nil {
			projectID := task.ProjectID
			canBypass, _ := s.permResolver.HasPermission(
				ctx, *params.ActorID, task.OrgID,
				domain.ScopeProject, &projectID,
				"tasks", "direct_update",
			)
			if canBypass {
				// Merge review changes back into direct changes
				for k, v := range reviewChanges {
					directChanges[k] = v
				}
				reviewChanges = nil
			}
		}
	}

	// Apply direct changes to the task struct
	applyParamsToTask(task, directChanges)

	// Handle recurrence rule
	if rr, ok := directChanges["recurrence_rule"]; ok {
		if rrStr, ok := rr.(string); ok && rrStr != "" {
			base := time.Now()
			if task.DueDate != nil {
				base = *task.DueDate
			}
			next := calculateNextOccurrence(base, rrStr)
			task.NextOccurrence = next
		} else {
			task.NextOccurrence = nil
		}
	}

	var updated *domain.Task
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.taskRepo.Update(ctx, tx, task)
		return err
	})
	if err != nil {
		return nil, err
	}

	// Update cache after successful DB write
	if s.cache != nil && s.cache.IsProjectLoaded(ctx, updated.ProjectID) {
		if cacheErr := s.cache.SetTask(ctx, updated.ProjectID, updated); cacheErr != nil {
			log.Warn().Err(cacheErr).Str("task_id", updated.ID.String()).Msg("failed to update task in cache")
		}
	}

	result := &domain.TaskUpdateResult{
		Task:           updated,
		AppliedChanges: directChanges,
	}

	// Create change request for review fields if any
	if len(reviewChanges) > 0 && s.crRepo != nil {
		var proposerID uuid.UUID
		if params.ActorID != nil {
			proposerID = *params.ActorID
		}
		cr := &domain.TaskChangeRequest{
			OrgID:      task.OrgID,
			TaskID:     task.ID,
			ProposerID: proposerID,
			Changes:    reviewChanges,
			Reason:     "Field requires review",
		}
		var created *domain.TaskChangeRequest
		crErr := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
			var e error
			created, e = s.crRepo.Create(ctx, tx, cr)
			return e
		})
		if crErr == nil {
			result.ChangeRequest = created
			result.PendingReview = true
			s.publishEvent(ctx, domain.EventChangeRequestCreated, task.OrgID.String(), created.ID.String(), map[string]any{
				"task_id":     task.ID.String(),
				"proposer_id": proposerID.String(),
			})
		}
	}

	// Enqueue activity log
	s.enqueueActivity(task.OrgID.String(), "task", task.ID.String(), "updated", "", directChanges)
	// Enqueue search index update
	s.enqueueSearchIndex("tasks", updated)
	// Publish real-time event
	s.publishEvent(ctx, domain.EventTaskUpdated, task.OrgID.String(), task.ID.String(), directChanges)

	return result, nil
}

// applyParamsToTask applies a changes map to a task struct (used by Update).
func applyParamsToTask(task *domain.Task, changes map[string]any) {
	for key, val := range changes {
		switch key {
		case "title":
			if s, ok := val.(string); ok {
				task.Title = strings.TrimSpace(s)
			}
		case "description":
			if s, ok := val.(string); ok {
				task.Description = strings.TrimSpace(s)
			}
		case "status":
			if s, ok := val.(string); ok {
				task.Status = s
			}
		case "priority":
			if s, ok := val.(string); ok {
				task.Priority = s
			}
		case "assignee_id":
			if val == nil {
				task.AssigneeID = nil
			} else if s, ok := val.(string); ok {
				if uid, err := uuid.Parse(s); err == nil {
					task.AssigneeID = &uid
				}
			}
		case "reporter_id":
			if val == nil {
				task.ReporterID = nil
			} else if s, ok := val.(string); ok {
				if uid, err := uuid.Parse(s); err == nil {
					task.ReporterID = &uid
				}
			}
		case "due_date":
			if s, ok := val.(string); ok {
				if t, err := time.Parse(time.RFC3339, s); err == nil {
					task.DueDate = &t
				}
			}
		case "start_date":
			if s, ok := val.(string); ok {
				if t, err := time.Parse(time.RFC3339, s); err == nil {
					task.StartDate = &t
				}
			}
		case "estimated_hours":
			if f, ok := val.(float64); ok {
				task.EstimatedHours = &f
			}
		case "actual_hours":
			if f, ok := val.(float64); ok {
				task.ActualHours = &f
			}
		case "labels":
			if arr, ok := val.([]string); ok {
				task.Labels = arr
			} else if arr, ok := val.([]any); ok {
				labels := make([]string, 0, len(arr))
				for _, v := range arr {
					if s, ok := v.(string); ok {
						labels = append(labels, s)
					}
				}
				task.Labels = labels
			}
		case "recurrence_rule":
			if s, ok := val.(string); ok {
				task.RecurrenceRule = &s
			}
		}
	}
}

// extractReviewableFields returns the reviewable_fields from project settings.
func extractReviewableFields(settings map[string]any) []string {
	if settings == nil {
		return nil
	}
	raw, ok := settings["reviewable_fields"]
	if !ok {
		return nil
	}
	arr, ok := raw.([]any)
	if !ok {
		return nil
	}
	fields := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok {
			fields = append(fields, s)
		}
	}
	return fields
}

// partitionChanges splits changes into direct and review-required.
func partitionChanges(changes map[string]any, reviewableFields []string) (direct, review map[string]any) {
	rfSet := make(map[string]bool, len(reviewableFields))
	for _, f := range reviewableFields {
		rfSet[f] = true
	}
	direct = make(map[string]any)
	review = make(map[string]any)
	for k, v := range changes {
		if rfSet[k] {
			review[k] = v
		} else {
			direct[k] = v
		}
	}
	return direct, review
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

	// Remove from cache
	if s.cache != nil && s.cache.IsProjectLoaded(ctx, task.ProjectID) {
		if cacheErr := s.cache.RemoveTask(ctx, task.ProjectID, task.ID, task.ParentTaskID); cacheErr != nil {
			log.Warn().Err(cacheErr).Str("task_id", task.ID.String()).Msg("failed to remove task from cache")
		}
	}

	// Enqueue activity log
	s.enqueueActivity(task.OrgID.String(), "task", task.ID.String(), "deleted", "", nil)
	// Enqueue search delete
	s.enqueueSearchDelete("tasks", id.String())
	// Publish real-time event
	s.publishEvent(ctx, domain.EventTaskDeleted, task.OrgID.String(), task.ID.String(), nil)

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
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for _, item := range items {
			// Always call Reparent — handles both non-nil parent and nil (move to root)
			if err := s.taskRepo.Reparent(ctx, tx, item.ID, item.ParentID, item.Position); err != nil {
				return fmt.Errorf("reparent task %s: %w", item.ID, err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Refresh moved tasks in cache
	if s.cache != nil {
		for _, item := range items {
			task, getErr := s.taskRepo.GetByID(ctx, item.ID)
			if getErr != nil {
				continue
			}
			if s.cache.IsProjectLoaded(ctx, task.ProjectID) {
				_ = s.cache.SetTask(ctx, task.ProjectID, task)
			}
		}
	}
	return nil
}

// --- Worker helpers (fire-and-forget, log errors) ---

// publishEvent publishes a domain event for real-time propagation via SSE.
func (s *TaskService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
	if s.publisher == nil {
		return
	}
	event := domain.DomainEvent{
		Type:     eventType,
		OrgID:    orgID,
		EntityID: entityID,
		Payload:  payload,
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		log.Warn().Err(err).Str("type", eventType).Msg("failed to publish event")
	}
}

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

// calculateNextOccurrence calculates the next occurrence based on RRULE.
func calculateNextOccurrence(current time.Time, rrule string) *time.Time {
	// Simple RRULE parser for: FREQ=DAILY, FREQ=WEEKLY, FREQ=MONTHLY, FREQ=YEARLY
	// Also supports INTERVAL=N
	freq := "DAILY"
	interval := 1

	for _, part := range strings.Split(rrule, ";") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "FREQ":
			freq = kv[1]
		case "INTERVAL":
			if i, err := fmt.Sscanf(kv[1], "%d", &interval); err == nil && i == 1 && interval > 0 {
				// interval parsed
			}
		}
	}

	var next time.Time
	switch freq {
	case "DAILY":
		next = current.AddDate(0, 0, interval)
	case "WEEKLY":
		next = current.AddDate(0, 0, 7*interval)
	case "MONTHLY":
		next = current.AddDate(0, interval, 0)
	case "YEARLY":
		next = current.AddDate(interval, 0, 0)
	default:
		next = current.AddDate(0, 0, 1) // Default to daily
	}
	return &next
}
