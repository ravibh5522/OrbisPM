package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// NotificationHandler handles notification HTTP endpoints.
type NotificationHandler struct {
	notifSvc *service.NotificationService
}

func NewNotificationHandler(notifSvc *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{notifSvc: notifSvc}
}

// Routes registers notification routes. Mounted under /notifications.
func (h *NotificationHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Patch("/{notificationId}/read", h.MarkRead)
	r.Post("/mark-all-read", h.MarkAllRead)

	return r
}

func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	notifications, total, err := h.notifSvc.List(r.Context(), userID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	if notifications == nil {
		notifications = []*domain.Notification{}
	}
	JSON(w, http.StatusOK, ListResponse{
		Data:   notifications,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "notificationId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid notification id"})
		return
	}
	if err := h.notifSvc.MarkRead(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	if err := h.notifSvc.MarkAllRead(r.Context(), userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
