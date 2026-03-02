package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/eventbus"
	"github.com/orbispm/orbispm/internal/middleware"
)

// PresenceHandler manages real-time presence indicators.
type PresenceHandler struct {
	redis     *redis.Client
	publisher *eventbus.RedisPublisher
}

// NewPresenceHandler creates a new presence handler.
func NewPresenceHandler(rdb *redis.Client, pub *eventbus.RedisPublisher) *PresenceHandler {
	return &PresenceHandler{redis: rdb, publisher: pub}
}

// PresenceUser represents a user's presence info.
type PresenceUser struct {
	UserID       string `json:"user_id"`
	DisplayName  string `json:"display_name,omitempty"`
	AvatarURL    string `json:"avatar_url,omitempty"`
	ViewingSince string `json:"viewing_since"`
}

// Routes registers presence routes.
func (h *PresenceHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/heartbeat", h.Heartbeat)
	r.Get("/", h.GetPresence)
	return r
}

// Heartbeat godoc
// @Summary Update presence heartbeat
// @Description Report that current user is viewing a resource
// @Tags presence
// @Accept json
// @Param body body heartbeatRequest true "Presence update"
// @Success 204
// @Router /orgs/{orgId}/presence/heartbeat [post]
func (h *PresenceHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	var req struct {
		ResourceType string `json:"resource_type" validate:"required,oneof=task project"`
		ResourceID   string `json:"resource_id" validate:"required,uuid"`
		DisplayName  string `json:"display_name,omitempty"`
		AvatarURL    string `json:"avatar_url,omitempty"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	resourceID, err := uuid.Parse(req.ResourceID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid resource_id"})
		return
	}

	ctx := r.Context()
	key := presenceKey(orgID, req.ResourceType, resourceID)

	// Store user presence with TTL
	presence := PresenceUser{
		UserID:       userID.String(),
		DisplayName:  req.DisplayName,
		AvatarURL:    req.AvatarURL,
		ViewingSince: time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.Marshal(presence)

	// Use hash to store multiple users per resource
	_, err = h.redis.HSet(ctx, key, userID.String(), string(data)).Result()
	if err != nil {
		log.Error().Err(err).Msg("failed to set presence")
		Error(w, r, err)
		return
	}

	// Set TTL on the key (presence expires after 60 seconds without heartbeat)
	h.redis.Expire(ctx, key, 60*time.Second)

	// Publish presence update event
	h.publishPresenceEvent(ctx, orgID, req.ResourceType, resourceID, userID, "join")

	w.WriteHeader(http.StatusNoContent)
}

type heartbeatRequest struct {
	ResourceType string `json:"resource_type" validate:"required,oneof=task project"`
	ResourceID   string `json:"resource_id" validate:"required,uuid"`
	DisplayName  string `json:"display_name,omitempty"`
	AvatarURL    string `json:"avatar_url,omitempty"`
}

// GetPresence godoc
// @Summary Get users viewing a resource
// @Description Returns list of users currently viewing a resource
// @Tags presence
// @Produce json
// @Param resource_type query string true "Resource type (task or project)"
// @Param resource_id query string true "Resource UUID"
// @Success 200 {array} PresenceUser
// @Router /orgs/{orgId}/presence [get]
func (h *PresenceHandler) GetPresence(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())

	resourceType := r.URL.Query().Get("resource_type")
	resourceIDStr := r.URL.Query().Get("resource_id")

	if resourceType == "" || resourceIDStr == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "resource_type and resource_id are required"})
		return
	}

	resourceID, err := uuid.Parse(resourceIDStr)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid resource_id"})
		return
	}

	ctx := r.Context()
	key := presenceKey(orgID, resourceType, resourceID)

	// Get all users viewing this resource
	result, err := h.redis.HGetAll(ctx, key).Result()
	if err != nil && err != redis.Nil {
		log.Error().Err(err).Msg("failed to get presence")
		Error(w, r, err)
		return
	}

	users := make([]PresenceUser, 0, len(result))
	for _, data := range result {
		var user PresenceUser
		if err := json.Unmarshal([]byte(data), &user); err == nil {
			users = append(users, user)
		}
	}

	JSON(w, http.StatusOK, users)
}

// LeavePresence removes user from a resource (called on unmount/navigate away).
func (h *PresenceHandler) LeavePresence(ctx context.Context, userID, orgID uuid.UUID, resourceType string, resourceID uuid.UUID) error {
	key := presenceKey(orgID, resourceType, resourceID)
	_, err := h.redis.HDel(ctx, key, userID.String()).Result()
	if err != nil {
		return err
	}

	h.publishPresenceEvent(ctx, orgID, resourceType, resourceID, userID, "leave")
	return nil
}

func presenceKey(orgID uuid.UUID, resourceType string, resourceID uuid.UUID) string {
	return "presence:" + orgID.String() + ":" + resourceType + ":" + resourceID.String()
}

func (h *PresenceHandler) publishPresenceEvent(ctx context.Context, orgID uuid.UUID, resourceType string, resourceID, userID uuid.UUID, action string) {
	event := domain.DomainEvent{
		Type:  "presence." + action,
		OrgID: orgID.String(),
		Payload: map[string]any{
			"resource_type": resourceType,
			"resource_id":   resourceID.String(),
			"user_id":       userID.String(),
			"action":        action,
		},
	}
	if err := h.publisher.Publish(ctx, event); err != nil {
		log.Error().Err(err).Msg("failed to publish presence event")
	}
}
