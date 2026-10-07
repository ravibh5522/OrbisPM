package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/auth"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
)

// UserIDFromCtx extracts the user ID from the context.
func UserIDFromCtx(ctx context.Context) uuid.UUID {
	return tenant.UserID(ctx)
}

// Auth middleware validates Zitadel-issued JWTs (RS256) or session tokens and sets user context.
// pool resolves the Zitadel identity to OrbisPM's stable internal user ID —
// see auth.ResolveUserID for why this can no longer be a pure derivation.
func Auth(zitadelClient *auth.ZitadelClient, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// First check Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				// Also check token query param (for SSE/WebSocket)
				if token := r.URL.Query().Get("token"); token != "" {
					authHeader = "Bearer " + token
				}
			}

			if authHeader == "" {
				http.Error(w, `{"message":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				http.Error(w, `{"message":"invalid authorization format"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := parts[1]

			claims, err := zitadelClient.ValidateToken(r.Context(), tokenStr)
			if err != nil {
				http.Error(w, `{"message":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			userID, err := auth.ResolveUserID(r.Context(), pool, claims.Subject, claims.Email)
			if err != nil {
				http.Error(w, `{"message":"could not resolve user"}`, http.StatusInternalServerError)
				return
			}

			ctx := tenant.SetUserID(r.Context(), userID)
			ctx = tenant.SetEmail(ctx, claims.Email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
