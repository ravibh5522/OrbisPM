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
// pool resolves the Zitadel identity to Simplify Projects's stable internal user ID —
// see auth.ResolveUserID for why this can no longer be a pure derivation.
func Auth(zitadelClient *auth.ZitadelClient, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// API-key auth (agents, MCP, scripts): scoped to one org, acts as the key's owner.
			if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
				ctx, status, msg := authenticateAPIKey(pool, r, apiKey)
				if ctx == nil {
					http.Error(w, `{"message":"`+msg+`"}`, status)
					return
				}
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

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

			// Some tokens carry no email claim; fall back to the user record so
			// we never persist an empty email.
			if claims.Email == "" {
				if u, uerr := zitadelClient.GetUser(r.Context(), claims.Subject); uerr == nil {
					claims.Email = u.Email
				}
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
