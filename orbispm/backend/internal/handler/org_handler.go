package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// OrgHandler handles organization HTTP endpoints.
type OrgHandler struct {
	orgSvc *service.OrgService
}

func NewOrgHandler(orgSvc *service.OrgService) *OrgHandler {
	return &OrgHandler{orgSvc: orgSvc}
}

// Routes registers org routes on a chi router.
func (h *OrgHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{orgId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)

		// Members
		r.Get("/members", h.ListMembers)
		r.Post("/members/invite", h.InviteMember)
		r.Patch("/members/{userId}", h.UpdateMemberRole)
		r.Delete("/members/{userId}", h.RemoveMember)
	})

	return r
}

// Create godoc
// @Summary Create organization
// @Description Create a new organization
// @Tags Organizations
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body swaggerCreateOrgParams true "Organization data"
// @Success 201 {object} swaggerOrg
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /orgs [post]
func (h *OrgHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateOrgParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.UserID = middleware.UserIDFromCtx(r.Context())

	org, err := h.orgSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, org)
}

// Get godoc
// @Summary Get organization
// @Description Retrieve an organization by ID
// @Tags Organizations
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} swaggerOrg
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId} [get]
func (h *OrgHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	org, err := h.orgSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, org)
}

// List godoc
// @Summary List organizations
// @Description List all organizations the user belongs to
// @Tags Organizations
// @Produce json
// @Security BearerAuth
// @Success 200 {array} swaggerOrg
// @Router /orgs [get]
func (h *OrgHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgs, err := h.orgSvc.ListByUser(r.Context(), userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if orgs == nil {
		orgs = []*domain.Org{}
	}
	JSON(w, http.StatusOK, orgs)
}

// Update godoc
// @Summary Update organization
// @Description Update an existing organization
// @Tags Organizations
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerUpdateOrgParams true "Updated organization data"
// @Success 200 {object} swaggerOrg
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId} [put]
func (h *OrgHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	var params service.UpdateOrgParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	org, err := h.orgSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, org)
}

// Delete godoc
// @Summary Delete organization
// @Description Delete an organization by ID
// @Tags Organizations
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId} [delete]
func (h *OrgHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	if err := h.orgSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListMembers godoc
// @Summary List organization members
// @Description List all members of an organization with pagination
// @Tags Organizations
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Router /orgs/{orgId}/members [get]
func (h *OrgHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	members, err := h.orgSvc.ListMembers(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, members)
}

type inviteMemberRequest struct {
	UserID string `json:"user_id" validate:"required"`
	Role   string `json:"role" validate:"required"`
}

// InviteMember godoc
// @Summary Invite member to organization
// @Description Invite a user to an organization by email
// @Tags Organizations
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body inviteMemberRequest true "Invitation details"
// @Success 201 {object} swaggerOrgMember
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /orgs/{orgId}/members [post]
func (h *OrgHandler) InviteMember(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	var req inviteMemberRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.orgSvc.InviteMember(r.Context(), orgID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type updateRoleRequest struct {
	Role string `json:"role" validate:"required"`
}

// UpdateMemberRole godoc
// @Summary Update member role
// @Description Update an organization member's role
// @Tags Organizations
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
// @Param body body updateRoleRequest true "New role"
// @Success 200 {object} swaggerOrgMember
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/members/{userId} [put]
func (h *OrgHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	var req updateRoleRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if err := h.orgSvc.UpdateMemberRole(r.Context(), orgID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember godoc
// @Summary Remove organization member
// @Description Remove a member from an organization
// @Tags Organizations
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param userId path string true "User ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/members/{userId} [delete]
func (h *OrgHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.orgSvc.RemoveMember(r.Context(), orgID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
