package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// rateLimiterEntry holds a per-IP limiter and its last-seen timestamp for eviction.
type rateLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimiter is a per-IP rate limiting middleware with LRU eviction.
type RateLimiter struct {
	limiters map[string]*rateLimiterEntry
	mu       sync.RWMutex
	rpm      int
	burst    int
}

// NewRateLimiter creates a new rate limiter middleware and starts the eviction goroutine.
func NewRateLimiter(requestsPerMinute, burst int) *RateLimiter {
	rl := &RateLimiter{
		limiters: make(map[string]*rateLimiterEntry),
		rpm:      requestsPerMinute,
		burst:    burst,
	}
	rl.startEviction()
	return rl
}

// isPrivateIP returns true if the IP is in a private/loopback range.
func isPrivateIP(ip net.IP) bool {
	privateRanges := []struct{ start, end net.IP }{
		{net.ParseIP("10.0.0.0"), net.ParseIP("10.255.255.255")},
		{net.ParseIP("172.16.0.0"), net.ParseIP("172.31.255.255")},
		{net.ParseIP("192.168.0.0"), net.ParseIP("192.168.255.255")},
		{net.ParseIP("127.0.0.0"), net.ParseIP("127.255.255.255")},
	}
	// IPv6 loopback
	if ip.Equal(net.IPv6loopback) {
		return true
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	for _, r := range privateRanges {
		if bytesGe(ip4, r.start.To4()) && bytesLe(ip4, r.end.To4()) {
			return true
		}
	}
	return false
}

func bytesGe(a, b net.IP) bool {
	for i := range a {
		if a[i] > b[i] {
			return true
		}
		if a[i] < b[i] {
			return false
		}
	}
	return true
}

func bytesLe(a, b net.IP) bool {
	for i := range a {
		if a[i] < b[i] {
			return true
		}
		if a[i] > b[i] {
			return false
		}
	}
	return true
}

// getRealIP extracts the real client IP.
// X-Forwarded-For is only trusted when the direct peer (RemoteAddr) is a private/trusted
// proxy IP (e.g., Kong inside the Docker network). This prevents IP spoofing from public clients.
func getRealIP(r *http.Request) string {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteHost = r.RemoteAddr
	}

	remoteIP := net.ParseIP(remoteHost)
	if remoteIP != nil && isPrivateIP(remoteIP) {
		// Peer is a trusted proxy — honour X-Forwarded-For.
		// Use the leftmost non-private IP (the actual client).
		xff := r.Header.Get("X-Forwarded-For")
		if xff != "" {
			for _, part := range strings.Split(xff, ",") {
				ip := net.ParseIP(strings.TrimSpace(part))
				if ip != nil && !isPrivateIP(ip) {
					return ip.String()
				}
			}
		}
	}

	return remoteHost
}

// startEviction launches a goroutine that purges stale entries every 10 minutes.
func (rl *RateLimiter) startEviction() {
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().Add(-10 * time.Minute)
			rl.mu.Lock()
			for ip, entry := range rl.limiters {
				if entry.lastSeen.Before(cutoff) {
					delete(rl.limiters, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()
}

func (rl *RateLimiter) getLimiter(ip string) *rate.Limiter {
	now := time.Now()

	rl.mu.RLock()
	entry, exists := rl.limiters[ip]
	rl.mu.RUnlock()

	if exists {
		rl.mu.Lock()
		rl.limiters[ip].lastSeen = now
		rl.mu.Unlock()
		return entry.limiter
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Double-check after acquiring write lock
	if entry, exists = rl.limiters[ip]; exists {
		entry.lastSeen = now
		return entry.limiter
	}

	limiter := rate.NewLimiter(rate.Limit(float64(rl.rpm)/60.0), rl.burst)
	rl.limiters[ip] = &rateLimiterEntry{limiter: limiter, lastSeen: now}
	return limiter
}

// Handler returns an HTTP middleware that enforces rate limiting per client IP.
func (rl *RateLimiter) Handler(next http.Handler) http.Handler {
	return rl.HandlerBy(getRealIP)(next)
}

// HandlerBy enforces rate limiting per key (e.g. the authenticated user).
func (rl *RateLimiter) HandlerBy(key func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return rl.limit(key, next)
	}
}

func (rl *RateLimiter) limit(key func(*http.Request) string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limiter := rl.getLimiter(key(r))
		if !limiter.Allow() {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"message":"rate limit exceeded"}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}
