package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
)

// RoleMemberChecker checks if a role is in use by any members.
type RoleMemberChecker interface {
	CountMembersWithRole(ctx context.Context, orgID uuid.UUID, scope, roleSlug string) (int, error)
}

// PermissionService manages roles and permissions.
type PermissionService struct {
	permRepo      repository.PermissionRepository
	roleRepo      repository.RoleRepository
	orgRepo       repository.OrgRepository
	activityRepo  repository.ActivityRepository
	txm           *repository.TxManager
	cache         CacheInvalidator
	memberChecker RoleMemberChecker
	publisher     EventPublisher
}

func NewPermissionService(
	permRepo repository.PermissionRepository,
	roleRepo repository.RoleRepository,
	orgRepo repository.OrgRepository,
	txm *repository.TxManager,
) *PermissionService {
	return &PermissionService{
		permRepo: permRepo,
		roleRepo: roleRepo,
		orgRepo:  orgRepo,
		txm:      txm,
	}
}

// SetCache injects the cache invalidator.
func (s *PermissionService) SetCache(c CacheInvalidator) { s.cache = c }

// SetMemberChecker injects the member checker for role-in-use validation.
func (s *PermissionService) SetMemberChecker(mc RoleMemberChecker) { s.memberChecker = mc }

// SetPublisher injects the event publisher for real-time propagation of RBAC changes.
func (s *PermissionService) SetPublisher(p EventPublisher) { s.publisher = p }

// publishEvent publishes a domain event for real-time propagation.
func (s *PermissionService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
	if s.publisher == nil {
		return
	}
	event := domain.DomainEvent{
		Type:     eventType,
		OrgID:    orgID,
		ActorID:  tenant.UserID(ctx).String(),
		EntityID: entityID,
		Payload:  payload,
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		_ = err
	}
}

// SetActivityRepo injects the activity repository for audit logging.
func (s *PermissionService) SetActivityRepo(ar repository.ActivityRepository) { s.activityRepo = ar }

// logActivity writes an audit trail entry for RBAC changes.
func (s *PermissionService) logActivity(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, entityType string, entityID uuid.UUID, action string, changes map[string]any) {
	if s.activityRepo == nil {
		return
	}
	actorID := tenant.UserID(ctx)
	if actorID == uuid.Nil {
		return
	}
	_ = s.activityRepo.Create(ctx, tx, &domain.ActivityLog{
		OrgID:      orgID,
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
		Changes:    changes,
	})
}

// ListPermissions returns all canonical permissions, optionally filtered by scope.
func (s *PermissionService) ListPermissions(ctx context.Context, scope *string) ([]*domain.Permission, error) {
	return s.permRepo.List(ctx, scope)
}

// ListRoles returns all roles for an org, optionally filtered by scope.
func (s *PermissionService) ListRoles(ctx context.Context, orgID uuid.UUID, scope *string) ([]*domain.Role, error) {
	roles, err := s.roleRepo.ListByOrg(ctx, orgID, scope)
	if err != nil {
		return nil, err
	}
	// Populate permissions for each role
	for _, role := range roles {
		perms, err := s.roleRepo.GetPermissions(ctx, role.ID)
		if err != nil {
			return nil, fmt.Errorf("get permissions for role %s: %w", role.Slug, err)
		}
		role.Permissions = make([]domain.Permission, len(perms))
		for i, p := range perms {
			role.Permissions[i] = *p
		}
	}
	return roles, nil
}

// CreateRoleParams defines parameters for creating a role.
type CreateRoleParams struct {
	OrgID         uuid.UUID   `json:"-"`
	Scope         string      `json:"scope" validate:"required,oneof=org team project"`
	Slug          string      `json:"slug" validate:"required,min=2,max=50"`
	Name          string      `json:"name" validate:"required,min=2,max=100"`
	Description   string      `json:"description,omitempty"`
	PermissionIDs []uuid.UUID `json:"permission_ids"`
}

// CreateRole creates a new custom role with the given permissions.
func (s *PermissionService) CreateRole(ctx context.Context, params CreateRoleParams) (*domain.Role, error) {
	role := &domain.Role{
		OrgID:       params.OrgID,
		Scope:       params.Scope,
		Slug:        params.Slug,
		Name:        params.Name,
		Description: params.Description,
		IsSystem:    false,
	}

	var created *domain.Role
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.roleRepo.Create(ctx, tx, role)
		if err != nil {
			return err
		}
		if len(params.PermissionIDs) > 0 {
			if err := s.roleRepo.SetPermissions(ctx, tx, created.ID, params.PermissionIDs); err != nil {
				return err
			}
		}
		s.logActivity(ctx, tx, params.OrgID, "role", created.ID, "role.created", map[string]any{
			"slug": params.Slug, "scope": params.Scope, "name": params.Name,
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("create role: %w", err)
	}

	// Populate permissions
	perms, _ := s.roleRepo.GetPermissions(ctx, created.ID)
	created.Permissions = make([]domain.Permission, len(perms))
	for i, p := range perms {
		created.Permissions[i] = *p
	}

	// Publish event for real-time propagation
	s.publishEvent(ctx, "role.created", params.OrgID.String(), created.ID.String(), map[string]any{
		"slug": params.Slug, "scope": params.Scope, "name": params.Name,
	})

	return created, nil
}

// UpdateRoleParams defines parameters for updating a role.
type UpdateRoleParams struct {
	Name        *string `json:"name,omitempty" validate:"omitempty,min=2,max=100"`
	Description *string `json:"description,omitempty"`
}

// UpdateRole updates a role's name and description.
func (s *PermissionService) UpdateRole(ctx context.Context, roleID uuid.UUID, params UpdateRoleParams) (*domain.Role, error) {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return nil, err
	}
	if role.IsSystem {
		// System roles can be renamed but slug stays
		if params.Name != nil {
			role.Name = *params.Name
		}
		if params.Description != nil {
			role.Description = *params.Description
		}
	} else {
		if params.Name != nil {
			role.Name = *params.Name
		}
		if params.Description != nil {
			role.Description = *params.Description
		}
	}

	var updated *domain.Role
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.roleRepo.Update(ctx, tx, role)
		if err != nil {
			return err
		}
		changes := map[string]any{"slug": role.Slug, "scope": role.Scope}
		if params.Name != nil {
			changes["name"] = *params.Name
		}
		if params.Description != nil {
			changes["description"] = *params.Description
		}
		s.logActivity(ctx, tx, role.OrgID, "role", roleID, "role.updated", changes)
		return nil
	})
	if err != nil {
		return nil, err
	}

	perms, _ := s.roleRepo.GetPermissions(ctx, updated.ID)
	updated.Permissions = make([]domain.Permission, len(perms))
	for i, p := range perms {
		updated.Permissions[i] = *p
	}
	// Invalidate role permission cache for the org
	if s.cache != nil {
		_ = s.cache.InvalidateRolePermissions(ctx, role.OrgID)
	}

	// Publish event for real-time propagation
	s.publishEvent(ctx, "role.updated", role.OrgID.String(), roleID.String(), map[string]any{
		"slug": role.Slug, "scope": role.Scope,
	})

	return updated, nil
}

// DeleteRole deletes a non-system role.
// Returns an error if any members are currently assigned this role.
func (s *PermissionService) DeleteRole(ctx context.Context, roleID uuid.UUID) error {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return err
	}

	// Check if the role is in use before deleting
	if s.memberChecker != nil {
		count, checkErr := s.memberChecker.CountMembersWithRole(ctx, role.OrgID, role.Scope, role.Slug)
		if checkErr == nil && count > 0 {
			return domain.ErrConflict.WithDetail(
				fmt.Sprintf("cannot delete role: %d member(s) currently assigned this role", count),
			)
		}
	}

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.roleRepo.Delete(ctx, tx, roleID); err != nil {
			return err
		}
		s.logActivity(ctx, tx, role.OrgID, "role", roleID, "role.deleted", map[string]any{
			"slug": role.Slug, "scope": role.Scope, "name": role.Name,
		})
		return nil
	})
	if err != nil {
		return err
	}
	// Invalidate role permission cache for the org
	if s.cache != nil {
		_ = s.cache.InvalidateRolePermissions(ctx, role.OrgID)
	}

	// Publish event for real-time propagation
	s.publishEvent(ctx, "role.deleted", role.OrgID.String(), roleID.String(), map[string]any{
		"slug": role.Slug, "scope": role.Scope, "name": role.Name,
	})

	return nil
}

// GetRole returns a role with its permissions.
func (s *PermissionService) GetRole(ctx context.Context, roleID uuid.UUID) (*domain.Role, error) {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return nil, err
	}
	perms, err := s.roleRepo.GetPermissions(ctx, role.ID)
	if err != nil {
		return nil, err
	}
	role.Permissions = make([]domain.Permission, len(perms))
	for i, p := range perms {
		role.Permissions[i] = *p
	}
	return role, nil
}

// ownerOnlyPermissions are permissions that only org owners should have.
// Admins cannot assign these to any role (prevents privilege escalation).
var ownerOnlyPermissions = map[string]map[string]bool{
	"org": {"delete": true, "transfer_ownership": true},
}

// isOwnerOnlyPermission checks if a permission is restricted to owners.
func (s *PermissionService) isOwnerOnlyPermission(ctx context.Context, permID uuid.UUID) (bool, error) {
	perms, err := s.permRepo.List(ctx, nil)
	if err != nil {
		return false, err
	}
	for _, p := range perms {
		if p.ID == permID {
			if actions, ok := ownerOnlyPermissions[p.Resource]; ok {
				return actions[p.Action], nil
			}
			return false, nil
		}
	}
	return false, nil
}

// SetRolePermissions replaces a role's permissions.
// Owner-only permissions (org.delete, org.transfer_ownership) are filtered out
// to prevent privilege escalation by admins.
func (s *PermissionService) SetRolePermissions(ctx context.Context, roleID uuid.UUID, permIDs []uuid.UUID) error {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return err
	}

	// Filter out owner-only permissions to prevent escalation
	filtered := make([]uuid.UUID, 0, len(permIDs))
	for _, pid := range permIDs {
		restricted, err := s.isOwnerOnlyPermission(ctx, pid)
		if err != nil {
			return fmt.Errorf("check permission: %w", err)
		}
		if !restricted {
			filtered = append(filtered, pid)
		}
	}

	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		if err := s.roleRepo.SetPermissions(ctx, tx, roleID, filtered); err != nil {
			return err
		}
		s.logActivity(ctx, tx, role.OrgID, "role", roleID, "role.permissions_changed", map[string]any{
			"slug": role.Slug, "scope": role.Scope, "permission_count": len(filtered),
		})
		return nil
	})
	if err != nil {
		return err
	}
	// Invalidate role permission cache for the org
	if s.cache != nil {
		_ = s.cache.InvalidateRolePermissions(ctx, role.OrgID)
	}

	// Publish event for real-time propagation
	s.publishEvent(ctx, "role.permissions_changed", role.OrgID.String(), roleID.String(), map[string]any{
		"slug": role.Slug, "scope": role.Scope, "permission_count": len(filtered),
	})

	return nil
}

// GetTeamProjectRoleMap returns the team→project role mapping for an org.
func (s *PermissionService) GetTeamProjectRoleMap(ctx context.Context, orgID uuid.UUID) (map[string]string, error) {
	org, err := s.orgRepo.GetByID(ctx, orgID)
	if err != nil {
		return nil, err
	}
	if m, ok := org.Settings["team_project_role_map"].(map[string]any); ok {
		result := make(map[string]string, len(m))
		for k, v := range m {
			if s, ok := v.(string); ok {
				result[k] = s
			}
		}
		return result, nil
	}
	return domain.DefaultTeamProjectRoleMap, nil
}

// SetTeamProjectRoleMap updates the team→project role mapping for an org.
func (s *PermissionService) SetTeamProjectRoleMap(ctx context.Context, orgID uuid.UUID, roleMap map[string]string) error {
	org, err := s.orgRepo.GetByID(ctx, orgID)
	if err != nil {
		return err
	}
	if org.Settings == nil {
		org.Settings = make(map[string]any)
	}
	org.Settings["team_project_role_map"] = roleMap
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := s.orgRepo.Update(ctx, tx, org)
		if err != nil {
			return err
		}
		changes := make(map[string]any, len(roleMap))
		for k, v := range roleMap {
			changes[k] = v
		}
		s.logActivity(ctx, tx, orgID, "org", orgID, "role_map.updated", changes)

		// Publish event for real-time propagation
		s.publishEvent(ctx, "role_map.updated", orgID.String(), orgID.String(), changes)

		return nil
	})
}
