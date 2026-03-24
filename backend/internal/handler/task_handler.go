package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/service"
)

// TaskHandler handles task HTTP endpoints.
type TaskHandler struct {
	taskSvc *service.TaskService
}

func NewTaskHandler(taskSvc *service.TaskService) *TaskHandler {
	return &TaskHandler{taskSvc: taskSvc}
}

// Routes registers task routes. Mounted under /orgs/{orgId}/projects/{projectId}/tasks.
func (h *TaskHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Get("/tree", h.ListTree)
	r.Get("/export", h.Export)
	r.Get("/calendar.ics", h.CalendarExport)

	r.Route("/{taskId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
		r.Get("/tree", h.GetTree)
		r.Post("/submit-review", h.SubmitForReview)
		r.Post("/complete", h.MarkComplete)
		r.Post("/duplicate", h.Duplicate)
	})

	return r
}

// Create godoc
// @Summary Create task
// @Description Create a new task in a project
// @Tags Tasks
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param body body swaggerCreateTaskParams true "Task data"
// @Success 201 {object} swaggerTask
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks [post]
func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateTaskParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	params.ProjectID = projectID

	task, err := h.taskSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, task)
}

// Get godoc
// @Summary Get task
// @Description Retrieve a task by ID
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {object} swaggerTask
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId} [get]
func (h *TaskHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	task, err := h.taskSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
}

// GetTree godoc
// @Summary Get task tree
// @Description Retrieve a task with its full subtask tree
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {object} swaggerTaskTree
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/tree [get]
func (h *TaskHandler) GetTree(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	tree, err := h.taskSvc.GetTree(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	if tree == nil {
		tree = []*domain.Task{}
	}
	JSON(w, http.StatusOK, tree)
}

// ListTree godoc
// @Summary List project task tree
// @Description Retrieve all tasks in a project as a nested tree structure
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200 {array} domain.TaskTree
// @Router /orgs/{orgId}/projects/{projectId}/tasks/tree [get]
func (h *TaskHandler) ListTree(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	limit := queryInt(r, "limit", 500)
	if limit > 2000 {
		limit = 2000 // hard cap
	}
	tasks, err := h.taskSvc.ListTreeByProjectLight(r.Context(), projectID, limit)
	if err != nil {
		Error(w, r, err)
		return
	}
	tree := buildTaskTree(tasks)
	JSON(w, http.StatusOK, tree)
}

// buildTaskTree converts a flat list of tasks into nested TaskTree structures.
func buildTaskTree(tasks []*domain.Task) []*domain.TaskTree {
	nodeMap := make(map[string]*domain.TaskTree, len(tasks))
	var roots []*domain.TaskTree

	// Create nodes
	for _, t := range tasks {
		nodeMap[t.ID.String()] = &domain.TaskTree{Task: t}
	}

	// Build parent-child relationships
	for _, t := range tasks {
		node := nodeMap[t.ID.String()]
		if t.ParentTaskID == nil {
			roots = append(roots, node)
		} else {
			parentNode, ok := nodeMap[t.ParentTaskID.String()]
			if ok {
				parentNode.Children = append(parentNode.Children, node)
			} else {
				// orphan (parent not in this project's list) — treat as root
				roots = append(roots, node)
			}
		}
	}

	if roots == nil {
		roots = []*domain.TaskTree{}
	}
	return roots
}

// List godoc
// @Summary List tasks
// @Description List tasks in a project with optional filters and pagination
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param status query string false "Filter by status"
// @Param priority query string false "Filter by priority"
// @Param assignee_id query string false "Filter by assignee ID" format(uuid)
// @Param parent_id query string false "Filter by parent task ID" format(uuid)
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks [get]
func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}

	filter := repository.TaskFilter{
		ListFilter: repository.ListFilter{
			Limit:  queryInt(r, "limit", 50),
			Offset: queryInt(r, "offset", 0),
		},
		Status:      queryStr(r, "status"),
		Priority:    queryStr(r, "priority"),
		AssigneeID:  queryUUID(r, "assignee_id"),
		Search:      queryStr(r, "search"),
		ParentID:    queryStr(r, "parent_id"),
		DueDateFrom: queryStr(r, "due_date_from"),
		DueDateTo:   queryStr(r, "due_date_to"),
	}
	// Multi-value query params (comma-separated)
	if s := r.URL.Query().Get("statuses"); s != "" {
		filter.Statuses = strings.Split(s, ",")
	}
	if p := r.URL.Query().Get("priorities"); p != "" {
		filter.Priorities = strings.Split(p, ",")
	}
	if l := r.URL.Query().Get("labels"); l != "" {
		filter.Labels = strings.Split(l, ",")
	}
	if a := r.URL.Query().Get("assignee_ids"); a != "" {
		for _, idStr := range strings.Split(a, ",") {
			if uid, pErr := uuid.Parse(strings.TrimSpace(idStr)); pErr == nil {
				filter.AssigneeIDs = append(filter.AssigneeIDs, uid)
			}
		}
	}
	if sb := r.URL.Query().Get("sort_by"); sb != "" {
		filter.SortBy = sb
	}
	if so := r.URL.Query().Get("sort_order"); so == "asc" || so == "desc" {
		filter.SortOrder = so
	}

	tasks, total, err := h.taskSvc.List(r.Context(), projectID, filter)
	if err != nil {
		Error(w, r, err)
		return
	}
	if tasks == nil {
		tasks = []*domain.Task{}
	}
	JSON(w, http.StatusOK, ListResponse{
		Data:   tasks,
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	})
}

// Update godoc
// @Summary Update task
// @Description Update an existing task
// @Tags Tasks
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param body body swaggerUpdateTaskParams true "Updated task data"
// @Success 200 {object} swaggerTask
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId} [put]
func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	var params service.UpdateTaskParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	// Inject actor ID for review pipeline
	userID := tenant.UserID(r.Context())
	params.ActorID = &userID

	result, err := h.taskSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// Delete godoc
// @Summary Delete task
// @Description Delete a task by ID
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId} [delete]
func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	if _, err := h.taskSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SubmitForReview godoc
// @Summary Submit task for review
// @Description Transition a task to review status
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {object} swaggerTask
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/review [post]
func (h *TaskHandler) SubmitForReview(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	task, err := h.taskSvc.SubmitForReview(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
}

// MarkComplete godoc
// @Summary Mark task complete
// @Description Mark a task as completed
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {object} swaggerTask
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/complete [post]
func (h *TaskHandler) MarkComplete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	task, err := h.taskSvc.MarkComplete(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
}

// Duplicate godoc
// @Summary Duplicate task
// @Description Deep-copy a task and all its descendants
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 201 {object} swaggerTask
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/duplicate [post]
func (h *TaskHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	task, err := h.taskSvc.Duplicate(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, task)
}

// BulkUpdate godoc
// @Summary Bulk update tasks
// @Description Apply changes to multiple tasks at once
// @Tags Tasks
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param body body service.BulkUpdateParams true "Bulk update params"
// @Success 200 {array} swaggerTask
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/bulk [post]
func (h *TaskHandler) BulkUpdate(w http.ResponseWriter, r *http.Request) {
	var params service.BulkUpdateParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if len(params.TaskIDs) == 0 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "task_ids is required"})
		return
	}
	if len(params.TaskIDs) > 100 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "max 100 tasks per bulk operation"})
		return
	}
	tasks, err := h.taskSvc.BulkUpdate(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, tasks)
}

// Reorder godoc
// @Summary Reorder tasks
// @Description Update positions and optionally reparent multiple tasks
// @Tags Tasks
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param body body []service.ReorderItem true "Reorder items"
// @Success 204
// @Router /orgs/{orgId}/projects/{projectId}/tasks/reorder [patch]
func (h *TaskHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Items []service.ReorderItem `json:"items" validate:"required,min=1,max=200,dive"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if len(req.Items) == 0 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "at least one item required"})
		return
	}
	if err := h.taskSvc.Reorder(r.Context(), req.Items); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Export godoc
// @Summary Export tasks as CSV
// @Description Export all tasks in a project as a CSV file
// @Tags Tasks
// @Produce text/csv
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200
// @Router /orgs/{orgId}/projects/{projectId}/tasks/export [get]
func (h *TaskHandler) Export(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}

	filter := repository.TaskFilter{ListFilter: repository.ListFilter{Limit: 10000, Offset: 0}}
	tasks, _, err := h.taskSvc.List(r.Context(), projectID, filter)
	if err != nil {
		Error(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=tasks_export.csv")

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Header row
	_ = writer.Write([]string{
		"Title", "Description", "Status", "Priority",
		"Due Date", "Start Date", "Labels",
		"Estimated Hours", "Actual Hours",
		"Created At", "Updated At",
	})

	for _, t := range tasks {
		dueDate := ""
		if t.DueDate != nil {
			dueDate = t.DueDate.Format("2006-01-02")
		}
		startDate := ""
		if t.StartDate != nil {
			startDate = t.StartDate.Format("2006-01-02")
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
			t.Description,
			t.Status,
			t.Priority,
			dueDate,
			startDate,
			strings.Join(t.Labels, ", "),
			estHours,
			actHours,
			t.CreatedAt.Format("2006-01-02 15:04:05"),
			t.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// CalendarExport godoc
// @Summary Export tasks as iCal
// @Description Export all tasks with due dates as an iCal (.ics) file
// @Tags Tasks
// @Produce text/calendar
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200
// @Router /orgs/{orgId}/projects/{projectId}/tasks/calendar.ics [get]
func (h *TaskHandler) CalendarExport(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}

	filter := repository.TaskFilter{ListFilter: repository.ListFilter{Limit: 10000, Offset: 0}}
	tasks, _, err := h.taskSvc.List(r.Context(), projectID, filter)
	if err != nil {
		Error(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=tasks.ics")

	fmt.Fprintln(w, "BEGIN:VCALENDAR")
	fmt.Fprintln(w, "VERSION:2.0")
	fmt.Fprintln(w, "PRODID:-//OrbisPM//Tasks//EN")
	fmt.Fprintln(w, "CALSCALE:GREGORIAN")
	fmt.Fprintln(w, "METHOD:PUBLISH")

	for _, t := range tasks {
		if t.DueDate == nil {
			continue
		}

		fmt.Fprintln(w, "BEGIN:VTODO")
		fmt.Fprintf(w, "UID:%s@orbispm\r\n", t.ID.String())
		fmt.Fprintf(w, "DTSTAMP:%s\r\n", t.CreatedAt.UTC().Format("20060102T150405Z"))
		fmt.Fprintf(w, "SUMMARY:%s\r\n", escapeICal(t.Title))
		if t.Description != "" {
			fmt.Fprintf(w, "DESCRIPTION:%s\r\n", escapeICal(t.Description))
		}
		fmt.Fprintf(w, "DUE:%s\r\n", t.DueDate.UTC().Format("20060102T150405Z"))
		if t.StartDate != nil {
			fmt.Fprintf(w, "DTSTART:%s\r\n", t.StartDate.UTC().Format("20060102T150405Z"))
		}
		// Map priority: iCal 1=high, 5=medium, 9=low
		switch t.Priority {
		case "critical":
			fmt.Fprintln(w, "PRIORITY:1")
		case "high":
			fmt.Fprintln(w, "PRIORITY:3")
		case "medium":
			fmt.Fprintln(w, "PRIORITY:5")
		case "low":
			fmt.Fprintln(w, "PRIORITY:9")
		}
		// Map status
		switch t.Status {
		case "done":
			fmt.Fprintln(w, "STATUS:COMPLETED")
		case "in_progress":
			fmt.Fprintln(w, "STATUS:IN-PROCESS")
		default:
			fmt.Fprintln(w, "STATUS:NEEDS-ACTION")
		}
		if len(t.Labels) > 0 {
			fmt.Fprintf(w, "CATEGORIES:%s\r\n", strings.Join(t.Labels, ","))
		}
		fmt.Fprintln(w, "END:VTODO")
	}

	fmt.Fprintln(w, "END:VCALENDAR")
}

// escapeICal escapes special characters for iCal text values.
func escapeICal(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, ",", "\\,")
	s = strings.ReplaceAll(s, ";", "\\;")
	return s
}
