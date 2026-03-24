package service

import (
	"context"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/minio/minio-go/v7"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/repository"
)

// UploadService handles file uploads to MinIO/S3.
type UploadService struct {
	mc            *minio.Client
	presignMC     *minio.Client // client using public endpoint for presigning
	bucket        string
	maxSize       int64
	txMgr         *repository.TxManager
	attachmentR   repository.AttachmentRepository
	presignExpiry time.Duration
}

// NewUploadService creates a new UploadService.
// presignMC should use the browser-accessible MinIO endpoint so presigned URLs have valid signatures.
func NewUploadService(
	mc *minio.Client,
	presignMC *minio.Client,
	bucket string,
	maxSizeMB int,
	txMgr *repository.TxManager,
	attachmentR repository.AttachmentRepository,
) *UploadService {
	if presignMC == nil {
		presignMC = mc
	}
	return &UploadService{
		mc:            mc,
		presignMC:     presignMC,
		bucket:        bucket,
		maxSize:       int64(maxSizeMB) * 1024 * 1024,
		txMgr:         txMgr,
		attachmentR:   attachmentR,
		presignExpiry: 1 * time.Hour,
	}
}

// EnsureBucket creates the MinIO bucket if it doesn't exist.
func (u *UploadService) EnsureBucket(ctx context.Context) error {
	exists, err := u.mc.BucketExists(ctx, u.bucket)
	if err != nil {
		return fmt.Errorf("check bucket: %w", err)
	}
	if !exists {
		if err := u.mc.MakeBucket(ctx, u.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}
		log.Info().Str("bucket", u.bucket).Msg("created MinIO bucket")
	}
	return nil
}

// Upload stores a file in MinIO and creates the attachment record.
func (u *UploadService) Upload(
	ctx context.Context,
	orgID uuid.UUID,
	messageID uuid.UUID,
	fileName string,
	contentType string,
	fileSize int64,
	reader io.Reader,
) (*domain.Attachment, error) {
	if fileSize > u.maxSize {
		return nil, &domain.AppError{
			Code:    domain.ErrCodeValidation,
			Message: fmt.Sprintf("file exceeds maximum size of %d MB", u.maxSize/(1024*1024)),
		}
	}

	// Sanitize file name
	safeFileName := sanitizeFileName(fileName)

	// Build storage key: org_id/attachments/yyyy-mm/uuid_filename
	now := time.Now()
	storageKey := fmt.Sprintf("%s/attachments/%s/%s_%s",
		orgID.String(),
		now.Format("2006-01"),
		uuid.New().String()[:8],
		safeFileName,
	)

	// Upload to MinIO with a size limit reader
	limited := io.LimitReader(reader, u.maxSize+1)
	_, err := u.mc.PutObject(ctx, u.bucket, storageKey, limited, fileSize, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return nil, fmt.Errorf("upload to minio: %w", err)
	}

	// Build metadata
	metadata := map[string]any{
		"original_name": fileName,
	}
	if isImage(contentType) {
		metadata["is_image"] = true
	}

	att := &domain.Attachment{
		OrgID:       orgID,
		MessageID:   messageID,
		FileName:    safeFileName,
		FileSize:    fileSize,
		ContentType: contentType,
		StorageKey:  storageKey,
		Metadata:    metadata,
	}

	// Create attachment record in DB
	if err := u.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		return u.attachmentR.Create(ctx, tx, att)
	}); err != nil {
		// Clean up uploaded file on DB failure
		rmErr := u.mc.RemoveObject(ctx, u.bucket, storageKey, minio.RemoveObjectOptions{})
		if rmErr != nil {
			log.Error().Err(rmErr).Str("key", storageKey).Msg("failed to cleanup minio object after db error")
		}
		return nil, fmt.Errorf("create attachment record: %w", err)
	}

	// Generate presigned URL for the response
	url, err := u.PresignURL(ctx, storageKey)
	if err != nil {
		log.Warn().Err(err).Msg("failed to generate presigned url for attachment")
	} else {
		att.URL = url
	}

	return att, nil
}

// PresignURL generates a presigned download URL for an attachment.
// If a public URL is configured, the internal hostname is replaced with the
// browser-accessible one so the browser can reach MinIO directly.
func (u *UploadService) PresignURL(ctx context.Context, storageKey string) (string, error) {
	presigned, err := u.presignMC.PresignedGetObject(ctx, u.bucket, storageKey, u.presignExpiry, nil)
	if err != nil {
		return "", fmt.Errorf("presign url: %w", err)
	}
	return presigned.String(), nil
}

// GetAttachmentURL fetches an attachment by ID and returns a presigned URL.
func (u *UploadService) GetAttachmentURL(ctx context.Context, attachmentID uuid.UUID) (*domain.Attachment, error) {
	att, err := u.attachmentR.GetByID(ctx, nil, attachmentID)
	if err != nil {
		return nil, err
	}
	url, err := u.PresignURL(ctx, att.StorageKey)
	if err != nil {
		return nil, err
	}
	att.URL = url
	return att, nil
}

func sanitizeFileName(name string) string {
	// Strip directory path
	name = path.Base(name)
	// Replace problematic chars
	name = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == '\x00' {
			return '_'
		}
		return r
	}, name)
	if name == "" || name == "." || name == ".." {
		name = "file"
	}
	return name
}

func isImage(contentType string) bool {
	return strings.HasPrefix(contentType, "image/")
}
