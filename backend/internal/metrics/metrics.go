package metrics

import (
"github.com/prometheus/client_golang/prometheus"
"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
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

// WSConnectionsActive tracks active WebSocket connections.
WSConnectionsActive = promauto.NewGauge(prometheus.GaugeOpts{
Name: "ws_connections_active",
Help: "Number of active WebSocket connections.",
})

// AsynqTasksProcessed counts background tasks processed.
AsynqTasksProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
Name: "asynq_tasks_processed_total",
Help: "Total number of Asynq background tasks processed.",
}, []string{"task_type", "status"})
)
