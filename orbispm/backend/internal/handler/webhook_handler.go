package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// WebhookHandler handles webhook HTTP endpoints.
type WebhookHandler struct {
	whSvc *service.WebhookService
}

// NewWebhookHandler creates a new WebhookHandler.
func NewWebhookHandler(whSvc *service.WebhookService) *WebhookHandler {
	return &WebhookHandler{whSvc: whSvc}
}

// Routes registers webhook routes.
func (h *WebhookHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Route("/{webhookId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
	})
	return r
}

func (h *WebhookHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateWebhookParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	wh, err := h.whSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, wh)
}

func (h *WebhookHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "webhookId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid webhook id"})
		return
	}
	wh, err := h.whSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, wh)
}

func (h *WebhookHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	whs, err := h.whSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if whs == nil {
		whs = []*domain.Webhook{}
	}
	JSON(w, http.StatusOK, whs)
}

func (h *WebhookHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "webhookId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid webhook id"})
		return
	}
	var params service.UpdateWebhookParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	wh, err := h.whSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, wh)
}

func (h *WebhookHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "webhookId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid webhook id"})
		return
	}
	if err := h.whSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- API Key Handler ---

// APIKeyHandler handles API key HTTP endpoints.
type APIKeyHandler struct {
	akSvc *service.APIKeyService
}

// NewAPIKeyHandler creates a new APIKeyHandler.
func NewAPIKeyHandler(akSvc *service.APIKeyService) *APIKeyHandler {
	return &APIKeyHandler{akSvc: akSvc}
}

// Routes registers API key routes.
func (h *APIKeyHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Delete("/{keyId}", h.Delete)
	return r
}

func (h *APIKeyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateAPIKeyParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())
	params.UserID = middleware.UserIDFromCtx(r.Context())

	result, err := h.akSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, result)
}

func (h *APIKeyHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	keys, err := h.akSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if keys == nil {
		keys = []*domain.APIKey{}
	}
	JSON(w, http.StatusOK, keys)
}

func (h *APIKeyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "keyId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid key id"})
		return
	}
	if err := h.akSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
