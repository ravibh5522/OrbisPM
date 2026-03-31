package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/service"
)

// --- In-memory RBAC role cache ---

const rbacCacheTTL = 3 * time.Minute

type rbacCacheEntry struct {
	role      string
	found     bool
	expiresAt time.Time
}

var (
	rbacCache sync.Map // map[string]rbacCacheEntry  key = "orgID:userID"
)

// PermissionResolverMiddleware creates middleware that checks permissions through the PermissionResolver.
// scope is "org", "team", or "project". scopeIDParam is the chi URL param name (e.g. "projectId").
func PermissionResolverMiddleware(resolver *service.PermissionResolver, scope, scopeIDParam, resource, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := tenant.UserID(r.Context())
			orgID := tenant.OrgID(r.Context())

			if userID == uuid.Nil || orgID == uuid.Nil {
				http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			var scopeID uuid.UUID
			if scopeIDParam != "" {
				idStr := chi.URLParam(r, scopeIDParam)
				parsed, err := uuid.Parse(idStr)
				if err != nil {
					http.Error(w, `{"message":"invalid scope id"}`, http.StatusBadRequest)
					return
				}
				scopeID = parsed
			}

			var scopeIDPtr *uuid.UUID
			if scopeID != uuid.Nil {
				scopeIDPtr = &scopeID
			}

			allowed, err := resolver.HasPermission(r.Context(), userID, orgID, scope, scopeIDPtr, resource, action)
			if err != nil || !allowed {
				http.Error(w, `{"message":"insufficient permissions"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequireResolvedPermission is a convenience for org-scope permission checks.
func RequireResolvedPermission(resolver *service.PermissionResolver, resource, action string) func(http.Handler) http.Handler {
	return PermissionResolverMiddleware(resolver, "org", "", resource, action)
}

// RBAC middleware checks role-based permissions for an endpoint.
// It queries the membership tables to verify the user has the required role.
// DEPRECATED: Use PermissionResolverMiddleware for new code.
func RBAC(pool *pgxpool.Pool, requiredRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := tenant.UserID(r.Context())
			orgID := tenant.OrgID(r.Context())

			if userID == uuid.Nil || orgID == uuid.Nil {
				http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Query user's org role (with cache)
			cacheKey := fmt.Sprintf("%s:%s", orgID, userID)
			var role string
			cached := false

			if v, ok := rbacCache.Load(cacheKey); ok {
				entry := v.(rbacCacheEntry)
				if time.Now().Before(entry.expiresAt) {
					if !entry.found {
						http.Error(w, `{"message":"not a member of this organization"}`, http.StatusForbidden)
						return
					}
					role = entry.role
					cached = true
				} else {
					rbacCache.Delete(cacheKey)
				}
			}

			if !cached {
				err := pool.QueryRow(r.Context(),
					`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
					orgID, userID,
				).Scan(&role)
				if err != nil {
					rbacCache.Store(cacheKey, rbacCacheEntry{found: false, expiresAt: time.Now().Add(rbacCacheTTL)})
					http.Error(w, `{"message":"not a member of this organization"}`, http.StatusForbidden)
					return
				}
				rbacCache.Store(cacheKey, rbacCacheEntry{role: role, found: true, expiresAt: time.Now().Add(rbacCacheTTL)})
			}

			// Owner and admin have access to everything
			if role == "owner" || role == "admin" {
				next.ServeHTTP(w, r)
				return
			}

			// Check if user's role is in the required roles
			if len(requiredRoles) == 0 {
				// No specific role required, membership is enough
				next.ServeHTTP(w, r)
				return
			}

			for _, rr := range requiredRoles {
				if role == rr {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Custom roles are now handled by the PermissionResolver system.
			// The legacy custom_roles table is deprecated — do not grant
			// access based on it. Users with custom roles should be checked
			// via PermissionResolverMiddleware on individual routes.

			http.Error(w, `{"message":"insufficient permissions"}`, http.StatusForbidden)
		})
	}
}

// RequireOrgMember middleware ensures the user is a member of the current org.
func RequireOrgMember(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return RBAC(pool) // Empty roles = just check membership
}

// RequireOrgAdmin middleware ensures the user is an admin or owner of the current org.
func RequireOrgAdmin(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return RBAC(pool, "owner", "admin")
}

// RequireOrgOwner middleware ensures the user is the owner of the current org.
func RequireOrgOwner(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return RBAC(pool, "owner")
}

// RequireTeamRole middleware checks team-level membership and role.
// Org owner/admin bypasses team role checks.
func RequireTeamRole(pool *pgxpool.Pool, requiredRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := tenant.UserID(r.Context())
			orgID := tenant.OrgID(r.Context())

			if userID == uuid.Nil || orgID == uuid.Nil {
				http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Org owner/admin bypass
			var orgRole string
			_ = pool.QueryRow(r.Context(),
				`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
				orgID, userID,
			).Scan(&orgRole)
			if orgRole == "owner" || orgRole == "admin" {
				next.ServeHTTP(w, r)
				return
			}

			teamIDStr := chi.URLParam(r, "teamId")
			teamID, err := uuid.Parse(teamIDStr)
			if err != nil {
				http.Error(w, `{"message":"invalid team id"}`, http.StatusBadRequest)
				return
			}

			var teamRole string
			err = pool.QueryRow(r.Context(),
				`SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
				teamID, userID,
			).Scan(&teamRole)
			if err != nil {
				http.Error(w, `{"message":"not a member of this team"}`, http.StatusForbidden)
				return
			}

			if len(requiredRoles) == 0 {
				next.ServeHTTP(w, r)
				return
			}

			for _, rr := range requiredRoles {
				if teamRole == rr {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, `{"message":"insufficient team permissions"}`, http.StatusForbidden)
		})
	}
}

// RequireProjectRole middleware checks project-level membership and role.
// Org owner/admin bypasses project role checks.
func RequireProjectRole(pool *pgxpool.Pool, requiredRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := tenant.UserID(r.Context())
			orgID := tenant.OrgID(r.Context())

			if userID == uuid.Nil || orgID == uuid.Nil {
				http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Org owner/admin bypass
			var orgRole string
			_ = pool.QueryRow(r.Context(),
				`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
				orgID, userID,
			).Scan(&orgRole)
			if orgRole == "owner" || orgRole == "admin" {
				next.ServeHTTP(w, r)
				return
			}

			projectIDStr := chi.URLParam(r, "projectId")
			projectID, err := uuid.Parse(projectIDStr)
			if err != nil {
				http.Error(w, `{"message":"invalid project id"}`, http.StatusBadRequest)
				return
			}

			var projectRole string
			err = pool.QueryRow(r.Context(),
				`SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
				projectID, userID,
			).Scan(&projectRole)
			if err != nil {
				http.Error(w, `{"message":"not a member of this project"}`, http.StatusForbidden)
				return
			}

			if len(requiredRoles) == 0 {
				next.ServeHTTP(w, r)
				return
			}

			for _, rr := range requiredRoles {
				if projectRole == rr {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, `{"message":"insufficient project permissions"}`, http.StatusForbidden)
		})
	}
}

// RequirePermission middleware checks custom role permissions.
// resource is e.g. "tasks", action is e.g. "create".
// Org owner/admin bypasses all permission checks.
func RequirePermission(pool *pgxpool.Pool, resource, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := tenant.UserID(r.Context())
			orgID := tenant.OrgID(r.Context())

			if userID == uuid.Nil || orgID == uuid.Nil {
				http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Get user's org role
			var orgRole string
			err := pool.QueryRow(r.Context(),
				`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
				orgID, userID,
			).Scan(&orgRole)
			if err != nil {
				http.Error(w, `{"message":"not a member of this organization"}`, http.StatusForbidden)
				return
			}

			// Owner and admin have all permissions
			if orgRole == "owner" || orgRole == "admin" {
				next.ServeHTTP(w, r)
				return
			}

			// Built-in roles with known permissions — member and viewer
			if orgRole == "member" || orgRole == "viewer" || orgRole == "billing_admin" {
				// Built-in roles: check hardcoded permission matrix
				if hasBuiltInPermission(orgRole, resource, action) {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Custom roles are now handled by the PermissionResolver system.
			// The legacy custom_roles table is deprecated — do not grant
			// access based on it.

			http.Error(w, `{"message":"insufficient permissions"}`, http.StatusForbidden)
		})
	}
}

// hasBuiltInPermission checks if a built-in role has a specific permission.
func hasBuiltInPermission(role, resource, action string) bool {
	// Member: can read everything, can create/update tasks and comments
	if role == "member" {
		if action == "read" {
			return true
		}
		if resource == "tasks" || resource == "comments" || resource == "checklists" {
			return true // create, update, delete
		}
		return false
	}
	// Viewer: read-only
	if role == "viewer" {
		return action == "read"
	}
	// Billing admin: only billing resource
	if role == "billing_admin" {
		return resource == "billing" || action == "read"
	}
	return false
}
