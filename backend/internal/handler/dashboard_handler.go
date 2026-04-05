package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/service"
)

// DashboardHandler handles dashboard HTTP endpoints.
type DashboardHandler struct {
	dashboardSvc *service.DashboardService
	taskSvc      *service.TaskService
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(dashboardSvc *service.DashboardService, taskSvc *service.TaskService) *DashboardHandler {
	return &DashboardHandler{dashboardSvc: dashboardSvc, taskSvc: taskSvc}
}

// Routes registers dashboard routes. Mounted under /orgs/{orgId}/dashboard.
func (h *DashboardHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/stats", h.GetStats)
	r.Get("/my-tasks", h.MyTasks)
	return r
}

// GetStats godoc
// @Summary Get dashboard stats
// @Description Get aggregated dashboard statistics for an organization (filtered by user's role and permissions)
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
	stats, err := h.dashboardSvc.GetStats(r.Context(), orgID, userID)
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
// @Param status query string false "Filter by status"
// @Param priority query string false "Filter by priority"
// @Param search query string false "Search by title"
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

	filter := repository.TaskFilter{
		ListFilter: repository.ListFilter{Limit: limit, Offset: offset},
	}
	if s := r.URL.Query().Get("status"); s != "" {
		filter.Status = &s
	}
	if p := r.URL.Query().Get("priority"); p != "" {
		filter.Priority = &p
	}
	if q := r.URL.Query().Get("search"); q != "" {
		filter.Search = &q
	}
	if sb := r.URL.Query().Get("sort_by"); sb != "" {
		filter.SortBy = sb
	}
	if so := r.URL.Query().Get("sort_order"); so != "" {
		filter.SortOrder = so
	}

	tasks, total, err := h.taskSvc.ListMyTasks(r.Context(), orgID, userID, filter)
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
