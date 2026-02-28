package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/storage"
)

// AttachmentService handles file attachment business logic.
type AttachmentService struct {
	attachmentRepo repository.AttachmentRepository
	storageClient  *storage.Client
	txm            *repository.TxManager
}

// NewAttachmentService creates a new AttachmentService.
func NewAttachmentService(
	attachmentRepo repository.AttachmentRepository,
	storageClient *storage.Client,
	txm *repository.TxManager,
) *AttachmentService {
	return &AttachmentService{
		attachmentRepo: attachmentRepo,
		storageClient:  storageClient,
		txm:            txm,
	}
}

// CreateAttachmentParams holds parameters for creating an attachment.
type CreateAttachmentParams struct {
	OrgID     uuid.UUID
	TaskID    *uuid.UUID
	CommentID *uuid.UUID
	UserID    uuid.UUID
	Filename  string
	FileSize  int64
	MimeType  string
}

// Create records an attachment in the database and returns a pre-signed upload URL.
func (s *AttachmentService) Create(ctx context.Context, params CreateAttachmentParams) (*domain.Attachment, string, error) {
	storagePath := fmt.Sprintf("orgs/%s/attachments/%s/%s",
		params.OrgID.String(), uuid.New().String(), params.Filename)

	att := &domain.Attachment{
		OrgID:       params.OrgID,
		TaskID:      params.TaskID,
		CommentID:   params.CommentID,
		UploadedBy:  params.UserID,
		Filename:    params.Filename,
		StoragePath: storagePath,
		FileSize:    params.FileSize,
		MimeType:    params.MimeType,
	}

	var created *domain.Attachment
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.attachmentRepo.Create(ctx, tx, att)
		return err
	})
	if err != nil {
		return nil, "", err
	}

	// Generate pre-signed upload URL
	uploadURL, err := s.storageClient.PresignedPutURL(ctx, storagePath, 15*time.Minute)
	if err != nil {
		return nil, "", fmt.Errorf("generate upload url: %w", err)
	}

	return created, uploadURL, nil
}

// GetDownloadURL returns a pre-signed download URL for an attachment.
func (s *AttachmentService) GetDownloadURL(ctx context.Context, id uuid.UUID) (*domain.Attachment, string, error) {
	att, err := s.attachmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, "", err
	}

	downloadURL, err := s.storageClient.PresignedGetURL(ctx, att.StoragePath, 1*time.Hour)
	if err != nil {
		return nil, "", fmt.Errorf("generate download url: %w", err)
	}

	return att, downloadURL, nil
}

// ListByTask returns all attachments for a task.
func (s *AttachmentService) ListByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.Attachment, error) {
	return s.attachmentRepo.ListByTask(ctx, taskID)
}

// Delete removes an attachment and its storage object.
func (s *AttachmentService) Delete(ctx context.Context, id uuid.UUID) error {
	att, err := s.attachmentRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.attachmentRepo.Delete(ctx, tx, id)
	}); err != nil {
		return err
	}

	// Best-effort delete from storage
	_ = s.storageClient.Delete(ctx, att.StoragePath)
	return nil
}
