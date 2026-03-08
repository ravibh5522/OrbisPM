package domain

import (
	"time"

	"github.com/google/uuid"
)

// BillingPlan represents a subscription plan.
type BillingPlan struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	StripePriceID *string        `json:"stripe_price_id,omitempty"`
	Limits        map[string]any `json:"limits"`
	CreatedAt     time.Time      `json:"created_at"`
}

// OrgSubscription represents an org's current subscription.
type OrgSubscription struct {
	ID                 uuid.UUID  `json:"id"`
	OrgID              uuid.UUID  `json:"org_id"`
	PlanID             string     `json:"plan_id"`
	StripeSubID        *string    `json:"stripe_sub_id,omitempty"`
	Status             string     `json:"status"`
	CurrentPeriodStart *time.Time `json:"current_period_start,omitempty"`
	CurrentPeriodEnd   *time.Time `json:"current_period_end,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}
