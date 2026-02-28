package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/pkg/tenant"
)

// RBAC middleware checks role-based permissions for an endpoint.
// It queries the membership tables to verify the user has the required role.
func RBAC(pool *pgxpool.Pool, requiredRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := tenant.UserID(r.Context())
			orgID := tenant.OrgID(r.Context())

			if userID == uuid.Nil || orgID == uuid.Nil {
				http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Query user's org role
			var role string
			err := pool.QueryRow(r.Context(),
				`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
				orgID, userID,
			).Scan(&role)
			if err != nil {
				http.Error(w, `{"message":"not a member of this organization"}`, http.StatusForbidden)
				return
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
