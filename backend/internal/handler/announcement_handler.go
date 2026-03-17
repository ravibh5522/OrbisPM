package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/service"
)

// AnnouncementHandler handles announcement HTTP endpoints.
type AnnouncementHandler struct {
	svc *service.AnnouncementService
}

// NewAnnouncementHandler creates a new AnnouncementHandler.
func NewAnnouncementHandler(svc *service.AnnouncementService) *AnnouncementHandler {
	return &AnnouncementHandler{svc: svc}
}

// Routes returns a chi.Router with all announcement routes.
// Mounted under /orgs/{orgId}/announcements.
// Permission guards are applied in main.go via PermissionResolverMiddleware.
func (h *AnnouncementHandler) Routes() chi.Router {
	r := chi.NewRouter()
	// /unread-count must be registered before /{announcementId} to avoid route ambiguity.
	r.Get("/unread-count", h.UnreadCount)
	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Route("/{announcementId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
		r.Post("/read", h.MarkRead)
	})
	return r
}

// Create godoc
// @Summary Create announcement
// @Description Create a new org-wide or project-scoped announcement
// @Tags Announcements
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 201 {object} domain.Announcement
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/announcements [post]
func (h *AnnouncementHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := tenant.UserID(r.Context())

	var body struct {
		ProjectID   *string `json:"project_id"`
		Title       string  `json:"title"`
		Body        string  `json:"body"`
		Priority    string  `json:"priority"`
		Pinned      bool    `json:"pinned"`
		PublishedAt *string `json:"published_at"`
		ExpiresAt   *string `json:"expires_at"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}

	params := service.CreateAnnouncementParams{
		OrgID:       orgID,
		AuthorID:    userID,
		Title:       body.Title,
		Body:        body.Body,
		Priority:    body.Priority,
		Pinned:      body.Pinned,
		PublishedAt: body.PublishedAt,
		ExpiresAt:   body.ExpiresAt,
	}
	if body.ProjectID != nil {
		pid, err := uuid.Parse(*body.ProjectID)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project_id"})
			return
		}
		params.ProjectID = &pid
	}

	announcement, err := h.svc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, announcement)
}

// List godoc
// @Summary List announcements
// @Description List announcements for an org with optional project filter and pagination
// @Tags Announcements
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param project_id query string false "Filter by project ID" format(uuid)
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Router /orgs/{orgId}/announcements [get]
func (h *AnnouncementHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := tenant.UserID(r.Context())
	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)
	projectID := queryUUID(r, "project_id")

	announcements, total, err := h.svc.List(r.Context(), orgID, projectID, userID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	if announcements == nil {
		announcements = []*domain.Announcement{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: announcements, Total: total, Limit: limit, Offset: offset})
}

// Get godoc
// @Summary Get announcement
// @Description Retrieve a single announcement by ID
// @Tags Announcements
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param announcementId path string true "Announcement ID" format(uuid)
// @Success 200 {object} domain.Announcement
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/announcements/{announcementId} [get]
func (h *AnnouncementHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "announcementId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid announcement id"})
		return
	}
	announcement, err := h.svc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, announcement)
}

// Update godoc
// @Summary Update announcement
// @Description Partially update an announcement
// @Tags Announcements
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param announcementId path string true "Announcement ID" format(uuid)
// @Success 200 {object} domain.Announcement
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/announcements/{announcementId} [patch]
func (h *AnnouncementHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "announcementId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid announcement id"})
		return
	}
	userID := tenant.UserID(r.Context())

	var body struct {
		Title       *string `json:"title"`
		Body        *string `json:"body"`
		Priority    *string `json:"priority"`
		Pinned      *bool   `json:"pinned"`
		PublishedAt *string `json:"published_at"`
		ExpiresAt   *string `json:"expires_at"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}

	params := service.UpdateAnnouncementParams{
		Title:       body.Title,
		Body:        body.Body,
		Priority:    body.Priority,
		Pinned:      body.Pinned,
		PublishedAt: body.PublishedAt,
		ExpiresAt:   body.ExpiresAt,
	}

	announcement, err := h.svc.Update(r.Context(), id, params, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, announcement)
}

// Delete godoc
// @Summary Delete announcement
// @Description Delete an announcement by ID
// @Tags Announcements
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param announcementId path string true "Announcement ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/announcements/{announcementId} [delete]
func (h *AnnouncementHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "announcementId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid announcement id"})
		return
	}
	userID := tenant.UserID(r.Context())

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// MarkRead godoc
// @Summary Mark announcement as read
// @Description Mark an announcement as read for the authenticated user
// @Tags Announcements
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param announcementId path string true "Announcement ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/announcements/{announcementId}/read [post]
func (h *AnnouncementHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "announcementId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid announcement id"})
		return
	}
	userID := tenant.UserID(r.Context())

	if err := h.svc.MarkRead(r.Context(), id, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UnreadCount godoc
// @Summary Get unread announcement count
// @Description Returns the number of unread announcements for the authenticated user in the org
// @Tags Announcements
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} map[string]int
// @Router /orgs/{orgId}/announcements/unread-count [get]
func (h *AnnouncementHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := tenant.UserID(r.Context())

	count, err := h.svc.CountUnread(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]int{"unread_count": count})
}
