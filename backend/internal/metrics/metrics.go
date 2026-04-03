package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// ── HTTP Metrics ──

	// HTTPRequestsTotal counts all HTTP requests by method, route pattern, and status code.
	HTTPRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests.",
	}, []string{"method", "route", "status_code"})

	// HTTPRequestDuration tracks request latency by method, route pattern, and status code.
	HTTPRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request latency in seconds.",
		Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
	}, []string{"method", "route", "status_code"})

	// HTTPRequestsInFlight tracks the number of requests currently being processed.
	HTTPRequestsInFlight = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "http_requests_in_flight",
		Help: "Number of HTTP requests currently being processed.",
	})

	// HTTPResponseSize tracks response payload sizes.
	HTTPResponseSize = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_response_size_bytes",
		Help:    "HTTP response size in bytes.",
		Buckets: prometheus.ExponentialBuckets(100, 10, 7),
	}, []string{"method", "route"})

	// ── Database Metrics ──

	// DBPoolActive tracks active database connections.
	DBPoolActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "db_pool_active_connections",
		Help: "Number of active database connections.",
	})

	// DBPoolIdle tracks idle database connections.
	DBPoolIdle = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "db_pool_idle_connections",
		Help: "Number of idle database connections.",
	})

	// ── WebSocket Metrics ──

	// WSConnectionsActive tracks active WebSocket connections.
	WSConnectionsActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "ws_connections_active",
		Help: "Number of active WebSocket connections.",
	})

	// ── Background Jobs Metrics ──

	// AsynqTasksProcessed counts background tasks processed.
	AsynqTasksProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "asynq_tasks_processed_total",
		Help: "Total number of Asynq background tasks processed.",
	}, []string{"task_type", "status"})

	// ── Business Metrics ──

	// BusinessOpsTotal counts business operations (task/project/org CRUD).
	BusinessOpsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "business_operations_total",
		Help: "Total business operations by entity and action.",
	}, []string{"entity", "action"})

	// AuthEventsTotal counts authentication events.
	AuthEventsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "auth_events_total",
		Help: "Total authentication events by type and result.",
	}, []string{"event_type", "result"})

	// ActiveUsersGauge tracks currently authenticated unique users.
	ActiveUsersGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "active_users_current",
		Help: "Number of unique authenticated users in the last request window.",
	})

	// SearchQueriesTotal counts search API calls.
	SearchQueriesTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "search_queries_total",
		Help: "Total search queries by entity type.",
	}, []string{"entity_type"})

	// FileUploadsTotal counts file upload operations.
	FileUploadsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "file_uploads_total",
		Help: "Total file uploads by status.",
	}, []string{"status"})

	// FileUploadSizeBytes tracks upload payload sizes.
	FileUploadSizeBytes = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "file_upload_size_bytes",
		Help:    "File upload size in bytes.",
		Buckets: prometheus.ExponentialBuckets(1024, 4, 8), // 1KB to 64MB
	})

	// APIKeyUsageTotal counts API key-authenticated requests.
	APIKeyUsageTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "api_key_usage_total",
		Help: "Total number of requests authenticated via API key.",
	})

	// RBACDeniedTotal counts RBAC permission denials.
	RBACDeniedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "rbac_denied_total",
		Help: "Total RBAC permission denials by resource.",
	}, []string{"resource"})

	// EmailSentTotal counts emails sent.
	EmailSentTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "email_sent_total",
		Help: "Total emails sent by type and status.",
	}, []string{"email_type", "status"})

	// CacheHitsTotal counts cache hits/misses.
	CacheOpsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "cache_operations_total",
		Help: "Cache operations by type (hit/miss/set/delete).",
	}, []string{"cache_name", "operation"})

	// ── Frontend Analytics Metrics ──

	// PageViewsTotal counts page views reported by frontend.
	PageViewsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "page_views_total",
		Help: "Frontend page views by path.",
	}, []string{"path"})

	// FeatureUsageTotal counts feature usage reported by frontend.
	FeatureUsageTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "feature_usage_total",
		Help: "Frontend feature usage events by feature name and action.",
	}, []string{"feature", "action"})

	// FrontendErrorsTotal counts client-side errors.
	FrontendErrorsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "frontend_errors_total",
		Help: "Client-side errors reported by frontend.",
	}, []string{"error_type"})

	// SessionDurationSeconds tracks user session durations.
	SessionDurationSeconds = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "session_duration_seconds",
		Help:    "User session durations reported by frontend.",
		Buckets: []float64{30, 60, 120, 300, 600, 900, 1800, 3600, 7200},
	})
)
