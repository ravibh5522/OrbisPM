package handler

import (
	"fmt"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/storage"
)

// UploadHandler handles general file uploads (avatars, logos, etc.).
type UploadHandler struct {
	store    *storage.Client
	publicURL string // e.g. "http://localhost:9000/orbispm"
}

// NewUploadHandler creates a new UploadHandler.
func NewUploadHandler(store *storage.Client, publicURL string) *UploadHandler {
	return &UploadHandler{store: store, publicURL: publicURL}
}

// Routes registers upload routes.
func (h *UploadHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Upload)
	return r
}

const maxUploadSize = 5 << 20 // 5 MB

// Upload handles multipart file upload and returns the public URL.
func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file too large (max 5MB)"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "missing file field", Detail: err.Error()})
		return
	}
	defer file.Close()

	// Validate content type
	ct := header.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	if !strings.HasPrefix(ct, "image/") {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "only image files are allowed"})
		return
	}

	// Build object name: uploads/{orgId}/{uuid}{ext}
	orgID := middleware.OrgIDFromCtx(r.Context())
	ext := path.Ext(header.Filename)
	objectName := fmt.Sprintf("uploads/%s/%s%s", orgID.String(), uuid.New().String(), ext)

	_, err = h.store.Upload(r.Context(), objectName, file, header.Size, ct)
	if err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "upload failed", Detail: err.Error()})
		return
	}

	// Build public URL
	publicURL := fmt.Sprintf("%s/%s", strings.TrimRight(h.publicURL, "/"), objectName)

	JSON(w, http.StatusCreated, map[string]string{
		"url":       publicURL,
		"filename":  header.Filename,
		"mime_type": ct,
		"object":    objectName,
	})
}

// PresignedURL returns a short-lived presigned GET URL for an existing object.
func (h *UploadHandler) PresignedURL(w http.ResponseWriter, r *http.Request) {
	objectName := r.URL.Query().Get("object")
	if objectName == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "object query param required"})
		return
	}
	url, err := h.store.PresignedGetURL(r.Context(), objectName, 1*time.Hour)
	if err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "presign failed", Detail: err.Error()})
		return
	}
	JSON(w, http.StatusOK, map[string]string{"url": url})
}
