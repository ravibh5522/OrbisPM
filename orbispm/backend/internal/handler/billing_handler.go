package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
	"github.com/stripe/stripe-go/v82"
	billingportal "github.com/stripe/stripe-go/v82/billingportal/session"
	"github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/webhook"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// BillingHandler handles billing/subscription HTTP endpoints.
type BillingHandler struct {
	billingSvc      *service.BillingService
	stripeKey       string
	webhookSecret   string
	frontendURL     string
	stripeEnabled   bool
}

// NewBillingHandler creates a new BillingHandler.
func NewBillingHandler(billingSvc *service.BillingService, stripeKey, webhookSecret, frontendURL string, enabled bool) *BillingHandler {
	if enabled && stripeKey != "" {
		stripe.Key = stripeKey
	}
	return &BillingHandler{
		billingSvc:    billingSvc,
		stripeKey:     stripeKey,
		webhookSecret: webhookSecret,
		frontendURL:   frontendURL,
		stripeEnabled: enabled,
	}
}

// Routes registers billing routes.
func (h *BillingHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/plans", h.ListPlans)
	r.Get("/subscription", h.GetSubscription)
	r.Post("/checkout", h.CreateCheckoutSession)
	r.Post("/portal", h.CreatePortalSession)
	return r
}

// WebhookRoutes returns routes for Stripe webhooks (no auth required).
func (h *BillingHandler) WebhookRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.HandleWebhook)
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

// CreateCheckoutSession godoc
// @Summary Create Stripe checkout session
// @Description Create a Stripe checkout session for subscribing to a plan
// @Tags Billing
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body checkoutRequest true "Checkout options"
// @Success 200 {object} checkoutResponse
// @Router /orgs/{orgId}/billing/checkout [post]
func (h *BillingHandler) CreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	if !h.stripeEnabled {
		JSON(w, http.StatusServiceUnavailable, ErrorResponse{Message: "Billing is not configured"})
		return
	}

	orgID := middleware.OrgIDFromCtx(r.Context())
	orgSlug := chi.URLParam(r, "orgId") // Actually orgSlug in routes

	var req struct {
		PriceID   string `json:"price_id" validate:"required"`
		SuccessURL string `json:"success_url,omitempty"`
		CancelURL  string `json:"cancel_url,omitempty"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	successURL := req.SuccessURL
	if successURL == "" {
		successURL = h.frontendURL + "/" + orgSlug + "/settings/billing?success=true"
	}
	cancelURL := req.CancelURL
	if cancelURL == "" {
		cancelURL = h.frontendURL + "/" + orgSlug + "/settings/billing?canceled=true"
	}

	params := &stripe.CheckoutSessionParams{
		Mode: stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(req.PriceID),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
		Metadata: map[string]string{
			"org_id": orgID.String(),
		},
	}

	sess, err := session.New(params)
	if err != nil {
		log.Error().Err(err).Msg("failed to create checkout session")
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to create checkout session"})
		return
	}

	JSON(w, http.StatusOK, map[string]string{
		"checkout_url": sess.URL,
		"session_id":   sess.ID,
	})
}

type checkoutRequest struct {
	PriceID    string `json:"price_id" validate:"required"`
	SuccessURL string `json:"success_url,omitempty"`
	CancelURL  string `json:"cancel_url,omitempty"`
}

type checkoutResponse struct {
	CheckoutURL string `json:"checkout_url"`
	SessionID   string `json:"session_id"`
}

// CreatePortalSession godoc
// @Summary Create Stripe customer portal session
// @Description Create a Stripe customer portal session for managing subscription
// @Tags Billing
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} portalResponse
// @Router /orgs/{orgId}/billing/portal [post]
func (h *BillingHandler) CreatePortalSession(w http.ResponseWriter, r *http.Request) {
	if !h.stripeEnabled {
		JSON(w, http.StatusServiceUnavailable, ErrorResponse{Message: "Billing is not configured"})
		return
	}

	orgID := middleware.OrgIDFromCtx(r.Context())
	orgSlug := chi.URLParam(r, "orgId")

	// Get customer ID from subscription
	sub, err := h.billingSvc.GetSubscription(r.Context(), orgID)
	if err != nil || sub == nil || sub.StripeSubID == nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "No active subscription found"})
		return
	}

	// Fetch subscription from Stripe to get customer ID
	stripeSub, err := h.billingSvc.GetStripeSubscription(r.Context(), *sub.StripeSubID)
	if err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to get subscription details"})
		return
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(stripeSub.CustomerID),
		ReturnURL: stripe.String(h.frontendURL + "/" + orgSlug + "/settings/billing"),
	}

	sess, err := billingportal.New(params)
	if err != nil {
		log.Error().Err(err).Msg("failed to create portal session")
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to create portal session"})
		return
	}

	JSON(w, http.StatusOK, map[string]string{
		"portal_url": sess.URL,
	})
}

type portalResponse struct {
	PortalURL string `json:"portal_url"`
}

// HandleWebhook godoc
// @Summary Handle Stripe webhook
// @Description Process Stripe webhook events
// @Tags Billing
// @Accept json
// @Success 200
// @Router /webhooks/stripe [post]
func (h *BillingHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if !h.stripeEnabled {
		w.WriteHeader(http.StatusOK)
		return
	}

	const MaxBodyBytes = 65536
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		log.Error().Err(err).Msg("error reading webhook body")
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	sig := r.Header.Get("Stripe-Signature")
	event, err := webhook.ConstructEvent(payload, sig, h.webhookSecret)
	if err != nil {
		log.Error().Err(err).Msg("webhook signature verification failed")
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	log.Info().Str("type", string(event.Type)).Msg("received stripe webhook")

	switch event.Type {
	case "checkout.session.completed":
		var sess stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &sess); err != nil {
			log.Error().Err(err).Msg("error parsing checkout session")
			break
		}
		if err := h.billingSvc.HandleCheckoutCompleted(r.Context(), &sess); err != nil {
			log.Error().Err(err).Msg("error handling checkout completed")
		}

	case "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			log.Error().Err(err).Msg("error parsing subscription")
			break
		}
		if err := h.billingSvc.HandleSubscriptionUpdated(r.Context(), &sub); err != nil {
			log.Error().Err(err).Msg("error handling subscription updated")
		}

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			log.Error().Err(err).Msg("error parsing subscription")
			break
		}
		if err := h.billingSvc.HandleSubscriptionDeleted(r.Context(), &sub); err != nil {
			log.Error().Err(err).Msg("error handling subscription deleted")
		}

	case "invoice.payment_failed":
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			log.Error().Err(err).Msg("error parsing invoice")
			break
		}
		if err := h.billingSvc.HandlePaymentFailed(r.Context(), &inv); err != nil {
			log.Error().Err(err).Msg("error handling payment failed")
		}
	}

	w.WriteHeader(http.StatusOK)
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
