package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// ActivityHandler handles activity log HTTP endpoints.
type ActivityHandler struct {
	activitySvc *service.ActivityService
}

func NewActivityHandler(activitySvc *service.ActivityService) *ActivityHandler {
	return &ActivityHandler{activitySvc: activitySvc}
}

// Routes registers activity routes. Mounted under /orgs/{orgId}/activity.
func (h *ActivityHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	return r
}

func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	entityType := queryStr(r, "entity_type")
	entityID := queryUUID(r, "entity_id")

	if entityType == nil || entityID == nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "entity_type and entity_id are required"})
		return
	}

	// Ensure org context is set
	_ = middleware.OrgIDFromCtx(r.Context())

	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	logs, err := h.activitySvc.ListByEntity(r.Context(), *entityType, *entityID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, logs)
}
