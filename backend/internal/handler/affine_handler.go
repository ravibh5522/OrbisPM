package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// AffineHandler handles the project<->AFFiNE-doc provisioning endpoint.
type AffineHandler struct {
	svc *service.AffineService
}

func NewAffineHandler(svc *service.AffineService) *AffineHandler {
	return &AffineHandler{svc: svc}
}

// GetProjectDoc godoc
// @Summary Get (provisioning on first access) this project's AFFiNE doc and a signed-in AFFiNE session for the caller
// @Tags AFFiNE
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Success 200 {object} service.ProjectDocResult
// @Router /orgs/{orgId}/projects/{projectId}/affine-doc [get]
func (h *AffineHandler) GetProjectDoc(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	projectID, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project ID"})
		return
	}

	result, err := h.svc.EnsureProjectDoc(r.Context(), orgID, projectID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusOK, result)
}
