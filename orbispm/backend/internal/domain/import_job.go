package domain

import (
	"time"

	"github.com/google/uuid"
)

// ImportJob represents a CSV/XLSX import job.
type ImportJob struct {
	ID            uuid.UUID        `json:"id"`
	OrgID         uuid.UUID        `json:"org_id"`
	ProjectID     uuid.UUID        `json:"project_id"`
	UserID        uuid.UUID        `json:"user_id"`
	Status        string           `json:"status"`
	FilePath      string           `json:"-"`
	FileName      string           `json:"file_name"`
	ColumnMapping map[string]any   `json:"column_mapping,omitempty"`
	TotalRows     *int             `json:"total_rows,omitempty"`
	ProcessedRows int              `json:"processed_rows"`
	ErrorRows     int              `json:"error_rows"`
	Errors        []map[string]any `json:"errors,omitempty"`
	Result        map[string]any   `json:"result,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
	CompletedAt   *time.Time       `json:"completed_at,omitempty"`
}
