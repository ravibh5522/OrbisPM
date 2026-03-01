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

// Create godoc
// @Summary Create webhook
// @Description Register a new webhook for an organization
// @Tags Webhooks
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerCreateWebhookParams true "Webhook data"
// @Success 201 {object} swaggerWebhook
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/webhooks [post]
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

// Get godoc
// @Summary Get webhook
// @Description Retrieve a webhook by ID
// @Tags Webhooks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param webhookId path string true "Webhook ID" format(uuid)
// @Success 200 {object} swaggerWebhook
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/webhooks/{webhookId} [get]
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

// List godoc
// @Summary List webhooks
// @Description List all webhooks in an organization
// @Tags Webhooks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerWebhook
// @Router /orgs/{orgId}/webhooks [get]
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
	JSON(w, http.StatusOK, ListResponse{Data: whs, Total: len(whs), Limit: len(whs), Offset: 0})
}

// Update godoc
// @Summary Update webhook
// @Description Update a webhook configuration
// @Tags Webhooks
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param webhookId path string true "Webhook ID" format(uuid)
// @Param body body swaggerUpdateWebhookParams true "Updated webhook data"
// @Success 200 {object} swaggerWebhook
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/webhooks/{webhookId} [put]
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

// Delete godoc
// @Summary Delete webhook
// @Description Delete a webhook
// @Tags Webhooks
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param webhookId path string true "Webhook ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/webhooks/{webhookId} [delete]
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

// Create godoc
// @Summary Create API key
// @Description Generate a new API key for an organization
// @Tags APIKeys
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerCreateAPIKeyParams true "API key data"
// @Success 201 {object} map[string]interface{} "api_key object + raw_key"
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/api-keys [post]
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

// List godoc
// @Summary List API keys
// @Description List all API keys in an organization
// @Tags APIKeys
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerAPIKey
// @Router /orgs/{orgId}/api-keys [get]
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
	JSON(w, http.StatusOK, ListResponse{Data: keys, Total: len(keys), Limit: len(keys), Offset: 0})
}

// Delete godoc
// @Summary Delete API key
// @Description Revoke and delete an API key
// @Tags APIKeys
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param keyId path string true "API Key ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/api-keys/{keyId} [delete]
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
