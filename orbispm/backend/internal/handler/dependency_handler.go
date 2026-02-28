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
