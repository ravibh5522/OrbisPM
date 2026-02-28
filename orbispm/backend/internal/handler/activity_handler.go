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

// List godoc
// @Summary List activity logs
// @Description List activity logs for an entity within an organization
// @Tags Activity
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param entity_type query string true "Entity type (task, project, etc.)"
// @Param entity_id query string true "Entity ID" format(uuid)
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/activity [get]
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
