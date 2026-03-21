package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

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

		applyChangesToTask(task, cr.Changes)

		_, err = s.taskRepo.Update(ctx, tx, task)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("approve change request: %w", err)
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

// ListByProject returns change requests for a project, optionally filtered by status.
func (s *TaskChangeRequestService) ListByProject(ctx context.Context, projectID uuid.UUID, status *string, limit, offset int) ([]*domain.TaskChangeRequest, int, error) {
	return s.crRepo.ListByProject(ctx, projectID, status, limit, offset)
}

// CountPendingByTask returns the number of pending change requests for a task.
func (s *TaskChangeRequestService) CountPendingByTask(ctx context.Context, taskID uuid.UUID) (int, error) {
	return s.crRepo.CountPendingByTask(ctx, taskID)
}

// applyChangesToTask applies a changes map to a task struct.
func applyChangesToTask(task *domain.Task, changes map[string]any) {
	for key, val := range changes {
		switch key {
		case "status":
			if s, ok := val.(string); ok {
				task.Status = s
			}
		case "priority":
			if s, ok := val.(string); ok {
				task.Priority = s
			}
		case "title":
			if s, ok := val.(string); ok {
				task.Title = s
			}
		case "description":
			if s, ok := val.(string); ok {
				task.Description = s
			}
		case "assignee_id":
			if s, ok := val.(string); ok {
				if uid, err := uuid.Parse(s); err == nil {
					task.AssigneeID = &uid
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
		case "labels":
			if arr, ok := val.([]any); ok {
				labels := make([]string, 0, len(arr))
				for _, v := range arr {
					if s, ok := v.(string); ok {
						labels = append(labels, s)
					}
				}
				task.Labels = labels
			}
		}
	}
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
