package handler

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/auth"
	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// OrgHandler handles organization HTTP endpoints.
type OrgHandler struct {
	orgSvc  *service.OrgService
	zitadel *auth.ZitadelClient
}

func NewOrgHandler(orgSvc *service.OrgService, zitadel *auth.ZitadelClient) *OrgHandler {
	return &OrgHandler{orgSvc: orgSvc, zitadel: zitadel}
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
		r.Post("/members/{userId}/reset-password", h.AdminResetPassword)
		r.Post("/members/{userId}/update-email", h.AdminUpdateEmail)
		r.Post("/members/{userId}/deactivate", h.DeactivateMember)
		r.Post("/members/{userId}/reactivate", h.ReactivateMember)
		r.Post("/members/{userId}/force-mfa", h.ForceMFA)
		r.Delete("/members/{userId}/account", h.DeleteMemberAccount)
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
	JSON(w, http.StatusOK, ListResponse{Data: orgs, Total: len(orgs), Limit: len(orgs), Offset: 0})
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
	if members == nil {
		members = []*domain.OrgMember{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: members, Total: len(members), Limit: len(members), Offset: 0})
}

// GetMyMembership godoc
// @Summary Get my membership in organization
// @Description Returns the current user's role and membership details in the org
// @Tags Organizations
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} swaggerOrgMember
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/me [get]
func (h *OrgHandler) GetMyMembership(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())
	member, err := h.orgSvc.GetMember(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, member)
}

type inviteMemberRequest struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role" validate:"required"`
}

// InviteMember godoc
// @Summary Invite member to organization
// @Description Invite a user to an organization by email or user ID
// @Tags Organizations
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body inviteMemberRequest true "Invitation details"
// @Success 201 {object} swaggerOrgMember
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse "User not found"
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

	// If email is provided, use invite-by-email; otherwise fall back to user_id
	if req.Email != "" {
		member, err := h.orgSvc.InviteByEmail(r.Context(), orgID, req.Email, req.Role)
		if err != nil {
			Error(w, r, err)
			return
		}
		JSON(w, http.StatusCreated, member)
		return
	}

	if req.UserID == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "email or user_id is required"})
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

// resolveZitadelUserID looks up the member email in our DB, then finds the Zitadel user ID.
func (h *OrgHandler) resolveZitadelUserID(ctx context.Context, orgID, userID uuid.UUID) (string, error) {
	member, err := h.orgSvc.GetMember(ctx, orgID, userID)
	if err != nil {
		return "", err
	}
	if member.Email == "" {
		return "", domain.ErrBadRequest.WithDetail("member has no email")
	}
	zitadelID, err := h.zitadel.FindUserByEmail(ctx, member.Email)
	if err != nil {
		return "", domain.ErrNotFound.WithDetail("user not found in auth provider")
	}
	return zitadelID, nil
}

type resetPasswordRequest struct {
	NewPassword string `json:"new_password" validate:"required,min=8,max=128"`
}

// AdminResetPassword resets a member's password (admin action).
func (h *OrgHandler) AdminResetPassword(w http.ResponseWriter, r *http.Request) {
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
	var req resetPasswordRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	zitadelID, err := h.resolveZitadelUserID(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if err := h.zitadel.AdminResetPassword(r.Context(), zitadelID, req.NewPassword); err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to reset password"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type updateEmailRequest struct {
	NewEmail string `json:"new_email" validate:"required,email,max=255"`
}

// AdminUpdateEmail updates a member's email address.
func (h *OrgHandler) AdminUpdateEmail(w http.ResponseWriter, r *http.Request) {
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
	var req updateEmailRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	zitadelID, err := h.resolveZitadelUserID(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if err := h.zitadel.UpdateUserEmail(r.Context(), zitadelID, req.NewEmail); err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to update email"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeactivateMember deactivates a member's account in the auth provider.
func (h *OrgHandler) DeactivateMember(w http.ResponseWriter, r *http.Request) {
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
	zitadelID, err := h.resolveZitadelUserID(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if err := h.zitadel.DeactivateUser(r.Context(), zitadelID); err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to deactivate account"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ReactivateMember reactivates a previously deactivated member account.
func (h *OrgHandler) ReactivateMember(w http.ResponseWriter, r *http.Request) {
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
	zitadelID, err := h.resolveZitadelUserID(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if err := h.zitadel.ReactivateUser(r.Context(), zitadelID); err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to reactivate account"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ForceMFA enables email OTP MFA for a member.
func (h *OrgHandler) ForceMFA(w http.ResponseWriter, r *http.Request) {
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
	zitadelID, err := h.resolveZitadelUserID(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if err := h.zitadel.AddOTPEmail(r.Context(), zitadelID); err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to enable MFA"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteMemberAccount removes a member from the org and deletes their Zitadel account.
func (h *OrgHandler) DeleteMemberAccount(w http.ResponseWriter, r *http.Request) {
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
	zitadelID, err := h.resolveZitadelUserID(r.Context(), orgID, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	// Remove from org first
	if err := h.orgSvc.RemoveMember(r.Context(), orgID, userID); err != nil {
		Error(w, r, err)
		return
	}
	// Delete Zitadel account
	if err := h.zitadel.DeleteUser(r.Context(), zitadelID); err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "removed from org but failed to delete auth account"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
