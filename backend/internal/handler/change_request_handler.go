package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/service"
)

// ChangeRequestHandler handles task change request endpoints.
type ChangeRequestHandler struct {
	crSvc *service.TaskChangeRequestService
}

func NewChangeRequestHandler(crSvc *service.TaskChangeRequestService) *ChangeRequestHandler {
	return &ChangeRequestHandler{crSvc: crSvc}
}

// TaskRoutes registers change request routes under a task. Mounted under /tasks/{taskId}/change-requests.
func (h *ChangeRequestHandler) TaskRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.ListByTask)
	r.Post("/", h.Create)
	return r
}

// ProjectRoutes registers project-level change request routes. Mounted under /projects/{projectId}/change-requests.
func (h *ChangeRequestHandler) ProjectRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.ListByProject)
	return r
}

// ReviewRoutes registers review action routes. Mounted under /change-requests.
func (h *ChangeRequestHandler) ReviewRoutes() chi.Router {
	r := chi.NewRouter()
	r.Route("/{crId}", func(r chi.Router) {
		r.Post("/approve", h.Approve)
		r.Post("/reject", h.Reject)
	})
	return r
}

// Create proposes a new change request for a task.
func (h *ChangeRequestHandler) Create(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := tenant.UserID(r.Context())

	var body struct {
		Changes map[string]any `json:"changes"`
		Reason  string         `json:"reason"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	cr, err := h.crSvc.ProposeChange(r.Context(), orgID, taskID, userID, body.Changes, body.Reason)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, cr)
}

// ListByTask returns change requests for a task.
func (h *ChangeRequestHandler) ListByTask(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	statusFilter := queryStr(r, "status")

	crs, err := h.crSvc.ListByTask(r.Context(), taskID, statusFilter)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, crs)
}

// ListByProject returns change requests for all tasks in a project.
func (h *ChangeRequestHandler) ListByProject(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	statusFilter := queryStr(r, "status")
	search := queryStr(r, "search")
	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)

	var proposerID *uuid.UUID
	if p := r.URL.Query().Get("proposer_id"); p != "" {
		pid, err := uuid.Parse(p)
		if err == nil {
			proposerID = &pid
		}
	}

	crs, total, err := h.crSvc.ListByProject(r.Context(), projectID, statusFilter, search, proposerID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ListResponse{Data: crs, Total: total, Limit: limit, Offset: offset})
}

// Approve approves a change request and applies the changes.
func (h *ChangeRequestHandler) Approve(w http.ResponseWriter, r *http.Request) {
	crID, err := uuidParam(r, "crId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid change request id"})
		return
	}
	reviewerID := tenant.UserID(r.Context())
	if reviewerID == uuid.Nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "unauthorized"})
		return
	}

	var body struct {
		Note string `json:"note"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	cr, err := h.crSvc.Approve(r.Context(), crID, reviewerID, body.Note)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, cr)
}

// Reject rejects a change request.
func (h *ChangeRequestHandler) Reject(w http.ResponseWriter, r *http.Request) {
	crID, err := uuidParam(r, "crId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid change request id"})
		return
	}
	reviewerID := tenant.UserID(r.Context())
	if reviewerID == uuid.Nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "unauthorized"})
		return
	}

	var body struct {
		Note string `json:"note"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	cr, err := h.crSvc.Reject(r.Context(), crID, reviewerID, body.Note)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, cr)
}
