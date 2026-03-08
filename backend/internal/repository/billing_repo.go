package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type billingPlanRepo struct {
	pool *pgxpool.Pool
}

func NewBillingPlanRepo(pool *pgxpool.Pool) BillingPlanRepository {
	return &billingPlanRepo{pool: pool}
}

func (r *billingPlanRepo) GetByID(ctx context.Context, id string) (*domain.BillingPlan, error) {
	var p domain.BillingPlan
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, stripe_price_id, limits, created_at FROM billing_plans WHERE id = $1`, id).
		Scan(&p.ID, &p.Name, &p.StripePriceID, &p.Limits, &p.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get billing plan: %w", err)
	}
	return &p, nil
}

func (r *billingPlanRepo) GetByPriceID(ctx context.Context, priceID string) (*domain.BillingPlan, error) {
	var p domain.BillingPlan
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, stripe_price_id, limits, created_at FROM billing_plans WHERE stripe_price_id = $1`, priceID).
		Scan(&p.ID, &p.Name, &p.StripePriceID, &p.Limits, &p.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get billing plan by price: %w", err)
	}
	return &p, nil
}

func (r *billingPlanRepo) List(ctx context.Context) ([]*domain.BillingPlan, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, stripe_price_id, limits, created_at FROM billing_plans ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []*domain.BillingPlan
	for rows.Next() {
		var p domain.BillingPlan
		if err := rows.Scan(&p.ID, &p.Name, &p.StripePriceID, &p.Limits, &p.CreatedAt); err != nil {
			return nil, err
		}
		plans = append(plans, &p)
	}
	return plans, rows.Err()
}

type orgSubscriptionRepo struct {
	pool *pgxpool.Pool
}

func NewOrgSubscriptionRepo(pool *pgxpool.Pool) OrgSubscriptionRepository {
	return &orgSubscriptionRepo{pool: pool}
}

func (r *orgSubscriptionRepo) GetByOrgID(ctx context.Context, orgID uuid.UUID) (*domain.OrgSubscription, error) {
	var s domain.OrgSubscription
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, plan_id, stripe_sub_id, status,
		        current_period_start, current_period_end, created_at, updated_at
		 FROM org_subscriptions WHERE org_id = $1`, orgID).
		Scan(&s.ID, &s.OrgID, &s.PlanID, &s.StripeSubID, &s.Status,
			&s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get subscription: %w", err)
	}
	return &s, nil
}

func (r *orgSubscriptionRepo) GetByStripeSubID(ctx context.Context, stripeSubID string) (*domain.OrgSubscription, error) {
	var s domain.OrgSubscription
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, plan_id, stripe_sub_id, status,
		        current_period_start, current_period_end, created_at, updated_at
		 FROM org_subscriptions WHERE stripe_sub_id = $1`, stripeSubID).
		Scan(&s.ID, &s.OrgID, &s.PlanID, &s.StripeSubID, &s.Status,
			&s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get subscription by stripe id: %w", err)
	}
	return &s, nil
}

func (r *orgSubscriptionRepo) Upsert(ctx context.Context, sub *domain.OrgSubscription) (*domain.OrgSubscription, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO org_subscriptions (org_id, plan_id, stripe_sub_id, status, current_period_start, current_period_end)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (org_id) DO UPDATE SET
			plan_id = EXCLUDED.plan_id,
			stripe_sub_id = EXCLUDED.stripe_sub_id,
			status = EXCLUDED.status,
			current_period_start = EXCLUDED.current_period_start,
			current_period_end = EXCLUDED.current_period_end
		 RETURNING id, org_id, plan_id, stripe_sub_id, status,
		           current_period_start, current_period_end, created_at, updated_at`,
		sub.OrgID, sub.PlanID, sub.StripeSubID, sub.Status,
		sub.CurrentPeriodStart, sub.CurrentPeriodEnd)

	var s domain.OrgSubscription
	err := row.Scan(&s.ID, &s.OrgID, &s.PlanID, &s.StripeSubID, &s.Status,
		&s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert subscription: %w", err)
	}
	return &s, nil
}
