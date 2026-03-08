package middleware

import (
	"fmt"
	"net/http"
	"strings"
)

// CacheControl is middleware that sets Cache-Control headers based on the request method.
// For GET requests on certain endpoints, it sets short-lived cache headers to reduce server load.
// For mutating requests (POST, PUT, PATCH, DELETE), it ensures no caching.
func CacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip caching for mutating methods
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			next.ServeHTTP(w, r)
			return
		}

		// Determine cache duration based on endpoint
		// Longer cache for relatively static data
		path := r.URL.Path
		var maxAge int

		switch {
		// Permission roles/defs change rarely - cache for 5 minutes
		case strings.Contains(path, "/permissions/roles"):
			maxAge = 300

		// Organization data changes rarely - cache for 2 minutes
		case strings.Contains(path, "/orgs") && !strings.Contains(path, "/projects") && !strings.Contains(path, "/tasks"):
			maxAge = 120

		// Project list can be cached briefly - 30 seconds
		case strings.HasSuffix(path, "/projects"):
			maxAge = 30

		// Task lists update frequently - minimal cache (10 seconds)
		case strings.Contains(path, "/tasks"):
			maxAge = 10

		// Default: no cache for dynamic data
		default:
			w.Header().Set("Cache-Control", "no-cache, must-revalidate")
			next.ServeHTTP(w, r)
			return
		}

		// Set cache header with private flag (not for CDNs)
		w.Header().Set("Cache-Control", fmt.Sprintf("private, max-age=%d", maxAge))
		w.Header().Set("Vary", "Authorization") // Cache varies by user

		next.ServeHTTP(w, r)
	})
}
