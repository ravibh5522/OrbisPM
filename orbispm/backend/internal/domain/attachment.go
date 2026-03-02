package domain

import (
	"time"

	"github.com/google/uuid"
)

// Attachment represents a file attached to a task, comment, or change request.
type Attachment struct {
	ID              uuid.UUID  `json:"id"`
	OrgID           uuid.UUID  `json:"org_id"`
	TaskID          *uuid.UUID `json:"task_id,omitempty"`
	CommentID       *uuid.UUID `json:"comment_id,omitempty"`
	ChangeRequestID *uuid.UUID `json:"change_request_id,omitempty"`
	UploadedBy      uuid.UUID  `json:"uploaded_by"`
	Filename        string     `json:"filename"`
	StoragePath     string     `json:"-"`
	FileSize        int64      `json:"file_size"`
	MimeType        string     `json:"mime_type"`
	CreatedAt       time.Time  `json:"created_at"`
}
