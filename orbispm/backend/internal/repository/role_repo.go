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

type roleRepo struct {
	pool *pgxpool.Pool
}

func NewRoleRepo(pool *pgxpool.Pool) RoleRepository {
	return &roleRepo{pool: pool}
}

func (r *roleRepo) Create(ctx context.Context, tx pgx.Tx, role *domain.Role) (*domain.Role, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO roles (org_id, scope, slug, name, description, is_system)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, org_id, scope, slug, name, COALESCE(description, ''), is_system, created_at`,
		role.OrgID, role.Scope, role.Slug, role.Name, nilStr(role.Description), role.IsSystem)

	var created domain.Role
	err := row.Scan(&created.ID, &created.OrgID, &created.Scope, &created.Slug,
		&created.Name, &created.Description, &created.IsSystem, &created.CreatedAt)
	if err != nil {
		if isPgUniqueViolation(err) {
			return nil, domain.ErrConflict.WithDetail("role with this slug already exists in this scope")
		}
		return nil, fmt.Errorf("create role: %w", err)
	}
	return &created, nil
}

func (r *roleRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Role, error) {
	var role domain.Role
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, scope, slug, name, COALESCE(description, ''), is_system, created_at
		 FROM roles WHERE id = $1`, id).Scan(
		&role.ID, &role.OrgID, &role.Scope, &role.Slug,
		&role.Name, &role.Description, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get role: %w", err)
	}
	return &role, nil
}

func (r *roleRepo) GetBySlug(ctx context.Context, orgID uuid.UUID, scope, slug string) (*domain.Role, error) {
	var role domain.Role
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, scope, slug, name, COALESCE(description, ''), is_system, created_at
		 FROM roles WHERE org_id = $1 AND scope = $2 AND slug = $3`,
		orgID, scope, slug).Scan(
		&role.ID, &role.OrgID, &role.Scope, &role.Slug,
		&role.Name, &role.Description, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get role by slug: %w", err)
	}
	return &role, nil
}

func (r *roleRepo) Update(ctx context.Context, tx pgx.Tx, role *domain.Role) (*domain.Role, error) {
	q := conn(r.pool, tx)
	var updated domain.Role
	err := q.QueryRow(ctx,
		`UPDATE roles SET name=$1, description=$2 WHERE id=$3
		 RETURNING id, org_id, scope, slug, name, COALESCE(description, ''), is_system, created_at`,
		role.Name, nilStr(role.Description), role.ID).Scan(
		&updated.ID, &updated.OrgID, &updated.Scope, &updated.Slug,
		&updated.Name, &updated.Description, &updated.IsSystem, &updated.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("update role: %w", err)
	}
	return &updated, nil
}

func (r *roleRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx, `DELETE FROM roles WHERE id = $1 AND is_system = false`, id)
	if err != nil {
		return fmt.Errorf("delete role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrForbidden.WithDetail("cannot delete system role")
	}
	return nil
}

func (r *roleRepo) ListByOrg(ctx context.Context, orgID uuid.UUID, scope *string) ([]*domain.Role, error) {
	var rows pgx.Rows
	var err error
	if scope != nil {
		rows, err = r.pool.Query(ctx,
			`SELECT id, org_id, scope, slug, name, COALESCE(description, ''), is_system, created_at
			 FROM roles WHERE org_id = $1 AND scope = $2
			 ORDER BY is_system DESC, name`, orgID, *scope)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT id, org_id, scope, slug, name, COALESCE(description, ''), is_system, created_at
			 FROM roles WHERE org_id = $1
			 ORDER BY scope, is_system DESC, name`, orgID)
	}
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	var roles []*domain.Role
	for rows.Next() {
		var role domain.Role
		if err := rows.Scan(&role.ID, &role.OrgID, &role.Scope, &role.Slug,
			&role.Name, &role.Description, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, err
		}
		roles = append(roles, &role)
	}
	return roles, rows.Err()
}

func (r *roleRepo) SetPermissions(ctx context.Context, tx pgx.Tx, roleID uuid.UUID, permIDs []uuid.UUID) error {
	q := conn(r.pool, tx)

	// Remove existing permissions
	_, err := q.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID)
	if err != nil {
		return fmt.Errorf("clear role permissions: %w", err)
	}

	// Insert new permissions
	if len(permIDs) == 0 {
		return nil
	}

	for _, permID := range permIDs {
		_, err := q.Exec(ctx,
			`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			roleID, permID)
		if err != nil {
			return fmt.Errorf("set role permission: %w", err)
		}
	}
	return nil
}

func (r *roleRepo) GetPermissions(ctx context.Context, roleID uuid.UUID) ([]*domain.Permission, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.resource, p.action, p.scope, COALESCE(p.description, '')
		 FROM permissions p
		 JOIN role_permissions rp ON rp.permission_id = p.id
		 WHERE rp.role_id = $1
		 ORDER BY p.resource, p.action`, roleID)
	if err != nil {
		return nil, fmt.Errorf("get role permissions: %w", err)
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
