package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// WatcherHandler handles task watcher HTTP endpoints.
type WatcherHandler struct {
	watchSvc *service.WatcherService
}

// NewWatcherHandler creates a new WatcherHandler.
func NewWatcherHandler(watchSvc *service.WatcherService) *WatcherHandler {
	return &WatcherHandler{watchSvc: watchSvc}
}

// Routes registers watcher routes (nested under /tasks/{taskId}).
func (h *WatcherHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Watch)
	r.Delete("/", h.Unwatch)
	r.Get("/", h.List)
	return r
}

// Watch godoc
// @Summary Watch a task
// @Description Subscribe the current user as a watcher on a task
// @Tags Watchers
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 201 {object} swaggerTaskWatcher
// @Failure 409 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/watchers [post]
func (h *WatcherHandler) Watch(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())

	if err := h.watchSvc.Watch(r.Context(), taskID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// Unwatch godoc
// @Summary Unwatch a task
// @Description Remove the current user as a watcher on a task
// @Tags Watchers
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/watchers [delete]
func (h *WatcherHandler) Unwatch(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())

	if err := h.watchSvc.Unwatch(r.Context(), taskID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// List godoc
// @Summary List task watchers
// @Description List all watchers of a task
// @Tags Watchers
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {array} swaggerTaskWatcher
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/watchers [get]
func (h *WatcherHandler) List(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}

	watchers, err := h.watchSvc.ListByTask(r.Context(), taskID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, watchers)
}
