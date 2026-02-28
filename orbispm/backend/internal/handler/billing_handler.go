package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

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

func (h *BillingHandler) ListPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.billingSvc.ListPlans(r.Context())
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, plans)
}

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

func (h *CustomRoleHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	roles, err := h.roleSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, roles)
}

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
