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
