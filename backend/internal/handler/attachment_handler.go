package handler

import (
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
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
	r.Post("/upload", h.DirectUpload)
	r.Get("/", h.ListByTask)
	r.Route("/{attachmentId}", func(r chi.Router) {
		r.Get("/download", h.Download)
		r.Get("/content", h.Content)
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

// Create godoc
// @Summary Create attachment
// @Description Upload a file attachment to a task (returns presigned upload URL)
// @Tags Attachments
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param body body createAttachmentRequest true "Attachment metadata"
// @Success 201 {object} map[string]interface{} "attachment object + upload_url"
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/attachments [post]
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

const maxAttachmentUploadSize = 30 << 20 // 30 MB

// DirectUpload handles multipart file upload — stores the file via the backend
// so the browser never needs to talk to S3 directly (avoids CORS issues).
func (h *AttachmentHandler) DirectUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentUploadSize+1024) // + header overhead
	if err := r.ParseMultipartForm(maxAttachmentUploadSize); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file too large (max 30 MB)"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "missing file field"})
		return
	}
	defer file.Close()

	if header.Size > maxAttachmentUploadSize {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file too large (max 30 MB)"})
		return
	}

	taskID, _ := uuidParam(r, "taskId")
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	att, err := h.attSvc.DirectUpload(r.Context(), service.CreateAttachmentParams{
		OrgID:    orgID,
		TaskID:   &taskID,
		UserID:   userID,
		Filename: header.Filename,
		FileSize: header.Size,
		MimeType: contentType,
	}, file)
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusCreated, att)
}

// ListByTask godoc
// @Summary List task attachments
// @Description List all attachments for a task
// @Tags Attachments
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {array} swaggerAttachment
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/attachments [get]
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
	if atts == nil {
		atts = []*domain.Attachment{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: atts, Total: len(atts), Limit: len(atts), Offset: 0})
}

// Download godoc
// @Summary Download attachment
// @Description Get a presigned download URL for an attachment
// @Tags Attachments
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param attachmentId path string true "Attachment ID" format(uuid)
// @Success 200 {object} map[string]string "download_url"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/download [get]
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

// Content streams the attachment file through the backend so the browser
// never needs to talk directly to S3/MinIO (avoids CORS and presigned-URL issues).
func (h *AttachmentHandler) Content(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "attachmentId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid attachment id"})
		return
	}

	att, reader, err := h.attSvc.StreamContent(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", att.MimeType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, att.Filename))
	if att.FileSize > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", att.FileSize))
	}

	io.Copy(w, reader) //nolint:errcheck
}

// Delete godoc
// @Summary Delete attachment
// @Description Delete an attachment from a task
// @Tags Attachments
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param attachmentId path string true "Attachment ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId} [delete]
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

// CRRoutes registers attachment routes nested under /change-requests/{crId}.
func (h *AttachmentHandler) CRRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.ListByCR)
	r.Post("/", h.CreateForCR)
	r.Route("/{attachmentId}", func(r chi.Router) {
		r.Get("/download", h.Download)
		r.Delete("/", h.Delete)
	})
	return r
}

// ListByCR returns all attachments for a change request.
func (h *AttachmentHandler) ListByCR(w http.ResponseWriter, r *http.Request) {
	crID, err := uuidParam(r, "crId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid change request id"})
		return
	}

	atts, err := h.attSvc.ListByChangeRequest(r.Context(), crID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if atts == nil {
		atts = []*domain.Attachment{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: atts, Total: len(atts), Limit: len(atts), Offset: 0})
}

// CreateForCR creates an attachment for a change request and returns a presigned upload URL.
func (h *AttachmentHandler) CreateForCR(w http.ResponseWriter, r *http.Request) {
	crID, err := uuidParam(r, "crId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid change request id"})
		return
	}

	var req createAttachmentRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	att, uploadURL, err := h.attSvc.Create(r.Context(), service.CreateAttachmentParams{
		OrgID:           orgID,
		ChangeRequestID: &crID,
		UserID:          userID,
		Filename:        req.Filename,
		FileSize:        req.FileSize,
		MimeType:        req.MimeType,
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
