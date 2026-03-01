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

type orgRepo struct {
	pool *pgxpool.Pool
}

// NewOrgRepo creates a new OrgRepository backed by PostgreSQL.
func NewOrgRepo(pool *pgxpool.Pool) OrgRepository {
	return &orgRepo{pool: pool}
}

func (r *orgRepo) Create(ctx context.Context, tx pgx.Tx, org *domain.Org) (*domain.Org, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO orgs (name, slug, logo_url, plan, billing_customer_id, settings)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, slug, logo_url, plan, billing_customer_id, settings, created_at, updated_at`,
		org.Name, org.Slug, nilStr(org.LogoURL), org.Plan, nilStr(org.BillingCustomerID), org.Settings,
	)
	result, err := scanOrg(row)
	if err != nil {
		if isPgUniqueViolation(err) {
			return nil, domain.ErrConflict.WithDetail("slug already taken")
		}
		return nil, err
	}
	return result, nil
}

func (r *orgRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Org, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, name, slug, logo_url, plan, billing_customer_id, settings, created_at, updated_at
		 FROM orgs WHERE id = $1`, id)
	org, err := scanOrg(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get org: %w", err)
	}
	return org, nil
}

func (r *orgRepo) GetBySlug(ctx context.Context, slug string) (*domain.Org, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, name, slug, logo_url, plan, billing_customer_id, settings, created_at, updated_at
		 FROM orgs WHERE slug = $1`, slug)
	org, err := scanOrg(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get org by slug: %w", err)
	}
	return org, nil
}

func (r *orgRepo) Update(ctx context.Context, tx pgx.Tx, org *domain.Org) (*domain.Org, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE orgs SET name=$1, slug=$2, logo_url=$3, plan=$4, billing_customer_id=$5, settings=$6
		 WHERE id=$7
		 RETURNING id, name, slug, logo_url, plan, billing_customer_id, settings, created_at, updated_at`,
		org.Name, org.Slug, nilStr(org.LogoURL), org.Plan, nilStr(org.BillingCustomerID), org.Settings, org.ID,
	)
	return scanOrg(row)
}

func (r *orgRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM orgs WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete org: %w", err)
	}
	return nil
}

func (r *orgRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]*domain.Org, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT o.id, o.name, o.slug, o.logo_url, o.plan, o.billing_customer_id, o.settings, o.created_at, o.updated_at
		 FROM orgs o
		 INNER JOIN org_members om ON om.org_id = o.id
		 WHERE om.user_id = $1
		 ORDER BY o.name`, userID)
	if err != nil {
		return nil, fmt.Errorf("list orgs: %w", err)
	}
	defer rows.Close()

	var orgs []*domain.Org
	for rows.Next() {
		org, err := scanOrgRow(rows)
		if err != nil {
			return nil, err
		}
		orgs = append(orgs, org)
	}
	return orgs, rows.Err()
}

func scanOrg(row pgx.Row) (*domain.Org, error) {
	var o domain.Org
	var logoURL, billingCustID *string
	err := row.Scan(&o.ID, &o.Name, &o.Slug, &logoURL, &o.Plan, &billingCustID, &o.Settings, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if logoURL != nil {
		o.LogoURL = *logoURL
	}
	if billingCustID != nil {
		o.BillingCustomerID = *billingCustID
	}
	return &o, nil
}

func scanOrgRow(rows pgx.Rows) (*domain.Org, error) {
	var o domain.Org
	var logoURL, billingCustID *string
	err := rows.Scan(&o.ID, &o.Name, &o.Slug, &logoURL, &o.Plan, &billingCustID, &o.Settings, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if logoURL != nil {
		o.LogoURL = *logoURL
	}
	if billingCustID != nil {
		o.BillingCustomerID = *billingCustID
	}
	return &o, nil
}

// nilStr returns nil for empty strings, a pointer otherwise.
func nilStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
