package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/websocket"
)

// EventsHandler handles real-time event streaming (SSE).
type EventsHandler struct {
	hub *websocket.Hub
}

// NewEventsHandler creates a new EventsHandler.
func NewEventsHandler(hub *websocket.Hub) *EventsHandler {
	return &EventsHandler{hub: hub}
}

// Routes registers SSE streaming routes.
func (h *EventsHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/stream", h.Stream)
	return r
}

// Stream handles SSE connections for real-time events.
// Stream godoc
// @Summary Server-Sent Events stream
// @Description Subscribe to real-time organization events via SSE
// @Tags Events
// @Produce text/event-stream
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {string} string "SSE stream"
// @Router /orgs/{orgId}/events [get]
func (h *EventsHandler) Stream(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	if userID == uuid.Nil || orgID == uuid.Nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "org context required for events"})
		return
	}

	h.hub.SSEHandler(userID, orgID, w, r)
}
