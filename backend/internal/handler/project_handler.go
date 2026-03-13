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

// ProjectHandler handles project HTTP endpoints.
type ProjectHandler struct {
	projectSvc   *service.ProjectService
	dashboardSvc *service.DashboardService
	permResolver *service.PermissionResolver
}

func NewProjectHandler(projectSvc *service.ProjectService, dashboardSvc *service.DashboardService) *ProjectHandler {
	return &ProjectHandler{projectSvc: projectSvc, dashboardSvc: dashboardSvc}
}

// SetPermResolver injects the permission resolver for GetMyPermissions.
func (h *ProjectHandler) SetPermResolver(pr *service.PermissionResolver) {
	h.permResolver = pr
}

// Routes registers project routes. Mounted under /orgs/{orgId}/projects.
func (h *ProjectHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{projectId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)

		// Members
		r.Get("/members", h.ListMembers)
		r.Post("/members", h.AddMember)
		r.Patch("/members/{userId}", h.UpdateMemberRole)
		r.Delete("/members/{userId}", h.RemoveMember)
		r.Get("/members/{userId}/preview", h.PreviewRemoveMember)

		// Permissions
		r.Get("/my-permissions", h.GetMyPermissions)

		// Dashboard
		r.Get("/dashboard", h.Dashboard)
	})

	return r
}

// Create godoc
// @Summary Create project
// @Description Create a new project within an organization
// @Tags Projects
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerCreateProjectParams true "Project data"
// @Success 201 {object} swaggerProject
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects [post]
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateProjectParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())
	params.UserID = tenant.UserID(r.Context())

	project, err := h.projectSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, project)
}

// Get godoc
// @Summary Get project
// @Description Retrieve a project by ID
// @Tags Projects
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200 {object} swaggerProject
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId} [get]
func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	project, err := h.projectSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, project)
}

// List godoc
// @Summary List projects
// @Description List all projects in an organization
// @Tags Projects
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerProject
// @Router /orgs/{orgId}/projects [get]
func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())

	// Optional team_id filter
	var teamFilter *uuid.UUID
	if tid := queryUUID(r, "team_id"); tid != nil {
		teamFilter = tid
	}

	projects, err := h.projectSvc.ListByOrg(r.Context(), orgID, teamFilter)
	if err != nil {
		Error(w, r, err)
		return
	}
	if projects == nil {
		projects = []*domain.Project{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: projects, Total: len(projects), Limit: len(projects), Offset: 0})
}

// Update godoc
// @Summary Update project
// @Description Update an existing project
// @Tags Projects
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param body body swaggerUpdateProjectParams true "Updated project data"
// @Success 200 {object} swaggerProject
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId} [put]
func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	var params service.UpdateProjectParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	project, err := h.projectSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, project)
}

// Delete godoc
// @Summary Delete project
// @Description Delete a project by ID
// @Tags Projects
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId} [delete]
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	if err := h.projectSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListMembers godoc
// @Summary List project members
// @Description List all members of a project with pagination
// @Tags Projects
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Router /orgs/{orgId}/projects/{projectId}/members [get]
func (h *ProjectHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	members, err := h.projectSvc.ListMembers(r.Context(), projectID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if members == nil {
		members = []*domain.ProjectMember{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: members, Total: len(members), Limit: len(members), Offset: 0})
}

type addProjectMemberRequest struct {
	UserID       string  `json:"user_id" validate:"required"`
	Role         string  `json:"role" validate:"required"`
	SourceTeamID *string `json:"source_team_id,omitempty"`
}

// AddMember godoc
// @Summary Add project member
// @Description Add a user to a project
// @Tags Projects
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param body body addProjectMemberRequest true "Member details"
// @Success 201 {object} swaggerProjectMember
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/members [post]
func (h *ProjectHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	var req addProjectMemberRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	var sourceTeamID *uuid.UUID
	if req.SourceTeamID != nil && *req.SourceTeamID != "" {
		tid, err := uuid.Parse(*req.SourceTeamID)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid source_team_id"})
			return
		}
		sourceTeamID = &tid
	}
	if err := h.projectSvc.AddMember(r.Context(), projectID, userID, req.Role, sourceTeamID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember godoc
// @Summary Remove project member
// @Description Remove a member from a project, optionally reassigning their tasks
// @Tags Projects
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
// @Param body body object false "Optional reassign_to user ID"
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/members/{userId} [delete]
func (h *ProjectHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}

	// Parse optional reassign_to from body
	var body struct {
		ReassignTo *string `json:"reassign_to,omitempty"`
	}
	// Body is optional for DELETE, ignore parse errors
	_ = parseBody(r, &body)

	var reassignTo *uuid.UUID
	if body.ReassignTo != nil && *body.ReassignTo != "" {
		uid, err := uuid.Parse(*body.ReassignTo)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid reassign_to user id"})
			return
		}
		reassignTo = &uid
	}

	if err := h.projectSvc.RemoveMemberWithReassign(r.Context(), projectID, userID, reassignTo); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PreviewRemoveMember godoc
// @Summary Preview member removal impact
// @Description Returns the number of tasks assigned to the member that will be affected
// @Tags Projects
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
// @Success 200 {object} map[string]int
// @Router /orgs/{orgId}/projects/{projectId}/members/{userId}/preview [get]
func (h *ProjectHandler) PreviewRemoveMember(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	taskCount, err := h.projectSvc.PreviewRemoveMember(r.Context(), projectID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]int{"task_count": taskCount})
}

type updateProjectMemberRoleRequest struct {
	Role string `json:"role" validate:"required"`
}

// UpdateMemberRole godoc
// @Summary Update project member role
// @Description Update the role of a project member
// @Tags Projects
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
// @Param body body updateProjectMemberRoleRequest true "New role"
// @Success 204 "No Content"
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/members/{userId} [patch]
func (h *ProjectHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	var req updateProjectMemberRoleRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if err := h.projectSvc.UpdateMemberRole(r.Context(), projectID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Dashboard godoc
// @Summary Get project dashboard analytics
// @Description Returns aggregated analytics including burndown, distribution, velocity, and member workload for a project (filtered by user's role)
// @Tags Projects
// @Produce json
// @Param orgId path string true "Organization ID"
// @Param projectId path string true "Project ID"
// @Success 200 {object} service.ProjectDashboardStats
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /orgs/{orgId}/projects/{projectId}/dashboard [get]
func (h *ProjectHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	projID, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		JSON(w, http.StatusBadRequest, map[string]string{"message": "invalid project id"})
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())
	stats, err := h.dashboardSvc.GetProjectDashboard(r.Context(), projID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, stats)
}

// GetMyPermissions godoc
// @Summary Get my effective permissions for a project
// @Description Returns the caller's effective role and permissions for a specific project
// @Tags Projects
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200 {object} map[string]interface{}
// @Router /orgs/{orgId}/projects/{projectId}/my-permissions [get]
func (h *ProjectHandler) GetMyPermissions(w http.ResponseWriter, r *http.Request) {
	if h.permResolver == nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "permission resolver not configured"})
		return
	}
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	userID := tenant.UserID(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	role, perms, err := h.permResolver.GetEffectivePermissions(r.Context(), userID, orgID, domain.ScopeProject, &projectID)
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
