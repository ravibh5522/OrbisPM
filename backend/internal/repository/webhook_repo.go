package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type webhookRepo struct {
	pool *pgxpool.Pool
}

func NewWebhookRepo(pool *pgxpool.Pool) WebhookRepository {
	return &webhookRepo{pool: pool}
}

func (r *webhookRepo) Create(ctx context.Context, tx pgx.Tx, w *domain.Webhook) (*domain.Webhook, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO webhooks (org_id, url, events, secret, is_active)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, org_id, url, events, secret, is_active, created_at`,
		w.OrgID, w.URL, w.Events, w.Secret, w.IsActive)

	var wh domain.Webhook
	err := row.Scan(&wh.ID, &wh.OrgID, &wh.URL, &wh.Events, &wh.Secret, &wh.IsActive, &wh.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create webhook: %w", err)
	}
	return &wh, nil
}

func (r *webhookRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Webhook, error) {
	var wh domain.Webhook
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, url, events, secret, is_active, created_at
		 FROM webhooks WHERE id = $1`, id).
		Scan(&wh.ID, &wh.OrgID, &wh.URL, &wh.Events, &wh.Secret, &wh.IsActive, &wh.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get webhook: %w", err)
	}
	return &wh, nil
}

func (r *webhookRepo) Update(ctx context.Context, tx pgx.Tx, w *domain.Webhook) (*domain.Webhook, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`UPDATE webhooks SET url=$2, events=$3, is_active=$4 WHERE id=$1
		 RETURNING id, org_id, url, events, secret, is_active, created_at`,
		w.ID, w.URL, w.Events, w.IsActive)

	var wh domain.Webhook
	err := row.Scan(&wh.ID, &wh.OrgID, &wh.URL, &wh.Events, &wh.Secret, &wh.IsActive, &wh.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update webhook: %w", err)
	}
	return &wh, nil
}

func (r *webhookRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM webhooks WHERE id = $1`, id)
	return err
}

func (r *webhookRepo) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Webhook, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, url, events, secret, is_active, created_at
		 FROM webhooks WHERE org_id = $1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var webhooks []*domain.Webhook
	for rows.Next() {
		var w domain.Webhook
		if err := rows.Scan(&w.ID, &w.OrgID, &w.URL, &w.Events, &w.Secret, &w.IsActive, &w.CreatedAt); err != nil {
			return nil, err
		}
		webhooks = append(webhooks, &w)
	}
	return webhooks, rows.Err()
}

func (r *webhookRepo) ListByOrgAndEvent(ctx context.Context, orgID uuid.UUID, eventType string) ([]*domain.Webhook, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, url, events, secret, is_active, created_at
		 FROM webhooks WHERE org_id = $1 AND is_active = true AND $2 = ANY(events)`,
		orgID, eventType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var webhooks []*domain.Webhook
	for rows.Next() {
		var w domain.Webhook
		if err := rows.Scan(&w.ID, &w.OrgID, &w.URL, &w.Events, &w.Secret, &w.IsActive, &w.CreatedAt); err != nil {
			return nil, err
		}
		webhooks = append(webhooks, &w)
	}
	return webhooks, rows.Err()
}
