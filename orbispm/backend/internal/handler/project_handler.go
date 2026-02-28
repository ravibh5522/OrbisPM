package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// ProjectHandler handles project HTTP endpoints.
type ProjectHandler struct {
	projectSvc *service.ProjectService
}

func NewProjectHandler(projectSvc *service.ProjectService) *ProjectHandler {
	return &ProjectHandler{projectSvc: projectSvc}
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
		r.Delete("/members/{userId}", h.RemoveMember)
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
	projects, err := h.projectSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if projects == nil {
		projects = []*domain.Project{}
	}
	JSON(w, http.StatusOK, projects)
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
	JSON(w, http.StatusOK, members)
}

type addProjectMemberRequest struct {
	UserID string `json:"user_id" validate:"required"`
	Role   string `json:"role" validate:"required"`
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
	if err := h.projectSvc.AddMember(r.Context(), projectID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember godoc
// @Summary Remove project member
// @Description Remove a member from a project
// @Tags Projects
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
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
	if err := h.projectSvc.RemoveMember(r.Context(), projectID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
