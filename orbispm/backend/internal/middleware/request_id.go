package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// RequestID adds a unique request ID to each request header and response.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = uuid.New().String()
		}
		w.Header().Set("X-Request-ID", reqID)
		ctx := log.With().Str("request_id", reqID).Logger().WithContext(r.Context())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
