package handler

import (
	"context"
	"fmt"
	"io"
	"github.com/rs/zerolog/log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/middleware"
)

// EmailTemplateHandler proxies email template CRUD to the email microservice.
type EmailTemplateHandler struct {
	emailServiceURL string
	apiKey          string
	client          *http.Client
}

// NewEmailTemplateHandler creates a new handler.
func NewEmailTemplateHandler() *EmailTemplateHandler {
	url := os.Getenv("EMAIL_SERVICE_URL")
	if url == "" {
		url = "http://email-service:8050"
	}
	apiKey := os.Getenv("EMAIL_SERVICE_API_KEY")
	if apiKey == "" {
		log.Warn().Msg("EMAIL_SERVICE_API_KEY not set, using dev fallback")
		apiKey = "email-service-dev-key"
	}
	return &EmailTemplateHandler{
		emailServiceURL: url,
		apiKey:          apiKey,
		client:          &http.Client{Timeout: 10 * time.Second},
	}
}

// Routes returns a chi.Router mounted under /orgs/{orgId}/email-templates.
func (h *EmailTemplateHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/defaults", h.ListDefaults)
	r.Get("/", h.ListCustom)
	r.Post("/preview", h.Preview)
	r.Get("/{templateName}", h.GetTemplate)
	r.Put("/{templateName}", h.UpsertTemplate)
	r.Delete("/{templateName}", h.DeleteTemplate)
	return r
}

func (h *EmailTemplateHandler) proxyWithContext(ctx context.Context, w http.ResponseWriter, method, path string, body io.Reader) {
	url := fmt.Sprintf("%s/api/v1/email%s", h.emailServiceURL, path)
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to create proxy request"})
		return
	}
	req.Header.Set("X-API-Key", h.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.client.Do(req)
	if err != nil {
		JSON(w, http.StatusBadGateway, ErrorResponse{Message: "email service unavailable"})
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		log.Error().Err(err).Msg("proxy copy error")
	}
}

func (h *EmailTemplateHandler) ListDefaults(w http.ResponseWriter, r *http.Request) {
	h.proxyWithContext(r.Context(), w, http.MethodGet, "/templates", nil)
}

func (h *EmailTemplateHandler) ListCustom(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	h.proxyWithContext(r.Context(), w, http.MethodGet, fmt.Sprintf("/templates/%s", orgID), nil)
}

func (h *EmailTemplateHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	name := chi.URLParam(r, "templateName")
	h.proxyWithContext(r.Context(), w, http.MethodGet, fmt.Sprintf("/templates/%s/%s", orgID, name), nil)
}

func (h *EmailTemplateHandler) UpsertTemplate(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	name := chi.URLParam(r, "templateName")
	h.proxyWithContext(r.Context(), w, http.MethodPut, fmt.Sprintf("/templates/%s/%s", orgID, name), r.Body)
}

func (h *EmailTemplateHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	name := chi.URLParam(r, "templateName")
	h.proxyWithContext(r.Context(), w, http.MethodDelete, fmt.Sprintf("/templates/%s/%s", orgID, name), nil)
}

func (h *EmailTemplateHandler) Preview(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	h.proxyWithContext(r.Context(), w, http.MethodPost, fmt.Sprintf("/templates/%s/render", orgID), r.Body)
}
