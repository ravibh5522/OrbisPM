package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// DrivePermissionChecker is the subset of PermissionResolver DriveAccess needs.
type DrivePermissionChecker interface {
	HasPermission(ctx context.Context, userID, orgID uuid.UUID, scope string, scopeID *uuid.UUID, resource, action string) (bool, error)
}

// DriveAccess is the single choke point for Drive authorization (design §4.3):
// effective role = max(space role from RBAC, share role on the item or any ancestor).
type DriveAccess struct {
	perms DrivePermissionChecker
	repo  repository.DriveRepository
}

// NewDriveAccess creates a DriveAccess.
func NewDriveAccess(perms DrivePermissionChecker, repo repository.DriveRepository) *DriveAccess {
	return &DriveAccess{perms: perms, repo: repo}
}

// driveSpaceActions maps drive permissions to space roles, strongest first.
var driveSpaceActions = []struct {
	action string
	role   domain.DriveRole
}{
	{"manage", domain.DriveRoleManager},
	{"upload", domain.DriveRoleEditor},
	{"read", domain.DriveRoleViewer},
}

// SpaceRole returns the caller's role on a whole space. Personal spaces belong
// to their owner alone: the org owner/admin bypass deliberately does not apply.
func (a *DriveAccess) SpaceRole(ctx context.Context, userID, orgID uuid.UUID, scope domain.DriveScope, scopeID uuid.UUID) (domain.DriveRole, error) {
	var rbacScope string
	var rbacID *uuid.UUID
	switch scope {
	case domain.DriveScopeUser:
		if scopeID == userID {
			return domain.DriveRoleManager, nil
		}
		return domain.DriveRoleNone, nil
	case domain.DriveScopeOrg:
		rbacScope = domain.ScopeOrg
	case domain.DriveScopeTeam:
		rbacScope, rbacID = domain.ScopeTeam, &scopeID
	case domain.DriveScopeProject:
		rbacScope, rbacID = domain.ScopeProject, &scopeID
	default:
		return domain.DriveRoleNone, nil
	}
	for _, step := range driveSpaceActions {
		ok, err := a.perms.HasPermission(ctx, userID, orgID, rbacScope, rbacID, "drive", step.action)
		if err != nil {
			return domain.DriveRoleNone, err
		}
		if ok {
			return step.role, nil
		}
	}
	return domain.DriveRoleNone, nil
}

type driveSpaceKey struct {
	scope domain.DriveScope
	id    uuid.UUID
}

// Roles computes effective roles for a batch of items with one space-role
// lookup per distinct space and one share query for the whole batch.
func (a *DriveAccess) Roles(ctx context.Context, userID, orgID uuid.UUID, items []*domain.DriveItem) (map[uuid.UUID]domain.DriveRole, error) {
	spaceRoles := map[driveSpaceKey]domain.DriveRole{}
	roles := make(map[uuid.UUID]domain.DriveRole, len(items))
	var needShares []uuid.UUID
	for _, it := range items {
		key := driveSpaceKey{it.Scope, it.ScopeID}
		role, ok := spaceRoles[key]
		if !ok {
			var err error
			if role, err = a.SpaceRole(ctx, userID, orgID, it.Scope, it.ScopeID); err != nil {
				return nil, err
			}
			spaceRoles[key] = role
		}
		roles[it.ID] = role
		if role != domain.DriveRoleManager {
			needShares = append(needShares, it.ID)
		}
	}
	if len(needShares) == 0 {
		return roles, nil
	}
	shareRoles, err := a.repo.ShareRoles(ctx, orgID, userID, needShares)
	if err != nil {
		return nil, err
	}
	for id, r := range shareRoles {
		roles[id] = domain.MaxDriveRole(roles[id], r)
	}
	return roles, nil
}

// Role returns the caller's effective role on one item.
func (a *DriveAccess) Role(ctx context.Context, userID, orgID uuid.UUID, item *domain.DriveItem) (domain.DriveRole, error) {
	roles, err := a.Roles(ctx, userID, orgID, []*domain.DriveItem{item})
	if err != nil {
		return domain.DriveRoleNone, err
	}
	return roles[item.ID], nil
}

// Require returns the caller's role, or 404 when they cannot see the item at
// all (never leak existence) and 403 when they can see it but need more.
func (a *DriveAccess) Require(ctx context.Context, userID, orgID uuid.UUID, item *domain.DriveItem, min domain.DriveRole) (domain.DriveRole, error) {
	role, err := a.Role(ctx, userID, orgID, item)
	if err != nil {
		return domain.DriveRoleNone, err
	}
	return role, checkDriveRole(role, min)
}

func checkDriveRole(role, min domain.DriveRole) error {
	if role == domain.DriveRoleNone {
		return domain.ErrNotFound
	}
	if !role.AtLeast(min) {
		return domain.ErrForbidden
	}
	return nil
}

// canTrashDrive: managers may trash/restore anything they see; the creator may
// trash/restore their own item as long as they can still see it.
func canTrashDrive(role domain.DriveRole, isCreator bool) bool {
	return role == domain.DriveRoleManager || (isCreator && role.AtLeast(domain.DriveRoleViewer))
}

// withinDriveCap: a share never grants more than the actor holds.
func withinDriveCap(actor, requested domain.DriveRole) bool {
	return requested.Rank() <= actor.Rank()
}
