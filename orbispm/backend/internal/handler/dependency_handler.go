package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/service"
)

// DependencyHandler handles task dependency HTTP endpoints.
type DependencyHandler struct {
	depSvc *service.DependencyService
}

// NewDependencyHandler creates a new DependencyHandler.
func NewDependencyHandler(depSvc *service.DependencyService) *DependencyHandler {
	return &DependencyHandler{depSvc: depSvc}
}

// Routes registers dependency routes (nested under /tasks/{taskId}).
func (h *DependencyHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Add)
	r.Get("/", h.List)
	r.Get("/dependents", h.ListDependents)
	r.Delete("/{dependsOnId}", h.Remove)
	return r
}

type addDependencyRequest struct {
	DependsOnID string `json:"depends_on_id" validate:"required,uuid"`
	Type        string `json:"type" validate:"required,oneof=blocked_by blocks relates_to"`
}

// Add godoc
// @Summary Add task dependency
// @Description Add a dependency between two tasks
// @Tags Dependencies
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param body body addDependencyRequest true "Dependency data"
// @Success 201 {object} swaggerTaskDependency
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/dependencies [post]
func (h *DependencyHandler) Add(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}

	var req addDependencyRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	depID, err := uuid.Parse(req.DependsOnID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid depends_on_id"})
		return
	}

	if err := h.depSvc.Add(r.Context(), service.AddDependencyParams{
		TaskID:      taskID,
		DependsOnID: depID,
		Type:        req.Type,
	}); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// List godoc
// @Summary List task dependencies
// @Description List all dependencies of a task
// @Tags Dependencies
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {array} swaggerTaskDependency
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/dependencies [get]
func (h *DependencyHandler) List(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}

	deps, err := h.depSvc.ListByTask(r.Context(), taskID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, deps)
}

// ListDependents godoc
// @Summary List task dependents
// @Description List all tasks that depend on this task
// @Tags Dependencies
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {array} swaggerTaskDependency
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/dependents [get]
func (h *DependencyHandler) ListDependents(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}

	deps, err := h.depSvc.ListDependents(r.Context(), taskID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, deps)
}

// Remove godoc
// @Summary Remove task dependency
// @Description Remove a dependency from a task
// @Tags Dependencies
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param depId path string true "Dependency ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/dependencies/{depId} [delete]
func (h *DependencyHandler) Remove(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}

	depID, err := uuidParam(r, "dependsOnId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid depends_on_id"})
		return
	}

	if err := h.depSvc.Remove(r.Context(), taskID, depID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
