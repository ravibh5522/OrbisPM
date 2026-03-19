package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/service"
)

// TeamHandler handles team HTTP endpoints.
type TeamHandler struct {
	teamSvc      *service.TeamService
	dashboardSvc *service.DashboardService
	permResolver *service.PermissionResolver
}

func NewTeamHandler(teamSvc *service.TeamService, dashboardSvc *service.DashboardService) *TeamHandler {
	return &TeamHandler{teamSvc: teamSvc, dashboardSvc: dashboardSvc}
}

// SetPermResolver injects the permission resolver.
func (h *TeamHandler) SetPermResolver(pr *service.PermissionResolver) {
	h.permResolver = pr
}

// Routes registers team routes. Mounted under /orgs/{orgId}/teams.
func (h *TeamHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{teamId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)

		// Dashboard
		r.Get("/dashboard", h.Dashboard)

		// Permissions
		r.Get("/my-permissions", h.GetMyPermissions)

		// Members
		r.Get("/members", h.ListMembers)
		r.Post("/members", h.AddMember)
		r.Patch("/members/{userId}", h.UpdateMemberRole)
		r.Delete("/members/{userId}", h.RemoveMember)
	})

	return r
}

// Create godoc
// @Summary Create team
// @Description Create a new team within an organization
// @Tags Teams
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerCreateTeamParams true "Team data"
// @Success 201 {object} swaggerTeam
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/teams [post]
func (h *TeamHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateTeamParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	team, err := h.teamSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, team)
}

// Get godoc
// @Summary Get team
// @Description Retrieve a team by ID
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Success 200 {object} swaggerTeam
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId} [get]
func (h *TeamHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	team, err := h.teamSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, team)
}

// List godoc
// @Summary List teams
// @Description List all teams in an organization
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerTeam
// @Router /orgs/{orgId}/teams [get]
func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	teams, err := h.teamSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if teams == nil {
		teams = []*domain.Team{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: teams, Total: len(teams), Limit: len(teams), Offset: 0})
}

// Update godoc
// @Summary Update team
// @Description Update an existing team
// @Tags Teams
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Param body body swaggerUpdateTeamParams true "Updated team data"
// @Success 200 {object} swaggerTeam
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId} [put]
func (h *TeamHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	var params service.UpdateTeamParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	team, err := h.teamSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, team)
}

// Delete godoc
// @Summary Delete team
// @Description Delete a team by ID
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId} [delete]
func (h *TeamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	if err := h.teamSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListMembers godoc
// @Summary List team members
// @Description List all members of a team with pagination
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Router /orgs/{orgId}/teams/{teamId}/members [get]
func (h *TeamHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	members, err := h.teamSvc.ListMembers(r.Context(), teamID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if members == nil {
		members = []*domain.TeamMember{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: members, Total: len(members), Limit: len(members), Offset: 0})
}

type addTeamMemberRequest struct {
	UserID string `json:"user_id" validate:"required"`
	Role   string `json:"role" validate:"required"`
}

// AddMember godoc
// @Summary Add team member
// @Description Add a user to a team
// @Tags Teams
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Param body body addTeamMemberRequest true "Member details"
// @Success 201 {object} swaggerTeamMember
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId}/members [post]
func (h *TeamHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	var req addTeamMemberRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.teamSvc.AddMember(r.Context(), teamID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember godoc
// @Summary Remove team member
// @Description Remove a member from a team
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId}/members/{userId} [delete]
func (h *TeamHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.teamSvc.RemoveMember(r.Context(), teamID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type updateTeamMemberRoleRequest struct {
	Role string `json:"role" validate:"required"`
}

// UpdateMemberRole godoc
// @Summary Update team member role
// @Description Update the role of a team member
// @Tags Teams
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
// @Param body body updateTeamMemberRoleRequest true "New role"
// @Success 204 "No Content"
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId}/members/{userId} [patch]
func (h *TeamHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	var req updateTeamMemberRoleRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if err := h.teamSvc.UpdateMemberRole(r.Context(), teamID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Dashboard godoc
// @Summary Get team dashboard
// @Description Returns workload, velocity, and blocker analytics for a team (filtered by user's role)
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Success 200 {object} service.TeamDashboardStats
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId}/dashboard [get]
func (h *TeamHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	tidStr := chi.URLParam(r, "teamId")
	tid, err := uuid.Parse(tidStr)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())
	stats, err := h.dashboardSvc.GetTeamDashboard(r.Context(), tid, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, stats)
}

// GetMyPermissions godoc
// @Summary Get my effective permissions for a team
// @Description Returns the caller's effective role and permissions for a specific team
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Success 200 {object} map[string]interface{}
// @Router /orgs/{orgId}/teams/{teamId}/my-permissions [get]
func (h *TeamHandler) GetMyPermissions(w http.ResponseWriter, r *http.Request) {
	if h.permResolver == nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "permission resolver not configured"})
		return
	}
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	userID := tenant.UserID(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	role, perms, err := h.permResolver.GetEffectivePermissions(r.Context(), userID, orgID, domain.ScopeTeam, &teamID)
	if err != nil {
		Error(w, r, err)
		return
	}

	type permItem struct {
		Resource string `json:"resource"`
		Action   string `json:"action"`
	}
	items := make([]permItem, 0, len(perms))
	for _, p := range perms {
		items = append(items, permItem{Resource: p.Resource, Action: p.Action})
	}

	JSON(w, http.StatusOK, map[string]any{
		"role":        role,
		"permissions": items,
	})
}

type setManagerRequest struct {
	ManagerID string `json:"manager_id" validate:"required"`
}

// SetManager godoc
// @Summary Set team manager
// @Description Assign a manager to the team (auto-promotes to team_lead if not already)
// @Tags Teams
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param teamId path string true "Team ID" format(uuid)
// @Param body body setManagerRequest true "Manager assignment"
// @Success 200 {object} swaggerTeam
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/teams/{teamId}/manager [put]
func (h *TeamHandler) SetManager(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	var req setManagerRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	managerID, err := uuid.Parse(req.ManagerID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid manager_id"})
		return
	}
	team, err := h.teamSvc.SetManager(r.Context(), teamID, &managerID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, team)
}
