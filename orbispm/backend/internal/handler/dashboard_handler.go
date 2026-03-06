package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// DashboardHandler handles dashboard HTTP endpoints.
type DashboardHandler struct {
	dashboardSvc *service.DashboardService
	taskSvc      *service.TaskService
	permResolver *service.PermissionResolver
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(dashboardSvc *service.DashboardService, taskSvc *service.TaskService, permResolver *service.PermissionResolver) *DashboardHandler {
	return &DashboardHandler{dashboardSvc: dashboardSvc, taskSvc: taskSvc, permResolver: permResolver}
}

// Routes registers dashboard routes. Mounted under /orgs/{orgId}/dashboard.
func (h *DashboardHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/stats", h.GetStats)
	r.Get("/personal", h.GetPersonalStats)
	r.Get("/my-tasks", h.MyTasks)
	return r
}

// GetStats godoc
// @Summary Get dashboard stats
// @Description Get aggregated dashboard statistics for an organization (requires dashboard.view_org permission)
// @Tags Dashboard
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} service.DashboardStats
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /orgs/{orgId}/dashboard/stats [get]
func (h *DashboardHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	// Check dashboard.view_org permission
	canViewOrg, _ := h.permResolver.HasPermission(r.Context(), userID, orgID, "org", nil, "dashboard", "view_org")
	if !canViewOrg {
		JSON(w, http.StatusForbidden, ErrorResponse{Message: "insufficient permissions to view org dashboard"})
		return
	}

	stats, err := h.dashboardSvc.GetStats(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, stats)
}

// MyTasks godoc
// @Summary Get tasks assigned to the current user
// @Description Returns all tasks across projects in the org assigned to the authenticated user
// @Tags Dashboard
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param limit query int false "Limit" default(50)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} domain.ListResponse
// @Failure 500 {object} ErrorResponse
// @Router /orgs/{orgId}/dashboard/my-tasks [get]
func (h *DashboardHandler) MyTasks(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	tasks, total, err := h.taskSvc.ListMyTasks(r.Context(), orgID, userID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	if tasks == nil {
		tasks = []*domain.Task{}
	}
	JSON(w, http.StatusOK, ListResponse{
		Data:   tasks,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

// GetPersonalStats godoc
// @Summary Get personal dashboard stats
// @Description Get aggregated dashboard statistics for the current user's tasks and projects
// @Tags Dashboard
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} service.PersonalDashboardStats
// @Failure 500 {object} ErrorResponse
// @Router /orgs/{orgId}/dashboard/personal [get]
func (h *DashboardHandler) GetPersonalStats(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	stats, err := h.dashboardSvc.GetPersonalDashboard(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, stats)
}
