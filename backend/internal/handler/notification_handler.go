package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/repository"
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

// List godoc
// @Summary List notifications
// @Description List notifications for the authenticated user
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Router /notifications [get]
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	filter := repository.NotificationFilter{
		ListFilter: repository.ListFilter{
			Limit:  queryInt(r, "limit", 20),
			Offset: queryInt(r, "offset", 0),
		},
		Status:    queryStrDefault(r, "filter", ""),
		SortBy:    queryStrDefault(r, "sort_by", ""),
		SortOrder: queryStrDefault(r, "sort_order", "desc"),
	}

	notifications, total, err := h.notifSvc.List(r.Context(), userID, filter)
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
		Limit:  filter.Limit,
		Offset: filter.Offset,
	})
}

// MarkRead godoc
// @Summary Mark notification as read
// @Description Mark a single notification as read
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Param notificationId path string true "Notification ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /notifications/{notificationId}/read [post]
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

// MarkAllRead godoc
// @Summary Mark all notifications as read
// @Description Mark all of the user's notifications as read
// @Tags Notifications
// @Produce json
// @Security BearerAuth
// @Success 204 "No Content"
// @Router /notifications/read-all [post]
func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	if err := h.notifSvc.MarkAllRead(r.Context(), userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
