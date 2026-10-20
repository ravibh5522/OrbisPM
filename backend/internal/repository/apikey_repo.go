package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type apiKeyRepo struct {
	pool *pgxpool.Pool
}

func NewAPIKeyRepo(pool *pgxpool.Pool) APIKeyRepository {
	return &apiKeyRepo{pool: pool}
}

func (r *apiKeyRepo) Create(ctx context.Context, tx pgx.Tx, k *domain.APIKey) (*domain.APIKey, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix, scopes, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, org_id, user_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, created_at`,
		k.OrgID, k.UserID, k.Name, k.KeyHash, k.KeyPrefix, k.Scopes, k.ExpiresAt)

	var key domain.APIKey
	err := row.Scan(&key.ID, &key.OrgID, &key.UserID, &key.Name, &key.KeyHash,
		&key.KeyPrefix, &key.Scopes, &key.LastUsedAt, &key.ExpiresAt, &key.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create api key: %w", err)
	}
	return &key, nil
}

func (r *apiKeyRepo) GetByHash(ctx context.Context, keyHash string) (*domain.APIKey, error) {
	var key domain.APIKey
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, user_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, created_at
		 FROM api_keys WHERE key_hash = $1`, keyHash).
		Scan(&key.ID, &key.OrgID, &key.UserID, &key.Name, &key.KeyHash,
			&key.KeyPrefix, &key.Scopes, &key.LastUsedAt, &key.ExpiresAt, &key.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get api key: %w", err)
	}
	return &key, nil
}

func (r *apiKeyRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM api_keys WHERE id = $1`, id)
	return err
}

func (r *apiKeyRepo) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.APIKey, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, user_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, created_at
		 FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []*domain.APIKey
	for rows.Next() {
		var k domain.APIKey
		if err := rows.Scan(&k.ID, &k.OrgID, &k.UserID, &k.Name, &k.KeyHash,
			&k.KeyPrefix, &k.Scopes, &k.LastUsedAt, &k.ExpiresAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, &k)
	}
	return keys, rows.Err()
}

func (r *apiKeyRepo) ListByUser(ctx context.Context, orgID, userID uuid.UUID) ([]*domain.APIKey, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, user_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, created_at
		 FROM api_keys WHERE org_id = $1 AND user_id = $2 ORDER BY created_at DESC`, orgID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []*domain.APIKey
	for rows.Next() {
		var k domain.APIKey
		if err := rows.Scan(&k.ID, &k.OrgID, &k.UserID, &k.Name, &k.KeyHash,
			&k.KeyPrefix, &k.Scopes, &k.LastUsedAt, &k.ExpiresAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, &k)
	}
	return keys, rows.Err()
}

// DeleteOwned removes a key only if it belongs to the given user and org.
func (r *apiKeyRepo) DeleteOwned(ctx context.Context, tx pgx.Tx, orgID, userID, id uuid.UUID) (bool, error) {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx, `DELETE FROM api_keys WHERE id = $1 AND org_id = $2 AND user_id = $3`, id, orgID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// DeleteInOrg removes a key only if it belongs to the given org (admin revoke).
func (r *apiKeyRepo) DeleteInOrg(ctx context.Context, tx pgx.Tx, orgID, id uuid.UUID) (bool, error) {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx, `DELETE FROM api_keys WHERE id = $1 AND org_id = $2`, id, orgID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
