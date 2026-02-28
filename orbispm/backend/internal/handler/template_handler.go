package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// TemplateHandler handles task template HTTP endpoints.
type TemplateHandler struct {
	tmplSvc *service.TemplateService
}

// NewTemplateHandler creates a new TemplateHandler.
func NewTemplateHandler(tmplSvc *service.TemplateService) *TemplateHandler {
	return &TemplateHandler{tmplSvc: tmplSvc}
}

// Routes registers template routes.
func (h *TemplateHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Route("/{templateId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
	})
	return r
}

// Create godoc
// @Summary Create task template
// @Description Create a reusable task template within an organization
// @Tags Templates
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerCreateTemplateParams true "Template data"
// @Success 201 {object} swaggerTaskTemplate
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/templates [post]
func (h *TemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateTemplateParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())
	params.UserID = middleware.UserIDFromCtx(r.Context())

	tmpl, err := h.tmplSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, tmpl)
}

// Get godoc
// @Summary Get task template
// @Description Retrieve a task template by ID
// @Tags Templates
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param templateId path string true "Template ID" format(uuid)
// @Success 200 {object} swaggerTaskTemplate
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/templates/{templateId} [get]
func (h *TemplateHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "templateId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid template id"})
		return
	}
	tmpl, err := h.tmplSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, tmpl)
}

// List godoc
// @Summary List task templates
// @Description List all task templates in an organization
// @Tags Templates
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerTaskTemplate
// @Router /orgs/{orgId}/templates [get]
func (h *TemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	templates, err := h.tmplSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if templates == nil {
		templates = []*domain.TaskTemplate{}
	}
	JSON(w, http.StatusOK, templates)
}

// Update godoc
// @Summary Update task template
// @Description Update a task template
// @Tags Templates
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param templateId path string true "Template ID" format(uuid)
// @Param body body swaggerUpdateTemplateParams true "Updated template data"
// @Success 200 {object} swaggerTaskTemplate
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/templates/{templateId} [put]
func (h *TemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "templateId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid template id"})
		return
	}
	var params service.UpdateTemplateParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	tmpl, err := h.tmplSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, tmpl)
}

// Delete godoc
// @Summary Delete task template
// @Description Delete a task template
// @Tags Templates
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param templateId path string true "Template ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/templates/{templateId} [delete]
func (h *TemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "templateId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid template id"})
		return
	}
	if err := h.tmplSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
