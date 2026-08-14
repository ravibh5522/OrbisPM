package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/service"
)

// ProjectCanvasHandler handles canvas (whiteboard) HTTP endpoints.
type ProjectCanvasHandler struct {
	svc *service.ProjectCanvasService
}

// NewProjectCanvasHandler creates a new ProjectCanvasHandler.
func NewProjectCanvasHandler(svc *service.ProjectCanvasService) *ProjectCanvasHandler {
	return &ProjectCanvasHandler{svc: svc}
}

// List godoc
// @Summary List canvases
// @Tags Canvases
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Success 200 {object} ListResponse
// @Router /orgs/{orgId}/projects/{projectId}/canvases [get]
func (h *ProjectCanvasHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project ID"})
		return
	}

	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)
	canvases, total, err := h.svc.List(r.Context(), projectID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusOK, ListResponse{Data: canvases, Total: total, Limit: limit, Offset: offset})
}

// Create godoc
// @Summary Create canvas
// @Tags Canvases
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Success 201 {object} domain.ProjectCanvas
// @Router /orgs/{orgId}/projects/{projectId}/canvases [post]
func (h *ProjectCanvasHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := tenant.UserID(r.Context())

	projectID, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project ID"})
		return
	}

	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}
	if body.Title == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "title is required"})
		return
	}

	canvas, err := h.svc.Create(r.Context(), service.CreateCanvasParams{
		OrgID:       orgID,
		ProjectID:   projectID,
		CreatedBy:   userID,
		Title:       body.Title,
		Description: body.Description,
	})
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusCreated, canvas)
}

// Get godoc
// @Summary Get canvas
// @Tags Canvases
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Param canvasId path string true "Canvas ID"
// @Success 200 {object} domain.ProjectCanvas
// @Router /orgs/{orgId}/projects/{projectId}/canvases/{canvasId} [get]
func (h *ProjectCanvasHandler) Get(w http.ResponseWriter, r *http.Request) {
	canvasID, err := uuid.Parse(chi.URLParam(r, "canvasId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid canvas ID"})
		return
	}

	canvas, err := h.svc.GetByID(r.Context(), canvasID)
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusOK, canvas)
}

// UpdateMeta godoc
// @Summary Update canvas metadata
// @Tags Canvases
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Param canvasId path string true "Canvas ID"
// @Success 200 {object} domain.ProjectCanvas
// @Router /orgs/{orgId}/projects/{projectId}/canvases/{canvasId} [patch]
func (h *ProjectCanvasHandler) UpdateMeta(w http.ResponseWriter, r *http.Request) {
	canvasID, err := uuid.Parse(chi.URLParam(r, "canvasId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid canvas ID"})
		return
	}

	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}
	if body.Title == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "title is required"})
		return
	}

	canvas, err := h.svc.UpdateMeta(r.Context(), service.UpdateMetaParams{
		ID:          canvasID,
		Title:       body.Title,
		Description: body.Description,
	})
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusOK, canvas)
}

// SaveState godoc
// @Summary Save canvas drawing state
// @Tags Canvases
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Param canvasId path string true "Canvas ID"
// @Success 200 {object} domain.ProjectCanvas
// @Router /orgs/{orgId}/projects/{projectId}/canvases/{canvasId}/state [put]
// maxCanvasStateBytes caps a single canvas save — generous for a whiteboard
// scene plus a handful of small embedded images, without leaving the save
// endpoint open to an unbounded payload (the scene JSON is otherwise fully
// opaque to the backend, so this is the one guard against a runaway client).
const maxCanvasStateBytes = 8 << 20 // 8 MiB

func (h *ProjectCanvasHandler) SaveState(w http.ResponseWriter, r *http.Request) {
	canvasID, err := uuid.Parse(chi.URLParam(r, "canvasId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid canvas ID"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxCanvasStateBytes)

	var body struct {
		State           domain.CanvasState `json:"state"`
		ExpectedVersion int                `json:"expected_version"`
	}
	if err := parseBody(r, &body); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			JSON(w, http.StatusRequestEntityTooLarge, ErrorResponse{Message: "canvas is too large to save"})
			return
		}
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}

	canvas, err := h.svc.SaveState(r.Context(), service.SaveStateParams{
		ID:              canvasID,
		State:           body.State,
		ExpectedVersion: body.ExpectedVersion,
	})
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusOK, canvas)
}

// Delete godoc
// @Summary Delete canvas
// @Tags Canvases
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Param canvasId path string true "Canvas ID"
// @Success 204
// @Router /orgs/{orgId}/projects/{projectId}/canvases/{canvasId} [delete]
func (h *ProjectCanvasHandler) Delete(w http.ResponseWriter, r *http.Request) {
	canvasID, err := uuid.Parse(chi.URLParam(r, "canvasId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid canvas ID"})
		return
	}

	if err := h.svc.Delete(r.Context(), canvasID); err != nil {
		Error(w, r, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
