package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// AnalyticsHandler handles analytics and performance HTTP endpoints.
type AnalyticsHandler struct {
	analyticsSvc *service.AnalyticsService
}

// NewAnalyticsHandler creates a new AnalyticsHandler.
func NewAnalyticsHandler(analyticsSvc *service.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{analyticsSvc: analyticsSvc}
}

// Routes registers analytics routes. Mounted under /orgs/{orgId}/analytics.
func (h *AnalyticsHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Enhanced dashboard analytics
	r.Get("/dashboard", h.GetDashboardAnalytics)

	// Org-level analytics
	r.Get("/org", h.GetOrgAnalytics)

	// Velocity trend
	r.Get("/velocity", h.GetOrgVelocity)

	// Alerts
	r.Get("/alerts", h.ListAlerts)
	r.Post("/alerts/{alertId}/acknowledge", h.AcknowledgeAlert)

	// Risk scores
	r.Get("/risks", h.ListRiskScores)

	// Reports
	r.Get("/reports", h.ListReports)
	r.Post("/reports", h.CreateReport)
	r.Get("/reports/{reportId}", h.GetReport)

	// Member analytics (nested under org analytics)
	r.Get("/members/{userId}", h.GetMemberAnalytics)

	return r
}

// ProjectAnalyticsRoutes returns routes for project-scoped analytics.
// Mounted under /orgs/{orgId}/projects/{projectId}/analytics.
func (h *AnalyticsHandler) ProjectAnalyticsRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.GetProjectAnalytics)
	r.Get("/velocity", h.GetProjectVelocity)
	r.Get("/cfd", h.GetProjectCFD)
	return r
}

// TeamAnalyticsRoutes returns routes for team-scoped analytics.
// Mounted under /orgs/{orgId}/teams/{teamId}/analytics.
func (h *AnalyticsHandler) TeamAnalyticsRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.GetTeamAnalytics)
	return r
}

// MemberAnalyticsRoutes returns routes for member-scoped analytics.
// Mounted under /orgs/{orgId}/members/{userId}/analytics.
func (h *AnalyticsHandler) MemberAnalyticsRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.GetMemberAnalytics)
	return r
}

// --- Handlers ---

func (h *AnalyticsHandler) GetDashboardAnalytics(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	data, err := h.analyticsSvc.GetDashboardAnalytics(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, data)
}

func (h *AnalyticsHandler) GetOrgAnalytics(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	data, err := h.analyticsSvc.GetOrgAnalytics(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, data)
}

func (h *AnalyticsHandler) GetOrgVelocity(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	days := queryInt(r, "days", 30)
	data, err := h.analyticsSvc.GetDashboardAnalytics(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	_ = days
	JSON(w, http.StatusOK, data.Velocity)
}

func (h *AnalyticsHandler) ListAlerts(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	limit := queryInt(r, "limit", 20)
	alerts, err := h.analyticsSvc.ListActiveAlerts(r.Context(), orgID, limit)
	if err != nil {
		Error(w, r, err)
		return
	}
	if alerts == nil {
		alerts = []*domain.MetricAlert{}
	}
	JSON(w, http.StatusOK, alerts)
}

func (h *AnalyticsHandler) AcknowledgeAlert(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())
	alertID, err := uuid.Parse(chi.URLParam(r, "alertId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid alert ID"})
		return
	}
	if err := h.analyticsSvc.AcknowledgeAlert(r.Context(), orgID, alertID, userID); err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": "acknowledged"})
}

func (h *AnalyticsHandler) ListRiskScores(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	limit := queryInt(r, "limit", 20)
	risks, err := h.analyticsSvc.ListRiskScores(r.Context(), orgID, limit)
	if err != nil {
		Error(w, r, err)
		return
	}
	if risks == nil {
		risks = []*domain.RiskScore{}
	}
	JSON(w, http.StatusOK, risks)
}

func (h *AnalyticsHandler) ListReports(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)
	reports, total, err := h.analyticsSvc.ListReports(r.Context(), orgID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	if reports == nil {
		reports = []*domain.PerformanceReport{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: reports, Total: total, Limit: limit, Offset: offset})
}

func (h *AnalyticsHandler) CreateReport(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	var req struct {
		ReportType string         `json:"report_type" validate:"required"`
		ScopeType  string         `json:"scope_type" validate:"required"`
		ScopeID    uuid.UUID      `json:"scope_id" validate:"required"`
		Parameters map[string]any `json:"parameters"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}

	if req.Parameters == nil {
		req.Parameters = map[string]any{}
	}

	rp := &domain.PerformanceReport{
		OrgID:       orgID,
		ReportType:  req.ReportType,
		ScopeType:   req.ScopeType,
		ScopeID:     req.ScopeID,
		Parameters:  req.Parameters,
		Status:      "pending",
		GeneratedBy: userID,
	}
	result, err := h.analyticsSvc.CreateReport(r.Context(), rp)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, result)
}

func (h *AnalyticsHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	reportID, err := uuid.Parse(chi.URLParam(r, "reportId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid report ID"})
		return
	}
	rp, err := h.analyticsSvc.GetReport(r.Context(), reportID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, rp)
}

func (h *AnalyticsHandler) GetProjectAnalytics(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project ID"})
		return
	}
	days := queryInt(r, "days", 30)
	data, err := h.analyticsSvc.GetProjectAnalytics(r.Context(), projectID, days)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, data)
}

func (h *AnalyticsHandler) GetProjectVelocity(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project ID"})
		return
	}
	days := queryInt(r, "days", 30)
	data, err := h.analyticsSvc.GetProjectAnalytics(r.Context(), projectID, days)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, data.Velocity)
}

func (h *AnalyticsHandler) GetProjectCFD(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project ID"})
		return
	}
	days := queryInt(r, "days", 30)
	cfd, err := h.analyticsSvc.GetCFD(r.Context(), projectID, days)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, cfd)
}

func (h *AnalyticsHandler) GetTeamAnalytics(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	teamID, err := uuid.Parse(chi.URLParam(r, "teamId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team ID"})
		return
	}
	data, err := h.analyticsSvc.GetTeamAnalytics(r.Context(), orgID, teamID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, data)
}

func (h *AnalyticsHandler) GetMemberAnalytics(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user ID"})
		return
	}
	data, err := h.analyticsSvc.GetMemberAnalytics(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, data)
}
