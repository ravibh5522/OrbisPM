package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// ImportService handles import job business logic.
type ImportService struct {
	importRepo repository.ImportJobRepository
	taskRepo   repository.TaskRepository
	txm        *repository.TxManager
}

// NewImportService creates a new ImportService.
func NewImportService(importRepo repository.ImportJobRepository, taskRepo repository.TaskRepository, txm *repository.TxManager) *ImportService {
	return &ImportService{importRepo: importRepo, taskRepo: taskRepo, txm: txm}
}

// CreateImportParams holds parameters for creating an import job.
type CreateImportParams struct {
	OrgID     uuid.UUID
	ProjectID uuid.UUID
	UserID    uuid.UUID
	FilePath  string
	FileName  string
}

// Create creates a new import job.
func (s *ImportService) Create(ctx context.Context, params CreateImportParams) (*domain.ImportJob, error) {
	job := &domain.ImportJob{
		OrgID:     params.OrgID,
		ProjectID: params.ProjectID,
		UserID:    params.UserID,
		Status:    "pending",
		FilePath:  params.FilePath,
		FileName:  params.FileName,
	}

	var created *domain.ImportJob
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.importRepo.Create(ctx, tx, job)
		return err
	})
	return created, err
}

// Get returns an import job by ID.
func (s *ImportService) Get(ctx context.Context, id uuid.UUID) (*domain.ImportJob, error) {
	return s.importRepo.GetByID(ctx, id)
}

// ListByProject returns all import jobs for a project.
func (s *ImportService) ListByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.ImportJob, error) {
	return s.importRepo.ListByProject(ctx, projectID)
}

// ProcessCSVParams holds parameters for CSV import processing.
type ProcessCSVParams struct {
	OrgID         uuid.UUID
	ProjectID     uuid.UUID
	UserID        uuid.UUID
	FileName      string
	Reader        io.Reader
	ColumnMapping map[string]string // csv_header -> task_field
}

// allowedTaskFields maps accepted task field names to true.
var allowedTaskFields = map[string]bool{
	"title": true, "description": true, "status": true, "priority": true,
	"due_date": true, "start_date": true, "labels": true,
}

// ProcessCSV parses a CSV file and creates tasks from it.
func (s *ImportService) ProcessCSV(ctx context.Context, params ProcessCSVParams) (*domain.ImportJob, error) {
	reader := csv.NewReader(params.Reader)
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	// Read header row
	headers, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read CSV headers: %w", err)
	}

	// Build column index: position -> task_field
	colMap := make(map[int]string) // index -> task_field
	for i, h := range headers {
		h = strings.TrimSpace(h)
		if field, ok := params.ColumnMapping[h]; ok && allowedTaskFields[field] {
			colMap[i] = field
		}
	}

	// Ensure title is mapped
	hasTitle := false
	for _, f := range colMap {
		if f == "title" {
			hasTitle = true
			break
		}
	}
	if !hasTitle {
		return nil, fmt.Errorf("column mapping must include 'title' field")
	}

	// Read all data rows
	var rows [][]string
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Skip malformed rows
			continue
		}
		rows = append(rows, record)
	}

	totalRows := len(rows)
	processedRows := 0
	errorRows := 0
	var rowErrors []map[string]any

	// Valid status/priority values
	validStatuses := map[string]bool{"todo": true, "in_progress": true, "done": true, "blocked": true}
	validPriorities := map[string]bool{"low": true, "medium": true, "high": true, "critical": true}

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for rowIdx, row := range rows {
			task := &domain.Task{
				OrgID:      params.OrgID,
				ProjectID:  params.ProjectID,
				ReporterID: &params.UserID,
				Status:     domain.TaskStatusTodo,
				Priority:   domain.PriorityMedium,
				Labels:     []string{},
				Metadata:   map[string]any{},
				Depth:      0,
			}

			rowNum := rowIdx + 2 // 1-indexed, skip header
			var rowErr string

			for colIdx, field := range colMap {
				if colIdx >= len(row) {
					continue
				}
				val := strings.TrimSpace(row[colIdx])
				if val == "" {
					continue
				}
				switch field {
				case "title":
					task.Title = val
				case "description":
					task.Description = val
				case "status":
					s := strings.ToLower(strings.ReplaceAll(val, " ", "_"))
					if validStatuses[s] {
						task.Status = s
					}
				case "priority":
					p := strings.ToLower(val)
					if validPriorities[p] {
						task.Priority = p
					}
				case "due_date":
					if t, err := parseFlexibleDate(val); err == nil {
						task.DueDate = &t
					}
				case "start_date":
					if t, err := parseFlexibleDate(val); err == nil {
						task.StartDate = &t
					}
				case "labels":
					labels := strings.Split(val, ",")
					for i, l := range labels {
						labels[i] = strings.TrimSpace(l)
					}
					task.Labels = labels
				}
			}

			if task.Title == "" {
				rowErr = "title is empty"
			}

			if rowErr != "" {
				errorRows++
				rowErrors = append(rowErrors, map[string]any{"row": rowNum, "error": rowErr})
				continue
			}

			if _, err := s.taskRepo.Create(ctx, tx, task); err != nil {
				errorRows++
				rowErrors = append(rowErrors, map[string]any{"row": rowNum, "error": err.Error()})
				log.Warn().Err(err).Int("row", rowNum).Msg("import: failed to create task")
				continue
			}
			processedRows++
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("import transaction: %w", err)
	}

	// Record the job: first create, then update with results
	now := time.Now()
	status := "completed"
	if errorRows > 0 && processedRows == 0 {
		status = "failed"
	} else if errorRows > 0 {
		status = "completed_with_errors"
	}

	var result *domain.ImportJob
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		// Create the base job record
		job := &domain.ImportJob{
			OrgID:         params.OrgID,
			ProjectID:     params.ProjectID,
			UserID:        params.UserID,
			Status:        "pending",
			FilePath:      "",
			FileName:      params.FileName,
			ColumnMapping: toAnyMap(params.ColumnMapping),
		}
		created, err := s.importRepo.Create(ctx, tx, job)
		if err != nil {
			return fmt.Errorf("create import job: %w", err)
		}

		// Update with final results
		created.Status = status
		created.TotalRows = &totalRows
		created.ProcessedRows = processedRows
		created.ErrorRows = errorRows
		created.Errors = rowErrors
		if created.Errors == nil {
			created.Errors = []map[string]any{}
		}
		created.Result = map[string]any{"created": processedRows}
		created.CompletedAt = &now

		result, err = s.importRepo.Update(ctx, tx, created)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("save import job: %w", err)
	}
	return result, nil
}

// parseFlexibleDate parses dates in multiple common formats.
func parseFlexibleDate(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339,
		"2006-01-02",
		"01/02/2006",
		"02-01-2006",
		"Jan 2, 2006",
		"2006-01-02 15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized date: %s", s)
}

// toAnyMap converts map[string]string to map[string]any.
func toAnyMap(m map[string]string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// CustomRoleService handles custom role business logic.
type CustomRoleService struct {
	roleRepo repository.CustomRoleRepository
	txm      *repository.TxManager
}

// NewCustomRoleService creates a new CustomRoleService.
func NewCustomRoleService(roleRepo repository.CustomRoleRepository, txm *repository.TxManager) *CustomRoleService {
	return &CustomRoleService{roleRepo: roleRepo, txm: txm}
}

// CreateCustomRoleParams holds parameters for creating a custom role.
type CreateCustomRoleParams struct {
	OrgID       uuid.UUID
	Name        string         `json:"name" validate:"required,min=2,max=50"`
	Description string         `json:"description,omitempty"`
	Permissions map[string]any `json:"permissions" validate:"required"`
}

// Create creates a new custom role.
func (s *CustomRoleService) Create(ctx context.Context, params CreateCustomRoleParams) (*domain.CustomRole, error) {
	role := &domain.CustomRole{
		OrgID:       params.OrgID,
		Name:        params.Name,
		Description: params.Description,
		Permissions: params.Permissions,
	}

	var created *domain.CustomRole
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.roleRepo.Create(ctx, tx, role)
		return err
	})
	return created, err
}

// Get returns a custom role by ID.
func (s *CustomRoleService) Get(ctx context.Context, id uuid.UUID) (*domain.CustomRole, error) {
	return s.roleRepo.GetByID(ctx, id)
}

// UpdateCustomRoleParams holds parameters for updating a custom role.
type UpdateCustomRoleParams struct {
	Name        *string         `json:"name,omitempty"`
	Description *string         `json:"description,omitempty"`
	Permissions *map[string]any `json:"permissions,omitempty"`
}

// Update updates a custom role.
func (s *CustomRoleService) Update(ctx context.Context, id uuid.UUID, params UpdateCustomRoleParams) (*domain.CustomRole, error) {
	role, err := s.roleRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.Name != nil {
		role.Name = *params.Name
	}
	if params.Description != nil {
		role.Description = *params.Description
	}
	if params.Permissions != nil {
		role.Permissions = *params.Permissions
	}

	var updated *domain.CustomRole
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.roleRepo.Update(ctx, tx, role)
		return err
	})
	return updated, err
}

// Delete removes a custom role.
func (s *CustomRoleService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.roleRepo.Delete(ctx, tx, id)
	})
}

// ListByOrg returns all custom roles for an org.
func (s *CustomRoleService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.CustomRole, error) {
	return s.roleRepo.ListByOrg(ctx, orgID)
}

// NotificationPrefService handles notification preference business logic.
type NotificationPrefService struct {
	prefRepo repository.NotificationPrefRepository
	txm      *repository.TxManager
}

// NewNotificationPrefService creates a new NotificationPrefService.
func NewNotificationPrefService(prefRepo repository.NotificationPrefRepository, txm *repository.TxManager) *NotificationPrefService {
	return &NotificationPrefService{prefRepo: prefRepo, txm: txm}
}

// UpsertPrefParams holds parameters for upserting a notification preference.
type UpsertPrefParams struct {
	UserID    uuid.UUID
	OrgID     uuid.UUID
	EventType string `json:"event_type" validate:"required"`
	Channel   string `json:"channel" validate:"required,oneof=in_app email slack discord teams"`
	Enabled   bool   `json:"enabled"`
}

// Upsert creates or updates a notification preference.
func (s *NotificationPrefService) Upsert(ctx context.Context, params UpsertPrefParams) error {
	pref := &domain.NotificationPreference{
		UserID:    params.UserID,
		OrgID:     params.OrgID,
		EventType: params.EventType,
		Channel:   params.Channel,
		Enabled:   params.Enabled,
	}
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.prefRepo.Upsert(ctx, tx, pref)
	})
}

// ListByUser returns all notification preferences for a user in an org.
func (s *NotificationPrefService) ListByUser(ctx context.Context, userID, orgID uuid.UUID) ([]*domain.NotificationPreference, error) {
	return s.prefRepo.ListByUser(ctx, userID, orgID)
}
