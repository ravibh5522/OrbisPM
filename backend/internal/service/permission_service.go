package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// PermissionService manages roles and permissions.
type PermissionService struct {
	permRepo repository.PermissionRepository
	roleRepo repository.RoleRepository
	orgRepo  repository.OrgRepository
	txm      *repository.TxManager
	cache    CacheInvalidator
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
			return s.roleRepo.SetPermissions(ctx, tx, created.ID, params.PermissionIDs)
		}
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
		return err
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
	return updated, nil
}

// DeleteRole deletes a non-system role.
func (s *PermissionService) DeleteRole(ctx context.Context, roleID uuid.UUID) error {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return err
	}
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.roleRepo.Delete(ctx, tx, roleID)
	})
	if err != nil {
		return err
	}
	// Invalidate role permission cache for the org
	if s.cache != nil {
		_ = s.cache.InvalidateRolePermissions(ctx, role.OrgID)
	}
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

// SetRolePermissions replaces a role's permissions.
func (s *PermissionService) SetRolePermissions(ctx context.Context, roleID uuid.UUID, permIDs []uuid.UUID) error {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return err
	}
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.roleRepo.SetPermissions(ctx, tx, roleID, permIDs)
	})
	if err != nil {
		return err
	}
	// Invalidate role permission cache for the org
	if s.cache != nil {
		_ = s.cache.InvalidateRolePermissions(ctx, role.OrgID)
	}
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
		return err
	})
}
