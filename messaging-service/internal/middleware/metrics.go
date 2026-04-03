package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "messaging_http_requests_total",
		Help: "Total number of HTTP requests by method, path, and status.",
	}, []string{"method", "path", "status"})

	httpRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "messaging_http_request_duration_seconds",
		Help:    "HTTP request latency in seconds.",
		Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
	}, []string{"method", "path"})

	wsConnectionsGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "messaging_ws_connections_active",
		Help: "Number of active WebSocket connections.",
	})

	// WSMessagesTotal counts WebSocket messages by type and direction.
	WSMessagesTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "messaging_ws_messages_total",
		Help: "Total WebSocket messages by type and direction.",
	}, []string{"msg_type", "direction"})

	// WSMessageLatency tracks message processing latency.
	WSMessageLatency = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "messaging_ws_message_latency_seconds",
		Help:    "WebSocket message processing latency in seconds.",
		Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5},
	})

	// ChannelMessagesTotal counts chat messages sent.
	ChannelMessagesTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "messaging_channel_messages_total",
		Help: "Total chat messages by channel type.",
	}, []string{"channel_type"})

	// ChannelsActiveGauge tracks active channels.
	ChannelsActiveGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "messaging_channels_active",
		Help: "Number of channels with recent activity.",
	})

	// TypingEventsTotal counts typing indicator events.
	TypingEventsTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "messaging_typing_events_total",
		Help: "Total typing indicator events.",
	})

	// ReactionEventsTotal counts message reaction events.
	ReactionEventsTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "messaging_reaction_events_total",
		Help: "Total message reaction events.",
	})
)

// IncWSConnections increments the active WebSocket connection gauge.
func IncWSConnections() { wsConnectionsGauge.Inc() }

// DecWSConnections decrements the active WebSocket connection gauge.
func DecWSConnections() { wsConnectionsGauge.Dec() }

// Metrics is Chi middleware that records Prometheus HTTP metrics.
// Skips WebSocket upgrade requests to preserve http.Hijacker.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/ws/") {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		rw := chimw.NewWrapResponseWriter(w, r.ProtoMajor)

		next.ServeHTTP(rw, r)

		// Use Chi route pattern for low-cardinality label
		routePattern := chi.RouteContext(r.Context()).RoutePattern()
		if routePattern == "" {
			routePattern = r.URL.Path
		}

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(rw.Status())

		httpRequestsTotal.WithLabelValues(r.Method, routePattern, status).Inc()
		httpRequestDuration.WithLabelValues(r.Method, routePattern).Observe(duration)
	})
}
