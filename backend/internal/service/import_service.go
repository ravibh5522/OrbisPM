package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"
	"github.com/xuri/excelize/v2"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/worker"
)

const MaxImportTasks = 200

// ImportService handles import job business logic.
type ImportService struct {
	importRepo    repository.ImportJobRepository
	taskRepo      repository.TaskRepository
	orgMemberRepo repository.OrgMemberRepository
	txm           *repository.TxManager
	workerSrv     *worker.Server
}

// NewImportService creates a new ImportService.
func NewImportService(
	importRepo repository.ImportJobRepository,
	taskRepo repository.TaskRepository,
	orgMemberRepo repository.OrgMemberRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
) *ImportService {
	return &ImportService{
		importRepo:    importRepo,
		taskRepo:      taskRepo,
		orgMemberRepo: orgMemberRepo,
		txm:           txm,
		workerSrv:     workerSrv,
	}
}

// ──────────────────────────────────────────────────
// Analyze Excel – return sheets with column headers
// ──────────────────────────────────────────────────

// SheetInfo describes one sheet in an uploaded Excel file.
type SheetInfo struct {
	Name     string   `json:"name"`
	Columns  []string `json:"columns"`
	RowCount int      `json:"row_count"`
}

// AnalyzeExcel opens an Excel file and returns sheet metadata.
func (s *ImportService) AnalyzeExcel(data []byte) ([]SheetInfo, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("open excel: %w", err)
	}
	defer f.Close()

	var sheets []SheetInfo
	for _, name := range f.GetSheetList() {
		rows, err := f.GetRows(name)
		if err != nil || len(rows) == 0 {
			continue
		}
		// First row is header
		columns := make([]string, len(rows[0]))
		for i, c := range rows[0] {
			columns[i] = strings.TrimSpace(c)
		}
		sheets = append(sheets, SheetInfo{
			Name:     name,
			Columns:  columns,
			RowCount: len(rows) - 1, // exclude header
		})
	}
	return sheets, nil
}

// ──────────────────────────────────────────────────
// Process Excel – import tasks with hierarchy
// ──────────────────────────────────────────────────

// ExcelColumnMapping maps column indices to field roles for one sheet.
type ExcelColumnMapping struct {
	Task          int `json:"task"`     // -1 = not mapped
	Subtask1      int `json:"subtask1"` // depth 1
	Subtask2      int `json:"subtask2"` // depth 2
	Subtask3      int `json:"subtask3"` // depth 3
	Description   int `json:"description"`
	StartDate     int `json:"start_date"`
	EndDate       int `json:"end_date"`
	Priority      int `json:"priority"`
	Status        int `json:"status"`
	AssigneeEmail int `json:"assignee_email"`
}

// SheetImportConfig is the import spec for one sheet.
type SheetImportConfig struct {
	SheetName string             `json:"sheet_name"`
	Mapping   ExcelColumnMapping `json:"mapping"`
}

// ProcessExcelParams holds params for Excel import.
type ProcessExcelParams struct {
	OrgID     uuid.UUID
	ProjectID uuid.UUID
	UserID    uuid.UUID
	FileName  string
	Data      []byte
	Sheets    []SheetImportConfig
}

// ProcessExcelResult is the response for an Excel import.
type ProcessExcelResult struct {
	Job         *domain.ImportJob  `json:"job"`
	Assignments []ImportAssignment `json:"assignments,omitempty"`
}

// ImportAssignment records a user assigned during import.
type ImportAssignment struct {
	Email    string `json:"email"`
	UserID   string `json:"user_id"`
	TaskName string `json:"task_name"`
}

// ProcessExcel imports tasks from an Excel workbook.
func (s *ImportService) ProcessExcel(ctx context.Context, params ProcessExcelParams) (*ProcessExcelResult, error) {
	f, err := excelize.OpenReader(bytes.NewReader(params.Data))
	if err != nil {
		return nil, fmt.Errorf("open excel: %w", err)
	}
	defer f.Close()

	var allParsed []parsedRow
	for _, sc := range params.Sheets {
		rows, err := f.GetRows(sc.SheetName)
		if err != nil {
			return nil, fmt.Errorf("read sheet %q: %w", sc.SheetName, err)
		}
		if len(rows) < 2 {
			continue
		}
		for i, row := range rows[1:] { // skip header
			pr := parseExcelRow(row, sc.Mapping, i+2, sc.SheetName)
			if pr.taskName != "" || pr.sub1 != "" || pr.sub2 != "" || pr.sub3 != "" {
				allParsed = append(allParsed, pr)
			}
		}
	}

	if len(allParsed) == 0 {
		return nil, fmt.Errorf("no tasks found in selected sheets")
	}
	if len(allParsed) > MaxImportTasks {
		return nil, domain.NewAppError(400, fmt.Sprintf("too many rows (%d); max %d tasks per import", len(allParsed), MaxImportTasks))
	}

	// --- Build hierarchy: auto-detect parents by name ---
	type taskNode struct {
		task   *domain.Task
		rowNum int
		emails []string
	}
	validStatuses := map[string]bool{"todo": true, "in_progress": true, "done": true, "blocked": true}
	validPriorities := map[string]bool{"low": true, "medium": true, "high": true, "critical": true}

	// Email → userID cache
	emailCache := map[string]*uuid.UUID{}
	lookupUser := func(email string) *uuid.UUID {
		email = strings.ToLower(strings.TrimSpace(email))
		if email == "" {
			return nil
		}
		if cached, ok := emailCache[email]; ok {
			return cached
		}
		uid, err := s.orgMemberRepo.FindUserByEmail(ctx, email)
		if err != nil {
			emailCache[email] = nil
			return nil
		}
		emailCache[email] = &uid
		return &uid
	}

	// Track last seen task at each depth for auto-parenting
	var lastDepth0ID, lastDepth1ID, lastDepth2ID *uuid.UUID
	var lastDepth0Name, lastDepth1Name, lastDepth2Name string

	var nodes []taskNode
	processedRows := 0
	errorRows := 0
	var rowErrors []map[string]any

	for _, pr := range allParsed {
		// Determine depth and title
		depth := 0
		title := pr.taskName
		if pr.sub3 != "" && lastDepth2ID != nil {
			depth = 3
			title = pr.sub3
		} else if pr.sub2 != "" && lastDepth1ID != nil {
			depth = 2
			title = pr.sub2
		} else if pr.sub1 != "" && lastDepth0ID != nil {
			depth = 1
			title = pr.sub1
		} else if pr.taskName != "" {
			depth = 0
			title = pr.taskName
		} else if pr.sub1 != "" {
			// sub1 without a parent task — treat as depth 0
			depth = 0
			title = pr.sub1
		} else if pr.sub2 != "" {
			depth = 0
			title = pr.sub2
		} else if pr.sub3 != "" {
			depth = 0
			title = pr.sub3
		}

		if title == "" {
			errorRows++
			rowErrors = append(rowErrors, map[string]any{"row": pr.rowNum, "sheet": pr.sheet, "error": "no task name found"})
			continue
		}

		task := &domain.Task{
			OrgID:      params.OrgID,
			ProjectID:  params.ProjectID,
			ReporterID: &params.UserID,
			Title:      title,
			Status:     domain.TaskStatusTodo,
			Priority:   domain.PriorityMedium,
			Depth:      depth,
			Labels:     []string{},
			Metadata:   map[string]any{},
		}

		// Set parent
		switch depth {
		case 1:
			task.ParentTaskID = lastDepth0ID
		case 2:
			task.ParentTaskID = lastDepth1ID
		case 3:
			task.ParentTaskID = lastDepth2ID
		}

		// Apply optional fields
		if pr.description != "" {
			task.Description = pr.description
		}
		if pr.startDate != "" {
			if t, err := parseFlexibleDate(pr.startDate); err == nil {
				task.StartDate = &t
			}
		}
		if pr.endDate != "" {
			if t, err := parseFlexibleDate(pr.endDate); err == nil {
				task.DueDate = &t
			}
		}
		if pr.priority != "" {
			p := strings.ToLower(strings.TrimSpace(pr.priority))
			if validPriorities[p] {
				task.Priority = p
			}
		}
		if pr.status != "" {
			st := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(pr.status), " ", "_"))
			if validStatuses[st] {
				task.Status = st
			}
		}

		// Assignee by email (comma-separated for multiple)
		var assignEmails []string
		if pr.assigneeEmail != "" {
			for _, raw := range strings.Split(pr.assigneeEmail, ",") {
				e := strings.TrimSpace(raw)
				if e != "" {
					assignEmails = append(assignEmails, e)
				}
			}
			var resolvedIDs []uuid.UUID
			for _, em := range assignEmails {
				uid := lookupUser(em)
				if uid != nil {
					resolvedIDs = append(resolvedIDs, *uid)
				}
			}
			if len(resolvedIDs) > 0 {
				task.AssigneeID = &resolvedIDs[0]
				task.AssigneeIDs = resolvedIDs
			}
		}

		nodes = append(nodes, taskNode{task: task, rowNum: pr.rowNum, emails: assignEmails})
	}

	// --- Create tasks in a transaction ---
	// Deduplication: track already-created tasks by (depth, title) so that
	// if the same task name appears again at the same depth we reuse the
	// existing one as parent instead of creating a duplicate.
	type depthKey struct {
		depth int
		title string
	}
	var assignments []ImportAssignment
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		// Reset depth tracking
		lastDepth0ID = nil
		lastDepth1ID = nil
		lastDepth2ID = nil
		lastDepth0Name = ""
		lastDepth1Name = ""
		lastDepth2Name = ""

		createdTasks := map[depthKey]*uuid.UUID{} // (depth,title) → taskID

		for i := range nodes {
			n := &nodes[i]
			task := n.task

			// Re-resolve parent IDs using the actual created IDs
			switch task.Depth {
			case 1:
				task.ParentTaskID = lastDepth0ID
			case 2:
				task.ParentTaskID = lastDepth1ID
			case 3:
				task.ParentTaskID = lastDepth2ID
			}

			// Dedup: if a task with the same name+depth already exists,
			// reuse it as parent tracker instead of creating a duplicate.
			dk := depthKey{depth: task.Depth, title: strings.ToLower(task.Title)}
			if existingID, ok := createdTasks[dk]; ok && task.Depth < 3 {
				// Same task seen before — skip creation, just update trackers
				switch task.Depth {
				case 0:
					lastDepth0ID = existingID
					lastDepth0Name = task.Title
				case 1:
					lastDepth1ID = existingID
					lastDepth1Name = task.Title
				case 2:
					lastDepth2ID = existingID
					lastDepth2Name = task.Title
				}
				continue
			}

			created, err := s.taskRepo.Create(ctx, tx, task)
			if err != nil {
				errorRows++
				rowErrors = append(rowErrors, map[string]any{"row": n.rowNum, "error": err.Error()})
				continue
			}
			processedRows++

			// Register in dedup map
			createdTasks[dk] = &created.ID

			// Update depth trackers with ACTUAL created IDs
			switch created.Depth {
			case 0:
				lastDepth0ID = &created.ID
				lastDepth0Name = created.Title
				lastDepth1ID = nil
				lastDepth2ID = nil
				lastDepth1Name = ""
				lastDepth2Name = ""
			case 1:
				lastDepth1ID = &created.ID
				lastDepth1Name = created.Title
				lastDepth2ID = nil
				lastDepth2Name = ""
			case 2:
				lastDepth2ID = &created.ID
				lastDepth2Name = created.Title
			}
			_ = lastDepth0Name
			_ = lastDepth1Name
			_ = lastDepth2Name

			for _, em := range n.emails {
				if created.AssigneeID != nil {
					assignments = append(assignments, ImportAssignment{
						Email:    em,
						UserID:   created.AssigneeID.String(),
						TaskName: created.Title,
					})
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("import transaction: %w", err)
	}

	// Record import job
	now := time.Now()
	totalRows := len(allParsed)
	status := "completed"
	if errorRows > 0 && processedRows == 0 {
		status = "failed"
	} else if errorRows > 0 {
		status = "completed_with_errors"
	}

	var job *domain.ImportJob
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		j := &domain.ImportJob{
			OrgID:         params.OrgID,
			ProjectID:     params.ProjectID,
			UserID:        params.UserID,
			Status:        "pending",
			FileName:      params.FileName,
			ColumnMapping: map[string]any{"type": "excel", "sheets": len(params.Sheets)},
		}
		created, err := s.importRepo.Create(ctx, tx, j)
		if err != nil {
			return err
		}
		created.Status = status
		created.TotalRows = &totalRows
		created.ProcessedRows = processedRows
		created.ErrorRows = errorRows
		created.Errors = rowErrors
		if created.Errors == nil {
			created.Errors = []map[string]any{}
		}
		created.Result = map[string]any{"created": processedRows, "assigned": len(assignments)}
		created.CompletedAt = &now
		job, err = s.importRepo.Update(ctx, tx, created)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("save import job: %w", err)
	}

	// Send email notifications to assigned users (async)
	s.notifyAssignees(params.OrgID, params.ProjectID, assignments)

	return &ProcessExcelResult{Job: job, Assignments: assignments}, nil
}

// notifyAssignees sends email notifications to users assigned during import.
func (s *ImportService) notifyAssignees(orgID, projectID uuid.UUID, assignments []ImportAssignment) {
	if s.workerSrv == nil || len(assignments) == 0 {
		return
	}
	// Group tasks by user
	byUser := map[string][]string{}
	for _, a := range assignments {
		byUser[a.UserID] = append(byUser[a.UserID], a.TaskName)
	}
	for userID, taskNames := range byUser {
		body := fmt.Sprintf("You have been assigned %d task(s) via import:\n• %s",
			len(taskNames), strings.Join(taskNames, "\n• "))
		task, err := worker.NewNotificationTask(worker.NotificationPayload{
			UserID:  userID,
			OrgID:   orgID.String(),
			Type:    "task_import_assigned",
			Title:   fmt.Sprintf("%d task(s) assigned to you from import", len(taskNames)),
			Body:    body,
			Payload: map[string]any{"project_id": projectID.String(), "task_names": taskNames},
		})
		if err != nil {
			log.Error().Err(err).Msg("build import notification task")
			continue
		}
		if _, err := s.workerSrv.Client().Enqueue(task); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("enqueue import notification")
		}
	}
}

// parsedRow holds values extracted from one Excel row.
type parsedRow struct {
	sheet         string
	rowNum        int
	taskName      string
	sub1          string
	sub2          string
	sub3          string
	description   string
	startDate     string
	endDate       string
	priority      string
	status        string
	assigneeEmail string
}

func cellVal(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func parseExcelRow(row []string, m ExcelColumnMapping, rowNum int, sheet string) parsedRow {
	return parsedRow{
		sheet:         sheet,
		rowNum:        rowNum,
		taskName:      cellVal(row, m.Task),
		sub1:          cellVal(row, m.Subtask1),
		sub2:          cellVal(row, m.Subtask2),
		sub3:          cellVal(row, m.Subtask3),
		description:   cellVal(row, m.Description),
		startDate:     cellVal(row, m.StartDate),
		endDate:       cellVal(row, m.EndDate),
		priority:      cellVal(row, m.Priority),
		status:        cellVal(row, m.Status),
		assigneeEmail: cellVal(row, m.AssigneeEmail),
	}
}

// ──────────────────────────────────────────────────
// Export Excel – hierarchical export matching import format
// ──────────────────────────────────────────────────

// loadExportData fetches tasks and org member emails inside a single RLS-scoped transaction.
func (s *ImportService) loadExportData(ctx context.Context, orgID, projectID uuid.UUID) (
	tasks []*domain.Task,
	emailByID map[string]string,
	err error,
) {
	emailByID = map[string]string{}
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		filter := repository.TaskFilter{ListFilter: repository.ListFilter{Limit: 10000, Offset: 0}}
		var listErr error
		tasks, _, listErr = s.taskRepo.List(ctx, projectID, filter)
		if listErr != nil {
			return fmt.Errorf("list tasks: %w", listErr)
		}
		members, _, _ := s.orgMemberRepo.ListByOrg(ctx, orgID, repository.MemberFilter{ListFilter: repository.ListFilter{Limit: 10000}})
		for _, m := range members {
			emailByID[m.UserID.String()] = m.Email
		}
		return nil
	})
	return
}

// buildExportMaps creates parent-tree and task-by-ID maps used by both CSV and Excel exports.
func buildExportMaps(tasks []*domain.Task) (byParent map[string][]*domain.Task, taskByID map[string]*domain.Task) {
	byParent = map[string][]*domain.Task{}
	taskByID = map[string]*domain.Task{}
	for _, t := range tasks {
		taskByID[t.ID.String()] = t
		key := ""
		if t.ParentTaskID != nil {
			key = t.ParentTaskID.String()
		}
		byParent[key] = append(byParent[key], t)
	}
	return
}

// resolveEmails returns comma-separated assignee emails for a task.
func resolveEmails(t *domain.Task, emailByID map[string]string) string {
	var emails []string
	for _, uid := range t.AssigneeIDs {
		if e := emailByID[uid.String()]; e != "" {
			emails = append(emails, e)
		}
	}
	if len(emails) == 0 && t.AssigneeID != nil {
		if e := emailByID[t.AssigneeID.String()]; e != "" {
			emails = append(emails, e)
		}
	}
	return strings.Join(emails, ", ")
}

// ExportExcel generates an .xlsx file with tasks arranged hierarchically.
func (s *ImportService) ExportExcel(ctx context.Context, orgID, projectID uuid.UUID) ([]byte, error) {
	tasks, emailByID, err := s.loadExportData(ctx, orgID, projectID)
	if err != nil {
		return nil, err
	}

	byParent, taskByID := buildExportMaps(tasks)

	ef := excelize.NewFile()
	defer ef.Close()
	sheet := "Tasks"
	ef.SetSheetName("Sheet1", sheet)

	// Header — columns: Task, Subtask, Subtask, Subtask, Parent Task, Description, Start Date, End Date, Priority, Status, Assignee Email
	headers := []string{"Task", "Subtask", "Subtask", "Subtask", "Parent Task", "Description", "Start Date", "End Date", "Priority", "Status", "Assignee Email"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		ef.SetCellValue(sheet, cell, h)
	}

	// Style header bold
	style, _ := ef.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	for i := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		ef.SetCellStyle(sheet, cell, cell, style)
	}

	row := 2
	var writeTree func(tasks []*domain.Task, depth int)
	writeTree = func(tasks []*domain.Task, depth int) {
		for _, t := range tasks {
			col := depth + 1 // depth 0 → col 1, depth 1 → col 2, etc.
			if col > 4 {
				col = 4
			}
			cell, _ := excelize.CoordinatesToCellName(col, row)
			ef.SetCellValue(sheet, cell, t.Title)

			// Parent Task (col 5) — show parent name for subtasks
			if t.ParentTaskID != nil {
				if parent, ok := taskByID[t.ParentTaskID.String()]; ok {
					c, _ := excelize.CoordinatesToCellName(5, row)
					ef.SetCellValue(sheet, c, parent.Title)
				}
			}
			// Description (col 6)
			descCell, _ := excelize.CoordinatesToCellName(6, row)
			ef.SetCellValue(sheet, descCell, t.Description)
			// Start Date (col 7)
			if t.StartDate != nil {
				c, _ := excelize.CoordinatesToCellName(7, row)
				ef.SetCellValue(sheet, c, t.StartDate.Format("2006-01-02"))
			}
			// End Date (col 8)
			if t.DueDate != nil {
				c, _ := excelize.CoordinatesToCellName(8, row)
				ef.SetCellValue(sheet, c, t.DueDate.Format("2006-01-02"))
			}
			// Priority (col 9)
			pCell, _ := excelize.CoordinatesToCellName(9, row)
			ef.SetCellValue(sheet, pCell, t.Priority)
			// Status (col 10)
			sCell, _ := excelize.CoordinatesToCellName(10, row)
			ef.SetCellValue(sheet, sCell, t.Status)
			// Assignee Email (col 11)
			if e := resolveEmails(t, emailByID); e != "" {
				eCell, _ := excelize.CoordinatesToCellName(11, row)
				ef.SetCellValue(sheet, eCell, e)
			}

			row++
			children := byParent[t.ID.String()]
			if len(children) > 0 {
				writeTree(children, depth+1)
			}
		}
	}

	// Start from root tasks (no parent)
	writeTree(byParent[""], 0)

	// Auto-fit column widths
	for i := range headers {
		colName, _ := excelize.ColumnNumberToName(i + 1)
		ef.SetColWidth(sheet, colName, colName, 18)
	}

	var buf bytes.Buffer
	if err := ef.Write(&buf); err != nil {
		return nil, fmt.Errorf("write excel: %w", err)
	}
	return buf.Bytes(), nil
}

// ExportCSV generates a CSV file with the same columns as the Excel export.
func (s *ImportService) ExportCSV(ctx context.Context, orgID, projectID uuid.UUID) ([]byte, error) {
	tasks, emailByID, err := s.loadExportData(ctx, orgID, projectID)
	if err != nil {
		return nil, err
	}

	byParent, taskByID := buildExportMaps(tasks)

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Header
	_ = writer.Write([]string{
		"Title", "Parent Task", "Description", "Start Date", "End Date",
		"Priority", "Status", "Assignee Email", "Depth",
		"Labels", "Estimated Hours", "Actual Hours",
	})

	var writeTree func(tasks []*domain.Task)
	writeTree = func(tasks []*domain.Task) {
		for _, t := range tasks {
			parentName := ""
			if t.ParentTaskID != nil {
				if parent, ok := taskByID[t.ParentTaskID.String()]; ok {
					parentName = parent.Title
				}
			}
			startDate := ""
			if t.StartDate != nil {
				startDate = t.StartDate.Format("2006-01-02")
			}
			dueDate := ""
			if t.DueDate != nil {
				dueDate = t.DueDate.Format("2006-01-02")
			}
			estHours := ""
			if t.EstimatedHours != nil {
				estHours = fmt.Sprintf("%.1f", *t.EstimatedHours)
			}
			actHours := ""
			if t.ActualHours != nil {
				actHours = fmt.Sprintf("%.1f", *t.ActualHours)
			}
			_ = writer.Write([]string{
				t.Title,
				parentName,
				t.Description,
				startDate,
				dueDate,
				t.Priority,
				t.Status,
				resolveEmails(t, emailByID),
				fmt.Sprintf("%d", t.Depth),
				strings.Join(t.Labels, ", "),
				estHours,
				actHours,
			})

			children := byParent[t.ID.String()]
			if len(children) > 0 {
				writeTree(children)
			}
		}
	}

	writeTree(byParent[""])
	writer.Flush()

	return buf.Bytes(), nil
}

// ──────────────────────────────────────────────────
// Legacy CSV support (kept for backwards compat)
// ──────────────────────────────────────────────────

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

	headers, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read CSV headers: %w", err)
	}

	colMap := make(map[int]string)
	for i, h := range headers {
		h = strings.TrimSpace(h)
		if field, ok := params.ColumnMapping[h]; ok && allowedTaskFields[field] {
			colMap[i] = field
		}
	}

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

	var rows [][]string
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		rows = append(rows, record)
	}

	totalRows := len(rows)
	processedRows := 0
	errorRows := 0
	var rowErrors []map[string]any

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

			rowNum := rowIdx + 2
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

	now := time.Now()
	status := "completed"
	if errorRows > 0 && processedRows == 0 {
		status = "failed"
	} else if errorRows > 0 {
		status = "completed_with_errors"
	}

	var result *domain.ImportJob
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
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
