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
		path := r.URL.Path
		var maxAge int
		var swr int // stale-while-revalidate window

		switch {
		// Chat sidebar — clients prefetch this; serve stale while refreshing
		case strings.Contains(path, "/chat/sidebar"):
			maxAge = 30
			swr = 120

		// Chat messages — brief cache, allow stale reads while revalidating
		case strings.Contains(path, "/chat/") && strings.Contains(path, "/messages"):
			maxAge = 10
			swr = 30

		// Permission roles/defs change rarely - cache for 5 minutes
		case strings.Contains(path, "/permissions/roles"):
			maxAge = 300
			swr = 300

		// Organization data changes rarely
		case strings.Contains(path, "/orgs") && !strings.Contains(path, "/projects") && !strings.Contains(path, "/tasks"):
			maxAge = 120
			swr = 120

		// Dashboard stats — cached briefly, revalidate in background
		case strings.Contains(path, "/dashboard"):
			maxAge = 30
			swr = 120

		// Project list
		case strings.HasSuffix(path, "/projects"):
			maxAge = 30
			swr = 60

		// Team list
		case strings.HasSuffix(path, "/teams"):
			maxAge = 30
			swr = 60

		// Members list
		case strings.HasSuffix(path, "/members"):
			maxAge = 60
			swr = 120

		// Task lists update frequently — minimal cache
		case strings.Contains(path, "/tasks"):
			maxAge = 10
			swr = 30

		// Notifications
		case strings.Contains(path, "/notifications"):
			maxAge = 15
			swr = 60

		// Sticky notes
		case strings.Contains(path, "/sticky-notes"):
			maxAge = 30
			swr = 120

		// Default: no cache for dynamic data
		default:
			w.Header().Set("Cache-Control", "no-cache, must-revalidate")
			next.ServeHTTP(w, r)
			return
		}

		// Set cache header with private flag (not for CDNs) + stale-while-revalidate
		if swr > 0 {
			w.Header().Set("Cache-Control", fmt.Sprintf("private, max-age=%d, stale-while-revalidate=%d", maxAge, swr))
		} else {
			w.Header().Set("Cache-Control", fmt.Sprintf("private, max-age=%d", maxAge))
		}
		w.Header().Set("Vary", "Authorization") // Cache varies by user

		next.ServeHTTP(w, r)
	})
}
