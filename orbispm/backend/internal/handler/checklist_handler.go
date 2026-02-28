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

// Create godoc
// @Summary Create checklist item
// @Description Create a new checklist item for a task
// @Tags Checklists
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param body body swaggerCreateChecklistParams true "Checklist item data"
// @Success 201 {object} swaggerChecklist
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/checklists [post]
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

// List godoc
// @Summary List checklist items
// @Description List all checklist items for a task
// @Tags Checklists
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {array} swaggerChecklist
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/checklists [get]
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

// Update godoc
// @Summary Update checklist item
// @Description Update a checklist item (title, completed status, position)
// @Tags Checklists
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param checklistId path string true "Checklist ID" format(uuid)
// @Param body body swaggerUpdateChecklistParams true "Updated checklist data"
// @Success 200 {object} swaggerChecklist
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/checklists/{checklistId} [put]
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

// Delete godoc
// @Summary Delete checklist item
// @Description Delete a checklist item
// @Tags Checklists
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param checklistId path string true "Checklist ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/checklists/{checklistId} [delete]
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
