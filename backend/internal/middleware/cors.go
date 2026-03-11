package middleware

import (
	"net/http"
	"strings"

	"github.com/go-chi/cors"
)

// allowedOriginDomains lists base domains whose subdomains are permitted.
var allowedOriginDomains = []string{
	".orbispm.in",
	".orbispm.live",
}

// isAllowedOrigin returns true if origin matches an exact allowed origin or
// is a subdomain of one of the permitted base domains.
func isAllowedOrigin(allowedOrigins []string, origin string) bool {
	for _, o := range allowedOrigins {
		if o == origin {
			return true
		}
	}
	// Strip scheme for subdomain matching.
	host := origin
	if idx := strings.Index(host, "://"); idx >= 0 {
		host = host[idx+3:]
	}
	for _, domain := range allowedOriginDomains {
		if strings.HasSuffix(host, domain) || host == domain[1:] {
			return true
		}
	}
	return false
}

// NewCORSHandler creates a cors.Handler for use in chi middleware chain.
// It allows all exact origins in allowedOrigins plus any subdomain of
// orbispm.in and orbispm.live.
func NewCORSHandler(allowedOrigins []string) *cors.Cors {
	return cors.New(cors.Options{
		AllowOriginFunc:  func(r *http.Request, origin string) bool { return isAllowedOrigin(allowedOrigins, origin) },
		AllowedMethods:  []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:  []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-API-Key"},
		ExposedHeaders:  []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}
