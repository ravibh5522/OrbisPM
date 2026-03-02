package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// PermissionResolver resolves effective permissions for a user across scopes.
type PermissionResolver struct {
	orgMemberRepo     repository.OrgMemberRepository
	teamMemberRepo    repository.TeamMemberRepository
	projectMemberRepo repository.ProjectMemberRepository
	projectTeamRepo   repository.ProjectTeamRepository
	roleRepo          repository.RoleRepository
	orgRepo           repository.OrgRepository
}

func NewPermissionResolver(
	orgMemberRepo repository.OrgMemberRepository,
	teamMemberRepo repository.TeamMemberRepository,
	projectMemberRepo repository.ProjectMemberRepository,
	projectTeamRepo repository.ProjectTeamRepository,
	roleRepo repository.RoleRepository,
	orgRepo repository.OrgRepository,
) *PermissionResolver {
	return &PermissionResolver{
		orgMemberRepo:     orgMemberRepo,
		teamMemberRepo:    teamMemberRepo,
		projectMemberRepo: projectMemberRepo,
		projectTeamRepo:   projectTeamRepo,
		roleRepo:          roleRepo,
		orgRepo:           orgRepo,
	}
}

// HasPermission checks if a user has a specific permission in the given scope.
// scope: "org", "team", "project"
// scopeID: the team or project UUID (ignored for org scope)
func (r *PermissionResolver) HasPermission(ctx context.Context, userID, orgID uuid.UUID, scope string, scopeID *uuid.UUID, resource, action string) (bool, error) {
	// 1. Check org membership
	orgMember, err := r.orgMemberRepo.Get(ctx, orgID, userID)
	if err != nil {
		return false, nil // Not a member of this org
	}

	// Owner bypasses everything
	if orgMember.Role == domain.RoleOrgOwner {
		return true, nil
	}
	// Admin bypasses almost everything (except org.delete and org.transfer_ownership)
	if orgMember.Role == domain.RoleOrgAdmin {
		if resource == "org" && (action == "delete" || action == "transfer_ownership") {
			return false, nil
		}
		return true, nil
	}

	// 2. If project-scoped, check project-level first
	if scope == domain.ScopeProject && scopeID != nil {
		// Check direct project membership
		members, err := r.projectMemberRepo.ListByProject(ctx, *scopeID)
		if err == nil {
			for _, m := range members {
				if m.UserID == userID {
					has, err := r.roleHasPermission(ctx, orgID, domain.ScopeProject, m.Role, resource, action)
					if err != nil {
						return false, err
					}
					if has {
						return true, nil
					}
					break
				}
			}
		}

		// Check inherited through project_teams
		projectTeams, err := r.projectTeamRepo.ListByProject(ctx, *scopeID)
		if err == nil {
			roleMap, _ := r.getTeamProjectRoleMap(ctx, orgID)
			for _, pt := range projectTeams {
				teamMembers, err := r.teamMemberRepo.ListByTeam(ctx, pt.TeamID)
				if err != nil {
					continue
				}
				for _, tm := range teamMembers {
					if tm.UserID == userID {
						// Map team role to project role
						projectRole, ok := roleMap[tm.Role]
						if !ok {
							continue
						}
						has, err := r.roleHasPermission(ctx, orgID, domain.ScopeProject, projectRole, resource, action)
						if err != nil {
							return false, err
						}
						if has {
							return true, nil
						}
					}
				}
			}
		}
	}

	// 3. If team-scoped, check team-level
	if scope == domain.ScopeTeam && scopeID != nil {
		teamMembers, err := r.teamMemberRepo.ListByTeam(ctx, *scopeID)
		if err == nil {
			for _, tm := range teamMembers {
				if tm.UserID == userID {
					has, err := r.roleHasPermission(ctx, orgID, domain.ScopeTeam, tm.Role, resource, action)
					if err != nil {
						return false, err
					}
					if has {
						return true, nil
					}
					break
				}
			}
		}
	}

	// 4. Fall through to org-level permissions
	has, err := r.roleHasPermission(ctx, orgID, domain.ScopeOrg, orgMember.Role, resource, action)
	if err != nil {
		return false, err
	}
	return has, nil
}

// GetEffectiveRole returns the user's effective role in the given scope.
func (r *PermissionResolver) GetEffectiveRole(ctx context.Context, userID, orgID uuid.UUID, scope string, scopeID *uuid.UUID) (string, error) {
	orgMember, err := r.orgMemberRepo.Get(ctx, orgID, userID)
	if err != nil {
		return "", fmt.Errorf("not an org member")
	}

	if scope == domain.ScopeOrg {
		return orgMember.Role, nil
	}

	if scope == domain.ScopeProject && scopeID != nil {
		// Direct membership
		members, err := r.projectMemberRepo.ListByProject(ctx, *scopeID)
		if err == nil {
			for _, m := range members {
				if m.UserID == userID {
					return m.Role, nil
				}
			}
		}

		// Inherited via teams
		projectTeams, err := r.projectTeamRepo.ListByProject(ctx, *scopeID)
		if err == nil {
			roleMap, _ := r.getTeamProjectRoleMap(ctx, orgID)
			for _, pt := range projectTeams {
				teamMembers, err := r.teamMemberRepo.ListByTeam(ctx, pt.TeamID)
				if err != nil {
					continue
				}
				for _, tm := range teamMembers {
					if tm.UserID == userID {
						if mapped, ok := roleMap[tm.Role]; ok {
							return mapped, nil
						}
					}
				}
			}
		}
	}

	if scope == domain.ScopeTeam && scopeID != nil {
		teamMembers, err := r.teamMemberRepo.ListByTeam(ctx, *scopeID)
		if err == nil {
			for _, tm := range teamMembers {
				if tm.UserID == userID {
					return tm.Role, nil
				}
			}
		}
	}

	return orgMember.Role, nil
}

// roleHasPermission checks if a role (by slug) has a specific permission.
func (r *PermissionResolver) roleHasPermission(ctx context.Context, orgID uuid.UUID, scope, roleSlug, resource, action string) (bool, error) {
	role, err := r.roleRepo.GetBySlug(ctx, orgID, scope, roleSlug)
	if err != nil {
		return false, nil // Role not found in DB, deny
	}

	perms, err := r.roleRepo.GetPermissions(ctx, role.ID)
	if err != nil {
		return false, err
	}

	for _, p := range perms {
		if p.Resource == resource && p.Action == action {
			return true, nil
		}
		// Wildcard: if action is "read" in role's permissions, match any "read"
		if p.Action == action && p.Resource == "*" {
			return true, nil
		}
	}
	return false, nil
}

// getTeamProjectRoleMap returns the team→project role mapping for an org.
func (r *PermissionResolver) getTeamProjectRoleMap(ctx context.Context, orgID uuid.UUID) (map[string]string, error) {
	org, err := r.orgRepo.GetByID(ctx, orgID)
	if err != nil {
		return domain.DefaultTeamProjectRoleMap, nil
	}
	if m, ok := org.Settings["team_project_role_map"].(map[string]any); ok {
		result := make(map[string]string, len(m))
		for k, v := range m {
			if s, ok := v.(string); ok {
				result[k] = s
			}
		}
		if len(result) > 0 {
			return result, nil
		}
	}
	return domain.DefaultTeamProjectRoleMap, nil
}
