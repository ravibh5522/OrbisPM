package handler

import (
	"encoding/json"
	"net/http"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
)

// ThemeHandler manages org-level theme configuration.
type ThemeHandler struct {
	repo repository.OrgThemeRepository
}

// NewThemeHandler creates a new ThemeHandler.
func NewThemeHandler(repo repository.OrgThemeRepository) *ThemeHandler {
	return &ThemeHandler{repo: repo}
}

// GetOrgTheme returns the org's theme configuration.
// Any org member may call this — used on page load to enforce locked theme.
func (h *ThemeHandler) GetOrgTheme(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	cfg, err := h.repo.Get(r.Context(), orgID)
	if err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to fetch theme config"})
		return
	}
	JSON(w, http.StatusOK, cfg)
}

// UpdateOrgTheme upserts the org's theme configuration.
// Only admins/owners may call this — enforced via RequireOrgAdmin middleware in router.
func (h *ThemeHandler) UpdateOrgTheme(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := tenant.UserID(r.Context())

	var body struct {
		BaseTheme    string          `json:"base_theme"`
		CustomColors json.RawMessage `json:"custom_colors"`
		Locked       bool            `json:"locked"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}

	colors := body.CustomColors
	if len(colors) == 0 {
		colors = json.RawMessage(`{}`)
	}

	cfg := &domain.OrgThemeConfig{
		OrgID:        orgID,
		BaseTheme:    body.BaseTheme,
		CustomColors: colors,
		Locked:       body.Locked,
		UpdatedBy:    &userID,
	}

	result, err := h.repo.Upsert(r.Context(), cfg)
	if err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to save theme config"})
		return
	}
	JSON(w, http.StatusOK, result)
}
