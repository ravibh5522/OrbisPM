package middleware

import (
"fmt"
"net/http"
"time"

"github.com/go-chi/chi/v5"

"github.com/orbispm/orbispm/internal/metrics"
)

// metricsResponseWriter wraps http.ResponseWriter to capture status code and bytes written.
type metricsResponseWriter struct {
http.ResponseWriter
statusCode   int
bytesWritten int
}

func newMetricsResponseWriter(w http.ResponseWriter) *metricsResponseWriter {
return &metricsResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (rw *metricsResponseWriter) WriteHeader(code int) {
rw.statusCode = code
rw.ResponseWriter.WriteHeader(code)
}

func (rw *metricsResponseWriter) Write(b []byte) (int, error) {
n, err := rw.ResponseWriter.Write(b)
rw.bytesWritten += n
return n, err
}

// Unwrap returns the underlying http.ResponseWriter for http.ResponseController.
func (rw *metricsResponseWriter) Unwrap() http.ResponseWriter {
return rw.ResponseWriter
}

// Flush delegates to the underlying ResponseWriter if it implements http.Flusher.
func (rw *metricsResponseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Metrics is a chi middleware that records Prometheus HTTP metrics.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metrics.HTTPRequestsInFlight.Inc()
		defer metrics.HTTPRequestsInFlight.Dec()

start := time.Now()
rw := newMetricsResponseWriter(w)

next.ServeHTTP(rw, r)

duration := time.Since(start).Seconds()
statusCode := fmt.Sprintf("%d", rw.statusCode)

// Use chi route pattern for low cardinality labels
routePattern := chi.RouteContext(r.Context()).RoutePattern()
if routePattern == "" {
routePattern = "unknown"
}

metrics.HTTPRequestsTotal.WithLabelValues(r.Method, routePattern, statusCode).Inc()
metrics.HTTPRequestDuration.WithLabelValues(r.Method, routePattern, statusCode).Observe(duration)
metrics.HTTPResponseSize.WithLabelValues(r.Method, routePattern).Observe(float64(rw.bytesWritten))
})
}
