package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/auth"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
)

// UserIDFromCtx extracts the user ID from the context.
func UserIDFromCtx(ctx context.Context) uuid.UUID {
	return tenant.UserID(ctx)
}

// Auth middleware validates Zitadel-issued JWTs (RS256) or session tokens and sets user context.
func Auth(zitadelClient *auth.ZitadelClient) func(http.Handler) http.Handler {
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

			// Zitadel uses "sub" for user ID
			userID, err := uuid.Parse(claims.Subject)
			if err != nil {
				// Zitadel sub may be numeric — use deterministic UUID
				userID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(claims.Subject))
			}

			ctx := tenant.SetUserID(r.Context(), userID)
			ctx = tenant.SetEmail(ctx, claims.Email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
