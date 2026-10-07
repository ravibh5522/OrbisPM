package service_test

// This test exercises the actual production code path for the RBAC fix on
// the `rbac` branch: a custom project role with no `project:read` permission
// must still be able to self-check its permissions via GetMyPermissions, and
// the returned permissions must be what the frontend can() logic depends on.
//
// It uses the real PermissionResolver, the real ProjectHandler.GetMyPermissions,
// and the real PermissionResolverMiddleware/chi router wiring — only the DB
// repositories are mocked, using the same mocks already defined in
// permission_resolver_test.go (same package, same file's mock types).

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/handler"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/service"
)

func TestCustomProjectRole_MyPermissions_WithoutReadPermission(t *testing.T) {
	orgID := uuid.New()
	userID := uuid.New()
	projectID := uuid.New()

	orgMemberRepo := newMockOrgMemberRepo()
	teamMemberRepo := newMockTeamMemberRepo()
	projectMemberRepo := newMockProjectMemberRepo()
	projectTeamRepo := newMockProjectTeamRepo()
	roleRepo := newMockRoleRepo()
	orgRepo := newMockOrgRepo()

	// User is a plain org member (not owner/admin) so we exercise the real
	// project-membership + custom-role path, not the admin bypass.
	require.NoError(t, orgMemberRepo.Add(context.Background(), nil, &domain.OrgMember{
		OrgID: orgID, UserID: userID, Role: domain.RoleOrgMember,
	}))

	// Custom project role created by an admin who forgot to check "read" —
	// exactly the scenario from RBAC_BEFORE_AFTER.md. It DOES have tasks:create.
	roleRepo.addRole(orgID, domain.ScopeProject, "field-tester", "Field Tester",
		&domain.Permission{Resource: "tasks", Action: "create"},
	)
	require.NoError(t, projectMemberRepo.Add(context.Background(), nil, &domain.ProjectMember{
		ProjectID: projectID, UserID: userID, Role: "field-tester", Source: "direct",
	}))

	resolver := service.NewPermissionResolver(
		orgMemberRepo, teamMemberRepo, projectMemberRepo, projectTeamRepo, roleRepo, orgRepo,
	)

	h := handler.NewProjectHandler(nil, nil)
	h.SetPermResolver(resolver)

	buildRequest := func() *http.Request {
		ctx := tenant.SetUserID(context.Background(), userID)
		ctx = tenant.SetOrgID(ctx, orgID)
		req := httptest.NewRequest(http.MethodGet, "/projects/"+projectID.String()+"/my-permissions", nil)
		return req.WithContext(ctx)
	}

	t.Run("BEFORE the fix: guarding my-permissions behind project:read locks the user out", func(t *testing.T) {
		r := chi.NewRouter()
		r.With(middleware.PermissionResolverMiddleware(resolver, "project", "projectId", "project", "read")).
			Get("/projects/{projectId}/my-permissions", h.GetMyPermissions)

		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, buildRequest())

		// This 403 is the bug: the role has tasks:create, but can never prove it
		// because the self-check endpoint itself demands a permission (project:read)
		// the role doesn't have.
		assert.Equal(t, http.StatusForbidden, rec.Code, "reproduces the pre-fix bug: self-check 403s for a read-less custom role")
	})

	t.Run("AFTER the fix: my-permissions requires only org membership and returns the real permission set", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/projects/{projectId}/my-permissions", h.GetMyPermissions) // matches current main.go

		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, buildRequest())

		require.Equal(t, http.StatusOK, rec.Code, "self-check must succeed for any org member regardless of the role's own permission set")

		var body struct {
			Role        string `json:"role"`
			Permissions []struct {
				Resource string `json:"resource"`
				Action   string `json:"action"`
			} `json:"permissions"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))

		assert.Equal(t, "field-tester", body.Role)
		require.Len(t, body.Permissions, 1)
		assert.Equal(t, "tasks", body.Permissions[0].Resource)
		assert.Equal(t, "create", body.Permissions[0].Action)
		// This is exactly what the frontend's can("tasks","create") needs to
		// return true and render the "Create Task" button — proving the fix
		// closes the gap end-to-end: backend enforcement AND frontend
		// conditional rendering now agree for a read-less custom role.
	})
}
