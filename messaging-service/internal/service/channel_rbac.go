package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/pkg/tenant"
	"github.com/orbispm/messaging-service/internal/repository"
)

// ChannelRBAC provides centralized permission checking for channel operations.
type ChannelRBAC struct {
	txMgr   *repository.TxManager
	memberR repository.ChannelMemberRepository
	permR   repository.ChannelPermissionRepository

	// In-memory permission cache: role → "resource:action" → bool
	mu    sync.RWMutex
	cache map[domain.MemberRole]map[string]bool
	ttl   time.Time
}

const rbacCacheTTL = 5 * time.Minute

// NewChannelRBAC creates a new RBAC checker.
func NewChannelRBAC(
	txMgr *repository.TxManager,
	memberR repository.ChannelMemberRepository,
	permR repository.ChannelPermissionRepository,
) *ChannelRBAC {
	return &ChannelRBAC{
		txMgr:   txMgr,
		memberR: memberR,
		permR:   permR,
		cache:   make(map[domain.MemberRole]map[string]bool),
	}
}

// permKey constructs the cache key for a resource:action pair.
func permKey(resource, action string) string {
	return resource + ":" + action
}

// loadCache fetches all role permissions from the DB and caches them.
func (c *ChannelRBAC) loadCache(ctx context.Context) error {
	c.mu.RLock()
	if time.Now().Before(c.ttl) {
		c.mu.RUnlock()
		return nil
	}
	c.mu.RUnlock()

	all, err := c.permR.ListAllRolePermissions(ctx, nil)
	if err != nil {
		return fmt.Errorf("load rbac cache: %w", err)
	}

	newCache := make(map[domain.MemberRole]map[string]bool)
	for _, rp := range all {
		m := make(map[string]bool, len(rp.Permissions))
		for _, p := range rp.Permissions {
			m[permKey(p.Resource, p.Action)] = true
		}
		newCache[rp.Role] = m
	}

	c.mu.Lock()
	c.cache = newCache
	c.ttl = time.Now().Add(rbacCacheTTL)
	c.mu.Unlock()
	return nil
}

// HasPermission checks whether the current user's role in the channel grants
// the specified resource:action permission.
func (c *ChannelRBAC) HasPermission(ctx context.Context, tx pgx.Tx, channelID uuid.UUID, resource, action string) (domain.MemberRole, bool, error) {
	userID := tenant.UserID(ctx)

	role, err := c.memberR.GetRole(ctx, tx, channelID, userID)
	if err != nil {
		return "", false, err
	}

	ok, err := c.RoleHasPermission(ctx, role, resource, action)
	if err != nil {
		return role, false, err
	}
	return role, ok, nil
}

// RoleHasPermission checks whether a given role has a specific permission.
func (c *ChannelRBAC) RoleHasPermission(ctx context.Context, role domain.MemberRole, resource, action string) (bool, error) {
	if err := c.loadCache(ctx); err != nil {
		return false, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	perms, ok := c.cache[role]
	if !ok {
		return false, nil
	}
	return perms[permKey(resource, action)], nil
}

// RequirePermission is a convenience that returns a domain error if the user lacks permission.
func (c *ChannelRBAC) RequirePermission(ctx context.Context, tx pgx.Tx, channelID uuid.UUID, resource, action string) (domain.MemberRole, error) {
	role, allowed, err := c.HasPermission(ctx, tx, channelID, resource, action)
	if err != nil {
		return role, err
	}
	if !allowed {
		return role, domain.ErrForbidden.WithDetail(fmt.Sprintf("missing permission: %s.%s", resource, action))
	}
	return role, nil
}

// CanManageRole checks whether callerRole can assign/remove targetRole.
// A role can only manage roles strictly below it in the hierarchy.
func (c *ChannelRBAC) CanManageRole(callerRole, targetRole domain.MemberRole) bool {
	return callerRole.Rank() > targetRole.Rank()
}

// InvalidateCache forces the next permission check to reload from DB.
func (c *ChannelRBAC) InvalidateCache() {
	c.mu.Lock()
	c.ttl = time.Time{} // zero time = expired
	c.mu.Unlock()
}

// ListRolePermissions returns the full role → permission matrix for the API.
func (c *ChannelRBAC) ListRolePermissions(ctx context.Context) ([]domain.RolePermissions, error) {
	return c.permR.ListAllRolePermissions(ctx, nil)
}

// GetUserPermissions returns the effective permissions for a user in a specific channel.
func (c *ChannelRBAC) GetUserPermissions(ctx context.Context, channelID uuid.UUID) (*domain.RolePermissions, error) {
	userID := tenant.UserID(ctx)
	var result *domain.RolePermissions
	err := c.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		role, err := c.memberR.GetRole(ctx, tx, channelID, userID)
		if err != nil {
			return err
		}
		perms, err := c.permR.ListByRole(ctx, tx, role)
		if err != nil {
			return err
		}
		result = &domain.RolePermissions{Role: role, Permissions: perms}
		return nil
	})
	return result, err
}
