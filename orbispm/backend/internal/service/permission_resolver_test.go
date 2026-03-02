package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/service"
)

// ================================================================
// Mock implementations
// ================================================================

// --- OrgMemberRepo ---

type mockOrgMemberRepo struct {
	members map[string]*domain.OrgMember
}

func newMockOrgMemberRepo() *mockOrgMemberRepo {
	return &mockOrgMemberRepo{members: make(map[string]*domain.OrgMember)}
}

func omKey(orgID, userID uuid.UUID) string { return orgID.String() + ":" + userID.String() }

func (m *mockOrgMemberRepo) Add(_ context.Context, _ pgx.Tx, mem *domain.OrgMember) error {
	m.members[omKey(mem.OrgID, mem.UserID)] = mem
	return nil
}

func (m *mockOrgMemberRepo) Remove(_ context.Context, _ pgx.Tx, orgID, userID uuid.UUID) error {
	delete(m.members, omKey(orgID, userID))
	return nil
}

func (m *mockOrgMemberRepo) Get(_ context.Context, orgID, userID uuid.UUID) (*domain.OrgMember, error) {
	mem, ok := m.members[omKey(orgID, userID)]
	if !ok {
		return nil, errors.New("not found")
	}
	return mem, nil
}

func (m *mockOrgMemberRepo) ListByOrg(_ context.Context, orgID uuid.UUID) ([]*domain.OrgMember, error) {
	var out []*domain.OrgMember
	for _, mem := range m.members {
		if mem.OrgID == orgID {
			out = append(out, mem)
		}
	}
	return out, nil
}

func (m *mockOrgMemberRepo) UpdateRole(_ context.Context, _ pgx.Tx, _, _ uuid.UUID, _ string) error {
	return nil
}

func (m *mockOrgMemberRepo) FindUserByEmail(_ context.Context, _ string) (uuid.UUID, error) {
	return uuid.Nil, errors.New("not found")
}

// --- TeamMemberRepo ---

type mockTeamMemberRepo struct {
	members map[uuid.UUID][]*domain.TeamMember
}

func newMockTeamMemberRepo() *mockTeamMemberRepo {
	return &mockTeamMemberRepo{members: make(map[uuid.UUID][]*domain.TeamMember)}
}

func (m *mockTeamMemberRepo) Add(_ context.Context, _ pgx.Tx, mem *domain.TeamMember) error {
	m.members[mem.TeamID] = append(m.members[mem.TeamID], mem)
	return nil
}

func (m *mockTeamMemberRepo) Remove(_ context.Context, _ pgx.Tx, _, _ uuid.UUID) error { return nil }

func (m *mockTeamMemberRepo) UpdateRole(_ context.Context, _ pgx.Tx, _, _ uuid.UUID, _ string) error {
	return nil
}

func (m *mockTeamMemberRepo) ListByTeam(_ context.Context, teamID uuid.UUID) ([]*domain.TeamMember, error) {
	return m.members[teamID], nil
}

// --- ProjectMemberRepo ---

type mockProjectMemberRepo struct {
	members map[uuid.UUID][]*domain.ProjectMember
}

func newMockProjectMemberRepo() *mockProjectMemberRepo {
	return &mockProjectMemberRepo{members: make(map[uuid.UUID][]*domain.ProjectMember)}
}

func (m *mockProjectMemberRepo) Add(_ context.Context, _ pgx.Tx, mem *domain.ProjectMember) error {
	m.members[mem.ProjectID] = append(m.members[mem.ProjectID], mem)
	return nil
}

func (m *mockProjectMemberRepo) Remove(_ context.Context, _ pgx.Tx, _, _ uuid.UUID) error {
	return nil
}

func (m *mockProjectMemberRepo) UpdateRole(_ context.Context, _ pgx.Tx, _, _ uuid.UUID, _ string) error {
	return nil
}

func (m *mockProjectMemberRepo) ListByProject(_ context.Context, projectID uuid.UUID) ([]*domain.ProjectMember, error) {
	return m.members[projectID], nil
}

func (m *mockProjectMemberRepo) ListEffectiveMembers(_ context.Context, _ uuid.UUID) ([]*domain.EffectiveMember, error) {
	return nil, nil
}

// --- ProjectTeamRepo ---

type mockProjectTeamRepo struct {
	links map[uuid.UUID][]*domain.ProjectTeam
}

func newMockProjectTeamRepo() *mockProjectTeamRepo {
	return &mockProjectTeamRepo{links: make(map[uuid.UUID][]*domain.ProjectTeam)}
}

func (m *mockProjectTeamRepo) Link(_ context.Context, _ pgx.Tx, projectID, teamID uuid.UUID) error {
	m.links[projectID] = append(m.links[projectID], &domain.ProjectTeam{ProjectID: projectID, TeamID: teamID})
	return nil
}

func (m *mockProjectTeamRepo) Unlink(_ context.Context, _ pgx.Tx, _, _ uuid.UUID) error { return nil }

func (m *mockProjectTeamRepo) ListByProject(_ context.Context, projectID uuid.UUID) ([]*domain.ProjectTeam, error) {
	return m.links[projectID], nil
}

func (m *mockProjectTeamRepo) ListByTeam(_ context.Context, _ uuid.UUID) ([]*domain.ProjectTeam, error) {
	return nil, nil
}

func (m *mockProjectTeamRepo) Count(_ context.Context, projectID uuid.UUID) (int, error) {
	return len(m.links[projectID]), nil
}

// --- RoleRepo ---

type mockRoleRepo struct {
	roles       map[uuid.UUID]*domain.Role
	rolesBySlug map[string]*domain.Role
	permissions map[uuid.UUID][]*domain.Permission
}

func newMockRoleRepo() *mockRoleRepo {
	return &mockRoleRepo{
		roles:       make(map[uuid.UUID]*domain.Role),
		rolesBySlug: make(map[string]*domain.Role),
		permissions: make(map[uuid.UUID][]*domain.Permission),
	}
}

func rKey(orgID uuid.UUID, scope, slug string) string {
	return orgID.String() + ":" + scope + ":" + slug
}

func (m *mockRoleRepo) Create(_ context.Context, _ pgx.Tx, role *domain.Role) (*domain.Role, error) {
	role.ID = uuid.New()
	m.roles[role.ID] = role
	m.rolesBySlug[rKey(role.OrgID, role.Scope, role.Slug)] = role
	return role, nil
}

func (m *mockRoleRepo) GetByID(_ context.Context, id uuid.UUID) (*domain.Role, error) {
	r, ok := m.roles[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return r, nil
}

func (m *mockRoleRepo) GetBySlug(_ context.Context, orgID uuid.UUID, scope, slug string) (*domain.Role, error) {
	r, ok := m.rolesBySlug[rKey(orgID, scope, slug)]
	if !ok {
		return nil, errors.New("not found")
	}
	return r, nil
}

func (m *mockRoleRepo) Update(_ context.Context, _ pgx.Tx, role *domain.Role) (*domain.Role, error) {
	m.roles[role.ID] = role
	return role, nil
}

func (m *mockRoleRepo) Delete(_ context.Context, _ pgx.Tx, id uuid.UUID) error {
	delete(m.roles, id)
	return nil
}

func (m *mockRoleRepo) ListByOrg(_ context.Context, orgID uuid.UUID, scope *string) ([]*domain.Role, error) {
	var out []*domain.Role
	for _, r := range m.roles {
		if r.OrgID == orgID && (scope == nil || *scope == r.Scope) {
			out = append(out, r)
		}
	}
	return out, nil
}

func (m *mockRoleRepo) SetPermissions(_ context.Context, _ pgx.Tx, _ uuid.UUID, _ []uuid.UUID) error {
	return nil
}

func (m *mockRoleRepo) GetPermissions(_ context.Context, roleID uuid.UUID) ([]*domain.Permission, error) {
	return m.permissions[roleID], nil
}

func (m *mockRoleRepo) addRole(orgID uuid.UUID, scope, slug, name string, perms ...*domain.Permission) *domain.Role {
	role := &domain.Role{ID: uuid.New(), OrgID: orgID, Scope: scope, Slug: slug, Name: name}
	m.roles[role.ID] = role
	m.rolesBySlug[rKey(orgID, scope, slug)] = role
	m.permissions[role.ID] = perms
	return role
}

// --- OrgRepo ---

type mockOrgRepo struct {
	orgs map[uuid.UUID]*domain.Org
}

func newMockOrgRepo() *mockOrgRepo {
	return &mockOrgRepo{orgs: make(map[uuid.UUID]*domain.Org)}
}

func (m *mockOrgRepo) Create(_ context.Context, _ pgx.Tx, org *domain.Org) (*domain.Org, error) {
	m.orgs[org.ID] = org
	return org, nil
}

func (m *mockOrgRepo) GetByID(_ context.Context, id uuid.UUID) (*domain.Org, error) {
	o, ok := m.orgs[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return o, nil
}

func (m *mockOrgRepo) GetBySlug(_ context.Context, slug string) (*domain.Org, error) {
	for _, o := range m.orgs {
		if o.Slug == slug {
			return o, nil
		}
	}
	return nil, errors.New("not found")
}

func (m *mockOrgRepo) Update(_ context.Context, _ pgx.Tx, org *domain.Org) (*domain.Org, error) {
	m.orgs[org.ID] = org
	return org, nil
}

func (m *mockOrgRepo) Delete(_ context.Context, _ pgx.Tx, id uuid.UUID) error {
	delete(m.orgs, id)
	return nil
}

func (m *mockOrgRepo) ListByUser(_ context.Context, _ uuid.UUID) ([]*domain.Org, error) {
	return nil, nil
}

// ================================================================
// Helper
// ================================================================

func perm(resource, action, scope string) *domain.Permission {
	return &domain.Permission{ID: uuid.New(), Resource: resource, Action: action, Scope: scope}
}

// ================================================================
// HasPermission tests
// ================================================================

func TestOwnerBypassesAll(t *testing.T) {
	ctx := context.Background()
	orgID, userID := uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: domain.RoleOrgOwner}

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	for _, tc := range []struct{ scope, res, act string }{
		{"org", "org", "delete"},
		{"org", "org", "transfer_ownership"},
		{"org", "settings", "update"},
		{"project", "tasks", "create"},
		{"team", "members", "invite"},
	} {
		has, err := r.HasPermission(ctx, userID, orgID, tc.scope, nil, tc.res, tc.act)
		require.NoError(t, err)
		assert.True(t, has, "owner should have %s:%s in %s", tc.res, tc.act, tc.scope)
	}
}

func TestAdminBypassExceptOrgDeleteAndTransfer(t *testing.T) {
	ctx := context.Background()
	orgID, userID := uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: domain.RoleOrgAdmin}

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, "org", nil, "settings", "update")
	require.NoError(t, err)
	assert.True(t, has)

	has, err = r.HasPermission(ctx, userID, orgID, "org", nil, "org", "delete")
	require.NoError(t, err)
	assert.False(t, has, "admin must not org:delete")

	has, err = r.HasPermission(ctx, userID, orgID, "org", nil, "org", "transfer_ownership")
	require.NoError(t, err)
	assert.False(t, has, "admin must not org:transfer_ownership")
}

func TestNonMemberDenied(t *testing.T) {
	ctx := context.Background()
	r := service.NewPermissionResolver(newMockOrgMemberRepo(), newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	has, err := r.HasPermission(ctx, uuid.New(), uuid.New(), "org", nil, "settings", "read")
	require.NoError(t, err)
	assert.False(t, has)
}

func TestDirectProjectMemberPermission(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID := uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	pm := newMockProjectMemberRepo()
	pm.members[projectID] = []*domain.ProjectMember{{ProjectID: projectID, UserID: userID, Role: "lead"}}

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeProject, "lead", "Lead", perm("tasks", "update", domain.ScopeProject))

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), pm, newMockProjectTeamRepo(), rr, newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, domain.ScopeProject, &projectID, "tasks", "update")
	require.NoError(t, err)
	assert.True(t, has)
}

func TestInheritedViaTeam(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID, teamID := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	tm := newMockTeamMemberRepo()
	tm.members[teamID] = []*domain.TeamMember{{TeamID: teamID, UserID: userID, Role: "team_lead"}}

	pt := newMockProjectTeamRepo()
	pt.links[projectID] = []*domain.ProjectTeam{{ProjectID: projectID, TeamID: teamID}}

	orgR := newMockOrgRepo()
	orgR.orgs[orgID] = &domain.Org{ID: orgID, Slug: "t", Settings: map[string]any{
		"team_project_role_map": map[string]any{"team_lead": "lead", "member": "contributor"},
	}}

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeProject, "lead", "Lead", perm("tasks", "update", domain.ScopeProject))

	r := service.NewPermissionResolver(om, tm, newMockProjectMemberRepo(), pt, rr, orgR)

	has, err := r.HasPermission(ctx, userID, orgID, domain.ScopeProject, &projectID, "tasks", "update")
	require.NoError(t, err)
	assert.True(t, has, "team_lead mapped to lead should have tasks:update")
}

func TestTeamScopedPermission(t *testing.T) {
	ctx := context.Background()
	orgID, userID, teamID := uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	tm := newMockTeamMemberRepo()
	tm.members[teamID] = []*domain.TeamMember{{TeamID: teamID, UserID: userID, Role: "team_lead"}}

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeTeam, "team_lead", "Team Lead", perm("members", "invite", domain.ScopeTeam))

	r := service.NewPermissionResolver(om, tm, newMockProjectMemberRepo(), newMockProjectTeamRepo(), rr, newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, domain.ScopeTeam, &teamID, "members", "invite")
	require.NoError(t, err)
	assert.True(t, has)
}

func TestOrgLevelFallback(t *testing.T) {
	ctx := context.Background()
	orgID, userID := uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeOrg, "member", "Member", perm("projects", "read", domain.ScopeOrg))

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), rr, newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, "org", nil, "projects", "read")
	require.NoError(t, err)
	assert.True(t, has)
}

func TestDeniedWhenNoMatchingPermission(t *testing.T) {
	ctx := context.Background()
	orgID, userID := uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "viewer"}

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeOrg, "viewer", "Viewer", perm("projects", "read", domain.ScopeOrg))

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), rr, newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, "org", nil, "projects", "delete")
	require.NoError(t, err)
	assert.False(t, has)
}

func TestDefaultRoleMapFallback(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID, teamID := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	tm := newMockTeamMemberRepo()
	tm.members[teamID] = []*domain.TeamMember{{TeamID: teamID, UserID: userID, Role: "team_lead"}}

	pt := newMockProjectTeamRepo()
	pt.links[projectID] = []*domain.ProjectTeam{{ProjectID: projectID, TeamID: teamID}}

	orgR := newMockOrgRepo()
	orgR.orgs[orgID] = &domain.Org{ID: orgID, Slug: "t", Settings: map[string]any{}} // no custom map

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeProject, "lead", "Lead", perm("tasks", "update", domain.ScopeProject))

	r := service.NewPermissionResolver(om, tm, newMockProjectMemberRepo(), pt, rr, orgR)

	has, err := r.HasPermission(ctx, userID, orgID, domain.ScopeProject, &projectID, "tasks", "update")
	require.NoError(t, err)
	assert.True(t, has, "should use default map team_lead->lead")
}

func TestWildcardResourcePermission(t *testing.T) {
	ctx := context.Background()
	orgID, userID := uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeOrg, "member", "Member", perm("*", "read", domain.ScopeOrg))

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), rr, newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, "org", nil, "projects", "read")
	require.NoError(t, err)
	assert.True(t, has, "wildcard resource should match")
}

func TestProjectMemberWithoutPermissionDenied(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID := uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	pm := newMockProjectMemberRepo()
	pm.members[projectID] = []*domain.ProjectMember{{ProjectID: projectID, UserID: userID, Role: "observer"}}

	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeProject, "observer", "Observer", perm("tasks", "read", domain.ScopeProject))
	// "member" org-level has no tasks:delete either
	rr.addRole(orgID, domain.ScopeOrg, "member", "Member", perm("projects", "read", domain.ScopeOrg))

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), pm, newMockProjectTeamRepo(), rr, newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, domain.ScopeProject, &projectID, "tasks", "delete")
	require.NoError(t, err)
	assert.False(t, has, "observer should not delete tasks")
}

func TestTeamMemberNotLinkedToProject(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID, teamID := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	tm := newMockTeamMemberRepo()
	tm.members[teamID] = []*domain.TeamMember{{TeamID: teamID, UserID: userID, Role: "team_lead"}}

	// No project-team link
	rr := newMockRoleRepo()
	rr.addRole(orgID, domain.ScopeOrg, "member", "Member")

	r := service.NewPermissionResolver(om, tm, newMockProjectMemberRepo(), newMockProjectTeamRepo(), rr, newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, domain.ScopeProject, &projectID, "tasks", "update")
	require.NoError(t, err)
	assert.False(t, has, "team not linked to project should not grant access")
}

func TestRoleNotFoundInDB(t *testing.T) {
	ctx := context.Background()
	orgID, userID := uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "custom_role_missing"}

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	has, err := r.HasPermission(ctx, userID, orgID, "org", nil, "settings", "read")
	require.NoError(t, err)
	assert.False(t, has, "unknown role in DB should deny")
}

// ================================================================
// GetEffectiveRole tests
// ================================================================

func TestEffectiveRole_OrgScope(t *testing.T) {
	ctx := context.Background()
	orgID, userID := uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "admin"}

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	role, err := r.GetEffectiveRole(ctx, userID, orgID, "org", nil)
	require.NoError(t, err)
	assert.Equal(t, "admin", role)
}

func TestEffectiveRole_DirectProject(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID := uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	pm := newMockProjectMemberRepo()
	pm.members[projectID] = []*domain.ProjectMember{{ProjectID: projectID, UserID: userID, Role: "lead"}}

	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), pm, newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	role, err := r.GetEffectiveRole(ctx, userID, orgID, domain.ScopeProject, &projectID)
	require.NoError(t, err)
	assert.Equal(t, "lead", role)
}

func TestEffectiveRole_InheritedTeam(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID, teamID := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	tm := newMockTeamMemberRepo()
	tm.members[teamID] = []*domain.TeamMember{{TeamID: teamID, UserID: userID, Role: "member"}}

	pt := newMockProjectTeamRepo()
	pt.links[projectID] = []*domain.ProjectTeam{{ProjectID: projectID, TeamID: teamID}}

	orgR := newMockOrgRepo()
	orgR.orgs[orgID] = &domain.Org{ID: orgID, Slug: "t", Settings: map[string]any{}}

	r := service.NewPermissionResolver(om, tm, newMockProjectMemberRepo(), pt, newMockRoleRepo(), orgR)

	role, err := r.GetEffectiveRole(ctx, userID, orgID, domain.ScopeProject, &projectID)
	require.NoError(t, err)
	assert.Equal(t, "contributor", role) // default map: member -> contributor
}

func TestEffectiveRole_NonMemberError(t *testing.T) {
	r := service.NewPermissionResolver(newMockOrgMemberRepo(), newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())
	_, err := r.GetEffectiveRole(context.Background(), uuid.New(), uuid.New(), "org", nil)
	assert.Error(t, err)
}

func TestEffectiveRole_TeamScope(t *testing.T) {
	ctx := context.Background()
	orgID, userID, teamID := uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	tm := newMockTeamMemberRepo()
	tm.members[teamID] = []*domain.TeamMember{{TeamID: teamID, UserID: userID, Role: "team_lead"}}

	r := service.NewPermissionResolver(om, tm, newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	role, err := r.GetEffectiveRole(ctx, userID, orgID, domain.ScopeTeam, &teamID)
	require.NoError(t, err)
	assert.Equal(t, "team_lead", role)
}

func TestEffectiveRole_FallsBackToOrgRole(t *testing.T) {
	ctx := context.Background()
	orgID, userID, projectID := uuid.New(), uuid.New(), uuid.New()

	om := newMockOrgMemberRepo()
	om.members[omKey(orgID, userID)] = &domain.OrgMember{OrgID: orgID, UserID: userID, Role: "member"}

	// Not a direct project member, no team links
	r := service.NewPermissionResolver(om, newMockTeamMemberRepo(), newMockProjectMemberRepo(), newMockProjectTeamRepo(), newMockRoleRepo(), newMockOrgRepo())

	role, err := r.GetEffectiveRole(ctx, userID, orgID, domain.ScopeProject, &projectID)
	require.NoError(t, err)
	assert.Equal(t, "member", role) // falls back to org role
}
