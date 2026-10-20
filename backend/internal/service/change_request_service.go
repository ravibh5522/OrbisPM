package service

import (
	"context"
	"errors"
	"encoding/json"
	"fmt"
	"strconv"
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

// TaskChangeRequestService manages the review pipeline for task changes.
type TaskChangeRequestService struct {
	crRepo      repository.TaskChangeRequestRepository
	taskRepo    repository.TaskRepository
	projectRepo repository.ProjectRepository
	txm         *repository.TxManager
	workerSrv   *worker.Server
	publisher   EventPublisher
	cache       *cache.Manager
	// validateAssignees checks that assignees are effective project members.
	validateAssignees func(ctx context.Context, projectID uuid.UUID, ids []uuid.UUID) error
}

// SetCache lets approved changes refresh the live task cache and progress roll-ups.
func (s *TaskChangeRequestService) SetCache(cm *cache.Manager) { s.cache = cm }

// SetAssigneeValidator wires the project-membership check used for assignee changes.
func (s *TaskChangeRequestService) SetAssigneeValidator(fn func(ctx context.Context, projectID uuid.UUID, ids []uuid.UUID) error) {
	s.validateAssignees = fn
}

func NewTaskChangeRequestService(
	crRepo repository.TaskChangeRequestRepository,
	taskRepo repository.TaskRepository,
	projectRepo repository.ProjectRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
	publisher ...EventPublisher,
) *TaskChangeRequestService {
	s := &TaskChangeRequestService{
		crRepo:      crRepo,
		taskRepo:    taskRepo,
		projectRepo: projectRepo,
		txm:         txm,
		workerSrv:   workerSrv,
	}
	if len(publisher) > 0 {
		s.publisher = publisher[0]
	}
	return s
}

// ProposeChange creates a new change request for a task.
func (s *TaskChangeRequestService) ProposeChange(ctx context.Context, orgID, taskID, proposerID uuid.UUID, changes map[string]any, reason string) (*domain.TaskChangeRequest, error) {
	if len(changes) == 0 {
		return nil, domain.ErrBadRequest.WithDetail("no changes provided")
	}
	// Reject unknown fields / invalid values now, not at approval time.
	if err := applyChangesToTask(&domain.Task{}, changes); err != nil {
		return nil, err
	}

	cr := &domain.TaskChangeRequest{
		OrgID:      orgID,
		TaskID:     taskID,
		ProposerID: proposerID,
		Changes:    changes,
		Reason:     reason,
	}

	var created *domain.TaskChangeRequest
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.crRepo.Create(ctx, tx, cr)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create change request: %w", err)
	}

	// Publish event
	s.publishEvent(ctx, domain.EventChangeRequestCreated, orgID.String(), created.ID.String(), map[string]any{
		"task_id":     taskID.String(),
		"proposer_id": proposerID.String(),
	})

	// Enqueue activity log
	s.enqueueActivity(orgID.String(), "change_request", created.ID.String(), "created", proposerID.String(), changes)

	// Notify designated approvers about the new change request
	if s.projectRepo != nil {
		task, tErr := s.taskRepo.GetByID(ctx, taskID)
		if tErr == nil {
			if proj, pErr := s.projectRepo.GetByID(ctx, task.ProjectID); pErr == nil {
				if approverIDs, ok := proj.Settings["approver_ids"].([]any); ok {
					for _, aid := range approverIDs {
						if aidStr, ok := aid.(string); ok && aidStr != proposerID.String() {
							s.enqueueNotification(aidStr, orgID.String(), "change_request_review",
								"Change request needs your approval",
								fmt.Sprintf("A change request for task %q requires your review", task.Title),
								map[string]any{
									"task_id":           taskID.String(),
									"change_request_id": created.ID.String(),
									"proposer_id":       proposerID.String(),
								})
						}
					}
				}
			}
		}
	}

	return created, nil
}

// Approve approves a change request and applies the changes to the task.
func (s *TaskChangeRequestService) Approve(ctx context.Context, crID, reviewerID uuid.UUID, note string) (*domain.TaskChangeRequest, error) {
	cr, err := s.crRepo.GetByID(ctx, crID)
	if err != nil {
		return nil, err
	}
	if cr.Status != domain.CRPending {
		return nil, domain.ErrBadRequest.WithDetail("change request is not pending")
	}

	// Validate designated approvers if configured
	if s.projectRepo != nil {
		task, tErr := s.taskRepo.GetByID(ctx, cr.TaskID)
		if tErr == nil {
			if proj, pErr := s.projectRepo.GetByID(ctx, task.ProjectID); pErr == nil {
				if approverIDs, ok := proj.Settings["approver_ids"].([]any); ok && len(approverIDs) > 0 {
					allowed := false
					for _, aid := range approverIDs {
						if aidStr, ok := aid.(string); ok && aidStr == reviewerID.String() {
							allowed = true
							break
						}
					}
					if !allowed {
						return nil, domain.ErrForbidden.WithDetail("you are not a designated approver for this project")
					}
				}
			}
		}
	}

	now := time.Now()
	cr.ReviewerID = &reviewerID
	cr.Status = domain.CRApproved
	cr.ReviewNote = note
	cr.ReviewedAt = &now

	var updated *domain.TaskChangeRequest
	var appliedTask *domain.Task
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		// Update the change request
		var err error
		updated, err = s.crRepo.Update(ctx, tx, cr)
		if err != nil {
			return err
		}

		// Apply changes to the task
		task, err := s.taskRepo.GetByID(ctx, cr.TaskID)
		if err != nil {
			return err
		}

		if s.validateAssignees != nil {
			if ids := assigneeIDsFromChanges(cr.Changes); len(ids) > 0 {
				if vErr := s.validateAssignees(ctx, task.ProjectID, ids); vErr != nil {
					return vErr
				}
			}
		}
		if aErr := applyChangesToTask(task, cr.Changes); aErr != nil {
			return aErr
		}

		appliedTask, err = s.taskRepo.Update(ctx, tx, task)
		return err
	})
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			return nil, err // surface validation / membership errors as-is (4xx)
		}
		return nil, fmt.Errorf("approve change request: %w", err)
	}

	// Keep the live cache and progress roll-ups in step with the approved change,
	// exactly as a direct edit does.
	if s.cache != nil && appliedTask != nil && s.cache.IsProjectLoaded(ctx, appliedTask.ProjectID) {
		if cErr := s.cache.SetTask(ctx, appliedTask.ProjectID, appliedTask); cErr != nil {
			log.Warn().Err(cErr).Str("task_id", appliedTask.ID.String()).Msg("failed to refresh task cache after approval")
		}
		s.cache.RecalcProgressUp(ctx, appliedTask.ProjectID, appliedTask.ID)
	}

	s.publishEvent(ctx, domain.EventChangeRequestApproved, cr.OrgID.String(), cr.ID.String(), map[string]any{
		"task_id":     cr.TaskID.String(),
		"reviewer_id": reviewerID.String(),
	})

	// Also publish task.updated so real-time clients see the approved changes
	s.publishEvent(ctx, domain.EventTaskUpdated, cr.OrgID.String(), cr.TaskID.String(), cr.Changes)

	s.enqueueActivity(cr.OrgID.String(), "change_request", cr.ID.String(), "approved", reviewerID.String(), cr.Changes)

	// Notify the proposer that their change request was approved
	s.enqueueNotification(cr.ProposerID.String(), cr.OrgID.String(), "change_request_approved",
		"Change request approved",
		"Your change request has been approved",
		map[string]any{"task_id": cr.TaskID.String(), "change_request_id": cr.ID.String()})

	// Notify all assignees of the task (excluding the proposer to avoid duplicates)
	task, tErr := s.taskRepo.GetByID(ctx, cr.TaskID)
	if tErr == nil {
		for _, aid := range task.AssigneeIDs {
			if aid != cr.ProposerID {
				s.enqueueNotification(aid.String(), cr.OrgID.String(), "change_request_approved",
					"Task updated via approval",
					"A change request affecting your task has been approved",
					map[string]any{"task_id": cr.TaskID.String(), "change_request_id": cr.ID.String()})
			}
		}
	}

	return updated, nil
}

// Reject rejects a change request.
func (s *TaskChangeRequestService) Reject(ctx context.Context, crID, reviewerID uuid.UUID, note string) (*domain.TaskChangeRequest, error) {
	cr, err := s.crRepo.GetByID(ctx, crID)
	if err != nil {
		return nil, err
	}
	if cr.Status != domain.CRPending {
		return nil, domain.ErrBadRequest.WithDetail("change request is not pending")
	}

	now := time.Now()
	cr.ReviewerID = &reviewerID
	cr.Status = domain.CRRejected
	cr.ReviewNote = note
	cr.ReviewedAt = &now

	var updated *domain.TaskChangeRequest
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		updated, err = s.crRepo.Update(ctx, tx, cr)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("reject change request: %w", err)
	}

	s.publishEvent(ctx, domain.EventChangeRequestRejected, cr.OrgID.String(), cr.ID.String(), map[string]any{
		"task_id":     cr.TaskID.String(),
		"reviewer_id": reviewerID.String(),
	})

	s.enqueueActivity(cr.OrgID.String(), "change_request", cr.ID.String(), "rejected", reviewerID.String(), nil)

	// Notify the proposer that their change request was rejected
	s.enqueueNotification(cr.ProposerID.String(), cr.OrgID.String(), "change_request_rejected",
		"Change request rejected",
		fmt.Sprintf("Your change request was rejected: %s", note),
		map[string]any{"task_id": cr.TaskID.String(), "change_request_id": cr.ID.String()})

	return updated, nil
}

// ListByTask returns change requests for a task, optionally filtered by status.
func (s *TaskChangeRequestService) ListByTask(ctx context.Context, taskID uuid.UUID, status *string) ([]*domain.TaskChangeRequest, error) {
	return s.crRepo.ListByTask(ctx, taskID, status)
}

// ListByProject returns change requests for a project, optionally filtered by status, search, or proposer.
func (s *TaskChangeRequestService) ListByProject(ctx context.Context, projectID uuid.UUID, status *string, search *string, proposerID *uuid.UUID, limit, offset int) ([]*domain.TaskChangeRequest, int, error) {
	return s.crRepo.ListByProject(ctx, projectID, status, search, proposerID, limit, offset)
}

// CountPendingByTask returns the number of pending change requests for a task.
func (s *TaskChangeRequestService) CountPendingByTask(ctx context.Context, taskID uuid.UUID) (int, error) {
	return s.crRepo.CountPendingByTask(ctx, taskID)
}

// changeTimeLayouts are the date formats a change request may carry. The UI
// sends full ISO timestamps; API clients and agents often send plain dates.
var changeTimeLayouts = []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05", "2006-01-02"}

// parseChangeTime parses a change-request date value. nil clears the field.
func parseChangeTime(field string, val any) (*time.Time, error) {
	if val == nil {
		return nil, nil
	}
	str, ok := val.(string)
	if !ok {
		return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s must be a date string or null", field))
	}
	str = strings.TrimSpace(str)
	if str == "" {
		return nil, nil
	}
	for _, layout := range changeTimeLayouts {
		if t, err := time.Parse(layout, str); err == nil {
			return &t, nil
		}
	}
	return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s: %q is not a valid date (use YYYY-MM-DD or RFC3339)", field, str))
}

// parseChangeHours parses an hours value. nil clears the field.
func parseChangeHours(field string, val any) (*float64, error) {
	var f float64
	switch v := val.(type) {
	case nil:
		return nil, nil
	case float64:
		f = v
	case float32:
		f = float64(v)
	case int:
		f = float64(v)
	case int64:
		f = float64(v)
	case json.Number:
		parsed, err := v.Float64()
		if err != nil {
			return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s must be a number", field))
		}
		f = parsed
	case string:
		if strings.TrimSpace(v) == "" {
			return nil, nil
		}
		parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s must be a number", field))
		}
		f = parsed
	default:
		return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s must be a number or null", field))
	}
	if f < 0 {
		return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s cannot be negative", field))
	}
	return &f, nil
}

func parseChangeUUID(field string, val any) (*uuid.UUID, error) {
	if val == nil {
		return nil, nil
	}
	str, ok := val.(string)
	if !ok {
		return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s must be a UUID string or null", field))
	}
	if strings.TrimSpace(str) == "" {
		return nil, nil
	}
	uid, err := uuid.Parse(strings.TrimSpace(str))
	if err != nil {
		return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s: %q is not a valid id", field, str))
	}
	return &uid, nil
}

func parseChangeStrings(field string, val any) ([]string, error) {
	switch v := val.(type) {
	case nil:
		return []string{}, nil
	case []string:
		return v, nil
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			str, ok := item.(string)
			if !ok {
				return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s must be a list of strings", field))
			}
			out = append(out, str)
		}
		return out, nil
	default:
		return nil, domain.ErrBadRequest.WithDetail(fmt.Sprintf("%s must be a list of strings", field))
	}
}

var validChangePriorities = map[string]bool{"critical": true, "high": true, "medium": true, "low": true}

// applyChangesToTask validates a change set and applies it to the task.
// It is all-or-nothing: on error the task is left untouched. Unknown fields and
// invalid values are rejected rather than silently skipped, so an approved
// change request always results in exactly what was proposed.
func applyChangesToTask(task *domain.Task, changes map[string]any) error {
	next := *task // work on a copy; commit only if everything validates

	for key, val := range changes {
		switch key {
		case "title":
			str, ok := val.(string)
			if !ok || strings.TrimSpace(str) == "" {
				return domain.ErrBadRequest.WithDetail("title must be a non-empty string")
			}
			next.Title = strings.TrimSpace(str)
		case "description":
			str, ok := val.(string)
			if !ok && val != nil {
				return domain.ErrBadRequest.WithDetail("description must be a string")
			}
			next.Description = strings.TrimSpace(str)
		case "status":
			str, ok := val.(string)
			if !ok || strings.TrimSpace(str) == "" {
				return domain.ErrBadRequest.WithDetail("status must be a non-empty string")
			}
			next.Status = str
		case "priority":
			str, ok := val.(string)
			if !ok || !validChangePriorities[str] {
				return domain.ErrBadRequest.WithDetail("priority must be one of critical, high, medium, low")
			}
			next.Priority = str
		case "due_date":
			t, err := parseChangeTime(key, val)
			if err != nil {
				return err
			}
			next.DueDate = t
		case "start_date":
			t, err := parseChangeTime(key, val)
			if err != nil {
				return err
			}
			next.StartDate = t
		case "estimated_hours":
			f, err := parseChangeHours(key, val)
			if err != nil {
				return err
			}
			next.EstimatedHours = f
		case "actual_hours":
			f, err := parseChangeHours(key, val)
			if err != nil {
				return err
			}
			next.ActualHours = f
		case "labels":
			labels, err := parseChangeStrings(key, val)
			if err != nil {
				return err
			}
			next.Labels = labels
		case "reporter_id":
			uid, err := parseChangeUUID(key, val)
			if err != nil {
				return err
			}
			next.ReporterID = uid
		case "recurrence_rule":
			str, ok := val.(string)
			if val == nil {
				next.RecurrenceRule = nil
			} else if !ok {
				return domain.ErrBadRequest.WithDetail("recurrence_rule must be a string or null")
			} else {
				next.RecurrenceRule = &str
			}
		case "assignee_id", "assignee_ids":
			// handled together below so the primary assignee and the list never diverge
		default:
			return domain.ErrBadRequest.WithDetail(fmt.Sprintf("field %q cannot be changed through a change request", key))
		}
	}

	// Assignees: the list is authoritative; the primary assignee is its first element.
	if raw, ok := changes["assignee_ids"]; ok {
		strs, err := parseChangeStrings("assignee_ids", raw)
		if err != nil {
			return err
		}
		ids := make([]uuid.UUID, 0, len(strs))
		seen := map[uuid.UUID]bool{}
		for _, str := range strs {
			uid, perr := uuid.Parse(strings.TrimSpace(str))
			if perr != nil {
				return domain.ErrBadRequest.WithDetail(fmt.Sprintf("assignee_ids: %q is not a valid id", str))
			}
			if !seen[uid] {
				seen[uid] = true
				ids = append(ids, uid)
			}
		}
		next.AssigneeIDs = ids
		if len(ids) > 0 {
			first := ids[0]
			next.AssigneeID = &first
		} else {
			next.AssigneeID = nil
		}
	} else if raw, ok := changes["assignee_id"]; ok {
		uid, err := parseChangeUUID("assignee_id", raw)
		if err != nil {
			return err
		}
		if uid == nil {
			next.AssigneeID = nil
			next.AssigneeIDs = []uuid.UUID{}
		} else {
			next.AssigneeID = uid
			ids := []uuid.UUID{*uid}
			for _, existing := range task.AssigneeIDs {
				if existing != *uid {
					ids = append(ids, existing)
				}
			}
			next.AssigneeIDs = ids
		}
	}

	if next.StartDate != nil && next.DueDate != nil && next.DueDate.Before(*next.StartDate) {
		return domain.ErrBadRequest.WithDetail("due_date cannot be before start_date")
	}

	*task = next
	return nil
}

// assigneeIDsFromChanges returns the assignee ids a change set would assign, for membership validation.
func assigneeIDsFromChanges(changes map[string]any) []uuid.UUID {
	var out []uuid.UUID
	if raw, ok := changes["assignee_ids"]; ok {
		strs, _ := parseChangeStrings("assignee_ids", raw)
		for _, str := range strs {
			if uid, err := uuid.Parse(strings.TrimSpace(str)); err == nil {
				out = append(out, uid)
			}
		}
	} else if raw, ok := changes["assignee_id"]; ok {
		if uid, _ := parseChangeUUID("assignee_id", raw); uid != nil {
			out = append(out, *uid)
		}
	}
	return out
}

func (s *TaskChangeRequestService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
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

func (s *TaskChangeRequestService) enqueueNotification(userID, orgID, ntype, title, body string, payload map[string]any) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewNotificationTask(worker.NotificationPayload{
		UserID:  userID,
		OrgID:   orgID,
		Type:    ntype,
		Title:   title,
		Body:    body,
		Payload: payload,
	})
	if err != nil {
		log.Error().Err(err).Msg("build change request notification task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("enqueue change request notification task")
	}
}

func (s *TaskChangeRequestService) enqueueActivity(orgID, entityType, entityID, action, actorID string, changes map[string]any) {
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
