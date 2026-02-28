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
