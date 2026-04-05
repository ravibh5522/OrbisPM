package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/repository"
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

	orgID := middleware.OrgIDFromCtx(r.Context())
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	// If entity filters are provided, list by entity; otherwise list all org activity
	if entityType != nil && entityID != nil {
		logs, err := h.activitySvc.ListByEntity(r.Context(), *entityType, *entityID, limit, offset)
		if err != nil {
			Error(w, r, err)
			return
		}
		if logs == nil {
			logs = []*domain.ActivityLog{}
		}
		JSON(w, http.StatusOK, ListResponse{Data: logs, Total: len(logs), Limit: limit, Offset: offset})
		return
	}

	filter := repository.ActivityFilter{
		ListFilter: repository.ListFilter{Limit: limit, Offset: offset},
		Search:     queryStr(r, "search"),
		Action:     queryStr(r, "action"),
		EntityType: entityType,
		SortBy:     queryStrDefault(r, "sort_by", "created_at"),
		SortOrder:  queryStrDefault(r, "sort_order", "desc"),
	}

	logs, total, err := h.activitySvc.ListByOrg(r.Context(), orgID, filter)
	if err != nil {
		Error(w, r, err)
		return
	}
	if logs == nil {
		logs = []*domain.ActivityLog{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: logs, Total: total, Limit: limit, Offset: offset})
}
