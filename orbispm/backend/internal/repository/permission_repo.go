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

type permissionRepo struct {
	pool *pgxpool.Pool
}

func NewPermissionRepo(pool *pgxpool.Pool) PermissionRepository {
	return &permissionRepo{pool: pool}
}

func (r *permissionRepo) List(ctx context.Context, scope *string) ([]*domain.Permission, error) {
	var rows pgx.Rows
	var err error
	if scope != nil {
		rows, err = r.pool.Query(ctx,
			`SELECT id, resource, action, scope, COALESCE(description, '')
			 FROM permissions WHERE scope = $1
			 ORDER BY resource, action`, *scope)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT id, resource, action, scope, COALESCE(description, '')
			 FROM permissions ORDER BY scope, resource, action`)
	}
	if err != nil {
		return nil, fmt.Errorf("list permissions: %w", err)
	}
	defer rows.Close()

	var perms []*domain.Permission
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.ID, &p.Resource, &p.Action, &p.Scope, &p.Description); err != nil {
			return nil, err
		}
		perms = append(perms, &p)
	}
	return perms, rows.Err()
}

func (r *permissionRepo) ListByRole(ctx context.Context, roleID uuid.UUID) ([]*domain.Permission, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.resource, p.action, p.scope, COALESCE(p.description, '')
		 FROM permissions p
		 JOIN role_permissions rp ON rp.permission_id = p.id
		 WHERE rp.role_id = $1
		 ORDER BY p.resource, p.action`, roleID)
	if err != nil {
		return nil, fmt.Errorf("list permissions by role: %w", err)
	}
	defer rows.Close()

	var perms []*domain.Permission
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.ID, &p.Resource, &p.Action, &p.Scope, &p.Description); err != nil {
			return nil, err
		}
		perms = append(perms, &p)
	}
	return perms, rows.Err()
}

func (r *permissionRepo) GetByResourceAction(ctx context.Context, resource, action, scope string) (*domain.Permission, error) {
	var p domain.Permission
	err := r.pool.QueryRow(ctx,
		`SELECT id, resource, action, scope, COALESCE(description, '')
		 FROM permissions WHERE resource = $1 AND action = $2 AND scope = $3`,
		resource, action, scope).Scan(&p.ID, &p.Resource, &p.Action, &p.Scope, &p.Description)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get permission: %w", err)
	}
	return &p, nil
}
