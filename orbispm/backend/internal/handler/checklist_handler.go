package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// ChecklistHandler handles checklist HTTP endpoints.
type ChecklistHandler struct {
	checklistSvc *service.ChecklistService
}

func NewChecklistHandler(checklistSvc *service.ChecklistService) *ChecklistHandler {
	return &ChecklistHandler{checklistSvc: checklistSvc}
}

// Routes registers checklist routes. Mounted under /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/checklists.
func (h *ChecklistHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{checklistId}", func(r chi.Router) {
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
	})

	return r
}

func (h *ChecklistHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateChecklistParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	params.TaskID = taskID

	item, err := h.checklistSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, item)
}

func (h *ChecklistHandler) List(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	items, err := h.checklistSvc.ListByTask(r.Context(), taskID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if items == nil {
		items = []*domain.Checklist{}
	}
	JSON(w, http.StatusOK, items)
}

func (h *ChecklistHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "checklistId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid checklist id"})
		return
	}
	var params service.UpdateChecklistParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	item, err := h.checklistSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, item)
}

func (h *ChecklistHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "checklistId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid checklist id"})
		return
	}
	if err := h.checklistSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
