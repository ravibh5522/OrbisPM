package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

// ChannelPermissionRepository handles channel permission lookups.
type ChannelPermissionRepository interface {
	HasPermission(ctx context.Context, tx pgx.Tx, role domain.MemberRole, resource, action string) (bool, error)
	ListByRole(ctx context.Context, tx pgx.Tx, role domain.MemberRole) ([]domain.ChannelPermission, error)
	ListAllRolePermissions(ctx context.Context, tx pgx.Tx) ([]domain.RolePermissions, error)
}

type channelPermissionRepo struct {
	pool *pgxpool.Pool
}

// NewChannelPermissionRepository creates a new ChannelPermissionRepository.
func NewChannelPermissionRepository(pool *pgxpool.Pool) ChannelPermissionRepository {
	return &channelPermissionRepo{pool: pool}
}

func (r *channelPermissionRepo) HasPermission(ctx context.Context, tx pgx.Tx, role domain.MemberRole, resource, action string) (bool, error) {
	db := conn(r.pool, tx)
	var exists bool
	err := db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM channel_role_permissions crp
			JOIN channel_permissions cp ON cp.id = crp.permission_id
			WHERE crp.role = $1 AND cp.resource = $2 AND cp.action = $3
		)`, string(role), resource, action,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check permission: %w", err)
	}
	return exists, nil
}

func (r *channelPermissionRepo) ListByRole(ctx context.Context, tx pgx.Tx, role domain.MemberRole) ([]domain.ChannelPermission, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT cp.id, cp.resource, cp.action, cp.description
		FROM channel_role_permissions crp
		JOIN channel_permissions cp ON cp.id = crp.permission_id
		WHERE crp.role = $1
		ORDER BY cp.resource, cp.action`, string(role),
	)
	if err != nil {
		return nil, fmt.Errorf("list permissions by role: %w", err)
	}
	defer rows.Close()

	var perms []domain.ChannelPermission
	for rows.Next() {
		var p domain.ChannelPermission
		if err := rows.Scan(&p.ID, &p.Resource, &p.Action, &p.Description); err != nil {
			return nil, fmt.Errorf("scan permission: %w", err)
		}
		perms = append(perms, p)
	}
	return perms, nil
}

func (r *channelPermissionRepo) ListAllRolePermissions(ctx context.Context, tx pgx.Tx) ([]domain.RolePermissions, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT crp.role, cp.id, cp.resource, cp.action, cp.description
		FROM channel_role_permissions crp
		JOIN channel_permissions cp ON cp.id = crp.permission_id
		ORDER BY crp.role, cp.resource, cp.action`,
	)
	if err != nil {
		return nil, fmt.Errorf("list all role permissions: %w", err)
	}
	defer rows.Close()

	roleMap := make(map[domain.MemberRole][]domain.ChannelPermission)
	for rows.Next() {
		var role domain.MemberRole
		var p domain.ChannelPermission
		if err := rows.Scan(&role, &p.ID, &p.Resource, &p.Action, &p.Description); err != nil {
			return nil, fmt.Errorf("scan role permission: %w", err)
		}
		roleMap[role] = append(roleMap[role], p)
	}

	// Return in hierarchy order
	order := []domain.MemberRole{
		domain.MemberRoleOwner,
		domain.MemberRoleAdmin,
		domain.MemberRoleModerator,
		domain.MemberRoleMember,
		domain.MemberRoleViewer,
	}
	var result []domain.RolePermissions
	for _, r := range order {
		if perms, ok := roleMap[r]; ok {
			result = append(result, domain.RolePermissions{Role: r, Permissions: perms})
		}
	}
	return result, nil
}
