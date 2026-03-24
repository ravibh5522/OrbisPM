package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/worker"
)

// mentionRe matches @word where word is alphanumeric, dot, dash, or underscore.
var mentionRe = regexp.MustCompile(`@([a-zA-Z0-9._-]+)`)

type CreateCommentParams struct {
	OrgID     uuid.UUID  `json:"-"`
	TaskID    uuid.UUID  `json:"-"`
	UserID    uuid.UUID  `json:"-"`
	ProjectID uuid.UUID  `json:"-"`
	Body      string     `json:"body" validate:"required,min=1"`
	ParentID  *uuid.UUID `json:"parent_id,omitempty"`
}

type CommentService struct {
	commentRepo   repository.CommentRepository
	orgMemberRepo repository.OrgMemberRepository
	txm           *repository.TxManager
	workerSrv     *worker.Server
}

func NewCommentService(commentRepo repository.CommentRepository, orgMemberRepo repository.OrgMemberRepository, txm *repository.TxManager, workerSrv *worker.Server) *CommentService {
	return &CommentService{commentRepo: commentRepo, orgMemberRepo: orgMemberRepo, txm: txm, workerSrv: workerSrv}
}

func (s *CommentService) Create(ctx context.Context, params CreateCommentParams) (*domain.Comment, error) {
	comment := &domain.Comment{
		OrgID:    params.OrgID,
		TaskID:   params.TaskID,
		UserID:   params.UserID,
		Body:     params.Body,
		ParentID: params.ParentID,
	}

	var created *domain.Comment
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.commentRepo.Create(ctx, tx, comment)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}

	// Enqueue activity log
	s.enqueueActivity(created.OrgID.String(), "comment", created.ID.String(), "created", created.UserID.String())

	// Parse @mentions and notify mentioned users
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		s.processMentions(ctx, created, params.ProjectID)
	}()

	return created, nil
}

// processMentions extracts @name tokens from the body, resolves them to org members, and sends notifications.
func (s *CommentService) processMentions(ctx context.Context, comment *domain.Comment, projectID uuid.UUID) {
	matches := mentionRe.FindAllStringSubmatch(comment.Body, -1)
	if len(matches) == 0 {
		return
	}

	// Collect unique mention tokens (lowercased)
	tokenSet := make(map[string]struct{}, len(matches))
	for _, m := range matches {
		tokenSet[strings.ToLower(m[1])] = struct{}{}
	}

	// Load all org members
	members, err := s.orgMemberRepo.ListByOrg(ctx, comment.OrgID)
	if err != nil {
		log.Error().Err(err).Msg("load org members for mentions")
		return
	}

	// Build a lookup: lowercase(name or email-prefix) → userID
	mentioned := make(map[uuid.UUID]struct{})
	for _, member := range members {
		nameKey := strings.ToLower(strings.ReplaceAll(member.DisplayName, " ", ""))
		emailKey := strings.ToLower(strings.Split(member.Email, "@")[0])

		for token := range tokenSet {
			if token == nameKey || token == emailKey {
				// Don't notify the comment author
				if member.UserID != comment.UserID {
					mentioned[member.UserID] = struct{}{}
				}
			}
		}
	}

	// Send notifications
	for userID := range mentioned {
		s.enqueueNotification(
			userID.String(),
			comment.OrgID.String(),
			"mention",
			"You were mentioned in a comment",
			comment.Body,
			map[string]any{
				"task_id":    comment.TaskID.String(),
				"comment_id": comment.ID.String(),
				"project_id": projectID.String(),
			},
		)
	}
}

func (s *CommentService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Comment, error) {
	return s.commentRepo.ListByTask(ctx, taskID)
}

func (s *CommentService) ListByTaskPaginated(ctx context.Context, taskID uuid.UUID, limit, offset int) ([]*domain.Comment, int, error) {
	return s.commentRepo.ListByTaskPaginated(ctx, taskID, limit, offset)
}

func (s *CommentService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.commentRepo.Delete(ctx, tx, id)
	})
}

// --- Worker helpers ---

func (s *CommentService) enqueueActivity(orgID, entityType, entityID, action, actorID string) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewActivityLogTask(worker.ActivityLogPayload{
		OrgID:      orgID,
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
	})
	if err != nil {
		log.Error().Err(err).Msg("build activity log task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("enqueue activity log task")
	}
}

func (s *CommentService) enqueueNotification(userID, orgID, ntype, title, body string, payload map[string]any) {
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
		log.Error().Err(err).Msg("build notification task for mention")
		return
	}
	// Delay mention notifications by 5 minutes to batch with nearby task updates
	if err := s.workerSrv.Enqueue(task, asynq.ProcessIn(5*time.Minute)); err != nil {
		log.Error().Err(err).Msg("enqueue notification task for mention")
	}
}
