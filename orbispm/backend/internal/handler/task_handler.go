package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
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

	r.Route("/{taskId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
		r.Get("/tree", h.GetTree)
		r.Post("/submit-review", h.SubmitForReview)
		r.Post("/complete", h.MarkComplete)
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
// @Description Retrieve all tasks in a project ordered for tree rendering
// @Tags Tasks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200 {array} domain.Task
// @Router /orgs/{orgId}/projects/{projectId}/tasks/tree [get]
func (h *TaskHandler) ListTree(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	tasks, err := h.taskSvc.ListTreeByProject(r.Context(), projectID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if tasks == nil {
		tasks = []*domain.Task{}
	}
	JSON(w, http.StatusOK, tasks)
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
		Status:     queryStr(r, "status"),
		Priority:   queryStr(r, "priority"),
		AssigneeID: queryUUID(r, "assignee_id"),
		Search:     queryStr(r, "search"),
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
	task, err := h.taskSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
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
	if err := h.taskSvc.Delete(r.Context(), id); err != nil {
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
