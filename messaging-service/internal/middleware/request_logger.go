package middleware

import (
	"net/http"
	"strings"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog/log"
)

// RequestLogger logs every HTTP request with method, path, status, duration
// and request ID. It deliberately skips health / metrics / WS to reduce noise
// and preserve http.Hijacker for WebSocket upgrades.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if p == "/health" || p == "/health/ready" || p == "/metrics" || strings.HasPrefix(p, "/ws/") {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)

		next.ServeHTTP(ww, r)

		log.Info().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", ww.Status()).
			Dur("duration", time.Since(start)).
			Str("request_id", chimw.GetReqID(r.Context())).
			Str("remote", r.RemoteAddr).
			Msg("http request")
	})
}
