package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/pkg/tenant"
)

// UserIDFromCtx extracts the user ID from the context.
func UserIDFromCtx(ctx context.Context) uuid.UUID {
	return tenant.UserID(ctx)
}

// Auth middleware validates JWT tokens (GoTrue-compatible HS256) and sets user context.
func Auth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// First check Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				// Also check apikey query param (for SSE/WebSocket)
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
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(jwtSecret), nil
			})
			if err != nil || !token.Valid {
				http.Error(w, `{"message":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"message":"invalid claims"}`, http.StatusUnauthorized)
				return
			}

			// GoTrue uses "sub" for user UUID
			sub, _ := claims.GetSubject()
			userID, err := uuid.Parse(sub)
			if err != nil {
				http.Error(w, `{"message":"invalid user id in token"}`, http.StatusUnauthorized)
				return
			}

			email, _ := claims["email"].(string)

			ctx := tenant.SetUserID(r.Context(), userID)
			ctx = tenant.SetEmail(ctx, email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
