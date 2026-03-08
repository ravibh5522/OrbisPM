package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/pkg/tenant"
)

// APIKeyAuth middleware authenticates requests using API keys (X-API-Key header).
// If a valid API key is found, it sets user context and org context.
func APIKeyAuth(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := r.Header.Get("X-API-Key")
			if apiKey == "" {
				// No API key provided, pass through (auth middleware handles JWT)
				next.ServeHTTP(w, r)
				return
			}

			// Hash the key for lookup
			hash := sha256.Sum256([]byte(apiKey))
			keyHash := hex.EncodeToString(hash[:])

			var userID, orgID uuid.UUID
			var scopes []string
			err := pool.QueryRow(r.Context(),
				`SELECT user_id, org_id, scopes FROM api_keys 
				 WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > now())`,
				keyHash,
			).Scan(&userID, &orgID, &scopes)
			if err != nil {
				http.Error(w, `{"message":"invalid API key"}`, http.StatusUnauthorized)
				return
			}

			// Update last_used_at
			_, _ = pool.Exec(r.Context(),
				`UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1`, keyHash)

			// Set context
			ctx := tenant.SetUserID(r.Context(), userID)
			ctx = tenant.SetOrgID(ctx, orgID)
			ctx = context.WithValue(ctx, apiKeyScopesKey, scopes)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type ctxKey string

const apiKeyScopesKey ctxKey = "api_key_scopes"

// APIKeyScopesFromCtx returns the API key scopes from the context.
func APIKeyScopesFromCtx(ctx context.Context) []string {
	if v, ok := ctx.Value(apiKeyScopesKey).([]string); ok {
		return v
	}
	return nil
}

// RequireScope middleware checks that the API key has the required scope.
func RequireScope(scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			scopes := APIKeyScopesFromCtx(r.Context())
			if scopes == nil {
				// Not API key auth, allow through
				next.ServeHTTP(w, r)
				return
			}

			for _, s := range scopes {
				if s == scope || s == "*" || strings.HasPrefix(scope, s+":") {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, `{"message":"insufficient scope"}`, http.StatusForbidden)
		})
	}
}
