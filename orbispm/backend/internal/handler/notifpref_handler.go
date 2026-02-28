package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// NotifPrefHandler handles notification preference HTTP endpoints.
type NotifPrefHandler struct {
	prefSvc *service.NotificationPrefService
}

// NewNotifPrefHandler creates a new NotifPrefHandler.
func NewNotifPrefHandler(prefSvc *service.NotificationPrefService) *NotifPrefHandler {
	return &NotifPrefHandler{prefSvc: prefSvc}
}

// Routes registers notification preference routes.
func (h *NotifPrefHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Put("/", h.Upsert)
	r.Get("/", h.List)
	return r
}

func (h *NotifPrefHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	var params service.UpsertPrefParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	params.UserID = middleware.UserIDFromCtx(r.Context())
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	if err := h.prefSvc.Upsert(r.Context(), params); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *NotifPrefHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	prefs, err := h.prefSvc.ListByUser(r.Context(), userID, orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, prefs)
}

// --- Import Handler ---

// ImportHandler handles import job HTTP endpoints.
type ImportHandler struct {
	importSvc *service.ImportService
}

// NewImportHandler creates a new ImportHandler.
func NewImportHandler(importSvc *service.ImportService) *ImportHandler {
	return &ImportHandler{importSvc: importSvc}
}

// Routes registers import routes (nested under /projects/{projectId}).
func (h *ImportHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Get("/{importId}", h.Get)
	return r
}

func (h *ImportHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}

	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	// For now, accept JSON with file path (full file upload would be via MinIO pre-signed URL)
	var req struct {
		FilePath string `json:"file_path" validate:"required"`
		FileName string `json:"file_name" validate:"required"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	job, err := h.importSvc.Create(r.Context(), service.CreateImportParams{
		OrgID:     orgID,
		ProjectID: projectID,
		UserID:    userID,
		FilePath:  req.FilePath,
		FileName:  req.FileName,
	})
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, job)
}

func (h *ImportHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "importId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid import id"})
		return
	}
	job, err := h.importSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, job)
}

func (h *ImportHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	jobs, err := h.importSvc.ListByProject(r.Context(), projectID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, jobs)
}
