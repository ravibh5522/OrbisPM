package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// BillingHandler handles billing/subscription HTTP endpoints.
type BillingHandler struct {
	billingSvc *service.BillingService
}

// NewBillingHandler creates a new BillingHandler.
func NewBillingHandler(billingSvc *service.BillingService) *BillingHandler {
	return &BillingHandler{billingSvc: billingSvc}
}

// Routes registers billing routes.
func (h *BillingHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/plans", h.ListPlans)
	r.Get("/subscription", h.GetSubscription)
	return r
}

// ListPlans godoc
// @Summary List billing plans
// @Description List all available billing plans
// @Tags Billing
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerBillingPlan
// @Router /orgs/{orgId}/billing/plans [get]
func (h *BillingHandler) ListPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.billingSvc.ListPlans(r.Context())
	if err != nil {
		Error(w, r, err)
		return
	}
	if plans == nil {
		plans = []*domain.BillingPlan{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: plans, Total: len(plans), Limit: len(plans), Offset: 0})
}

// GetSubscription godoc
// @Summary Get organization subscription
// @Description Get the current subscription for an organization
// @Tags Billing
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} swaggerOrgSubscription
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/billing/subscription [get]
func (h *BillingHandler) GetSubscription(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	sub, err := h.billingSvc.GetSubscription(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, sub)
}

// --- Custom Role Handler ---

// CustomRoleHandler handles custom role HTTP endpoints.
type CustomRoleHandler struct {
	roleSvc *service.CustomRoleService
}

// NewCustomRoleHandler creates a new CustomRoleHandler.
func NewCustomRoleHandler(roleSvc *service.CustomRoleService) *CustomRoleHandler {
	return &CustomRoleHandler{roleSvc: roleSvc}
}

// Routes registers custom role routes.
func (h *CustomRoleHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Route("/{roleId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
	})
	return r
}

// Create godoc
// @Summary Create custom role
// @Description Create a custom RBAC role within an organization
// @Tags CustomRoles
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerCreateCustomRoleParams true "Role data"
// @Success 201 {object} swaggerCustomRole
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/roles [post]
func (h *CustomRoleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateCustomRoleParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	role, err := h.roleSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, role)
}

// Get godoc
// @Summary Get custom role
// @Description Retrieve a custom role by ID
// @Tags CustomRoles
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param roleId path string true "Role ID" format(uuid)
// @Success 200 {object} swaggerCustomRole
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/roles/{roleId} [get]
func (h *CustomRoleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "roleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid role id"})
		return
	}
	role, err := h.roleSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, role)
}

// List godoc
// @Summary List custom roles
// @Description List all custom roles in an organization
// @Tags CustomRoles
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerCustomRole
// @Router /orgs/{orgId}/roles [get]
func (h *CustomRoleHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	roles, err := h.roleSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if roles == nil {
		roles = []*domain.CustomRole{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: roles, Total: len(roles), Limit: len(roles), Offset: 0})
}

// Update godoc
// @Summary Update custom role
// @Description Update a custom role's permissions
// @Tags CustomRoles
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param roleId path string true "Role ID" format(uuid)
// @Param body body swaggerUpdateCustomRoleParams true "Updated role data"
// @Success 200 {object} swaggerCustomRole
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/roles/{roleId} [put]
func (h *CustomRoleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "roleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid role id"})
		return
	}
	var params service.UpdateCustomRoleParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	role, err := h.roleSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, role)
}

// Delete godoc
// @Summary Delete custom role
// @Description Delete a custom role
// @Tags CustomRoles
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param roleId path string true "Role ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/roles/{roleId} [delete]
func (h *CustomRoleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "roleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid role id"})
		return
	}
	if err := h.roleSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
