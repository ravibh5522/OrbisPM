---
applyTo: "backend/internal/billing/**,backend/internal/handler/billing_handler.go"
---

# Billing & Stripe Integration — OrbisPM

You are working on the Stripe billing integration.

## Architecture
```
internal/billing/
├── stripe.go       # Stripe client wrapper
├── plans.go        # Plan definitions with limits
└── webhook.go      # Stripe webhook event processing
```

## Plans

| Plan | ID | Price | Limits |
|------|----|-------|--------|
| Free | `free` | $0 | 1 team, 3 projects, 5 members, 1GB storage, 10 AI reviews/mo |
| Pro | `pro` | $12/user/mo | Unlimited teams/projects/members, 50GB, 500 AI reviews/mo |
| Enterprise | `enterprise` | Custom | Everything unlimited + SSO/SAML + dedicated support |

## Stripe Flow

### Checkout (Upgrade)
```
Frontend → POST /api/v1/orgs/:orgId/billing/checkout { planId: "pro" }
    → Service creates Stripe Checkout Session
    → Return checkout URL
    → Frontend redirects to Stripe
    → Stripe calls webhook on success
    → Webhook handler updates org plan
```

### Portal (Manage Subscription)
```
Frontend → GET /api/v1/orgs/:orgId/billing/portal
    → Service creates Stripe Billing Portal session
    → Return portal URL
    → Frontend redirects to Stripe portal
```

### Webhook Events
```go
func (h *BillingWebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
    event, err := webhook.ConstructEvent(body, sig, webhookSecret)
    switch event.Type {
    case "checkout.session.completed":    // Upgrade successful
    case "invoice.paid":                  // Renewal successful
    case "invoice.payment_failed":        // Payment failed → notify org admin
    case "customer.subscription.updated": // Plan change
    case "customer.subscription.deleted": // Cancellation
    }
}
```

## Rules
- Stripe webhook endpoint `/webhooks/stripe` does NOT require JWT auth — uses Stripe signature verification
- ALWAYS verify Stripe webhook signature before processing events
- Store `stripe_customer_id` on `orgs` table
- Store `stripe_subscription_id` on `org_subscriptions` table
- Plan limits enforced in `middleware/plan_limit.go` — check before creating resources
- NEVER send Stripe secret key to frontend — all Stripe operations are server-side
- Use Stripe test mode keys in development (set via env vars)
