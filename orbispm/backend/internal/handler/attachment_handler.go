package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// AttachmentHandler handles attachment HTTP endpoints.
type AttachmentHandler struct {
	attSvc *service.AttachmentService
}

// NewAttachmentHandler creates a new AttachmentHandler.
func NewAttachmentHandler(attSvc *service.AttachmentService) *AttachmentHandler {
	return &AttachmentHandler{attSvc: attSvc}
}

// Routes registers attachment routes (nested under /tasks/{taskId}).
func (h *AttachmentHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Create)
	r.Get("/", h.ListByTask)
	r.Route("/{attachmentId}", func(r chi.Router) {
		r.Get("/download", h.Download)
		r.Delete("/", h.Delete)
	})
	return r
}

type createAttachmentRequest struct {
	Filename string     `json:"filename" validate:"required"`
	FileSize int64      `json:"file_size" validate:"required,gt=0"`
	MimeType string     `json:"mime_type" validate:"required"`
	TaskID   *uuid.UUID `json:"task_id,omitempty"`
}

func (h *AttachmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createAttachmentRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	taskID, _ := uuidParam(r, "taskId")
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	att, uploadURL, err := h.attSvc.Create(r.Context(), service.CreateAttachmentParams{
		OrgID:    orgID,
		TaskID:   &taskID,
		UserID:   userID,
		Filename: req.Filename,
		FileSize: req.FileSize,
		MimeType: req.MimeType,
	})
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusCreated, map[string]any{
		"attachment": att,
		"upload_url": uploadURL,
	})
}

func (h *AttachmentHandler) ListByTask(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}

	atts, err := h.attSvc.ListByTask(r.Context(), taskID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, atts)
}

func (h *AttachmentHandler) Download(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "attachmentId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid attachment id"})
		return
	}

	att, downloadURL, err := h.attSvc.GetDownloadURL(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"attachment":   att,
		"download_url": downloadURL,
	})
}

func (h *AttachmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "attachmentId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid attachment id"})
		return
	}

	if err := h.attSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
