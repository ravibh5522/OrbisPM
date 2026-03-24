// Package handler provides HTTP handlers for the super admin service
package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/orbispm/monitoring-super-admin/internal/config"
)

// MetricsHandler handles metrics endpoints
type MetricsHandler struct {
	cfg    *config.Config
	client *http.Client
}

// NewMetricsHandler creates a new metrics handler
func NewMetricsHandler(cfg *config.Config) *MetricsHandler {
	return &MetricsHandler{
		cfg: cfg,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// OverviewResponse represents the metrics overview
type OverviewResponse struct {
	Timestamp       time.Time              `json:"timestamp"`
	APIRequests     MetricSummary          `json:"api_requests"`
	ErrorRate       MetricSummary          `json:"error_rate"`
	P95Latency      MetricSummary          `json:"p95_latency"`
	ActiveUsers     MetricSummary          `json:"active_users"`
	SystemHealth    map[string]interface{} `json:"system_health"`
	AlertsSummary   AlertsSummary          `json:"alerts_summary"`
}

// MetricSummary represents a metric summary
type MetricSummary struct {
	Current float64 `json:"current"`
	Change  float64 `json:"change"`
	Trend   string  `json:"trend"` // "up", "down", "stable"
}

// AlertsSummary represents alerts summary
type AlertsSummary struct {
	Critical int `json:"critical"`
	Warning  int `json:"warning"`
	Info     int `json:"info"`
}

// Overview returns a high-level metrics overview
func (h *MetricsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	response := OverviewResponse{
		Timestamp: time.Now(),
	}

	// Fetch request rate from Prometheus
	reqRate, err := h.queryPrometheus(`sum(rate(http_requests_total[5m]))`)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch request rate")
	} else {
		response.APIRequests = MetricSummary{
			Current: reqRate,
			Trend:   "stable",
		}
	}

	// Fetch error rate
	errorRate, err := h.queryPrometheus(`sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100`)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch error rate")
	} else {
		response.ErrorRate = MetricSummary{
			Current: errorRate,
			Trend:   "stable",
		}
	}

	// Fetch P95 latency
	p95, err := h.queryPrometheus(`histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) * 1000`)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch P95 latency")
	} else {
		response.P95Latency = MetricSummary{
			Current: p95,
			Trend:   "stable",
		}
	}

	// System health
	response.SystemHealth = map[string]interface{}{
		"api":       "healthy",
		"database":  "healthy",
		"redis":     "healthy",
		"websocket": "healthy",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// APIMetrics returns detailed API metrics
func (h *MetricsHandler) APIMetrics(w http.ResponseWriter, r *http.Request) {
	timeRange := r.URL.Query().Get("range")
	if timeRange == "" {
		timeRange = "1h"
	}

	// Query multiple metrics
	metrics := map[string]interface{}{
		"timestamp": time.Now(),
		"range":     timeRange,
	}

	// Request rate over time
	reqRateQuery := fmt.Sprintf(`sum(rate(http_requests_total[5m]))[%s:1m]`, timeRange)
	metrics["request_rate"] = h.queryPrometheusRange(reqRateQuery)

	// Status code distribution
	statusQuery := `sum by (status) (rate(http_requests_total[5m]))`
	metrics["status_distribution"] = h.queryPrometheusRange(statusQuery)

	// Top endpoints by request count
	topEndpoints := `topk(10, sum by (route) (rate(http_requests_total[5m])))`
	metrics["top_endpoints"] = h.queryPrometheusRange(topEndpoints)

	// Latency percentiles
	metrics["latency_p50"], _ = h.queryPrometheus(`histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) * 1000`)
	metrics["latency_p95"], _ = h.queryPrometheus(`histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) * 1000`)
	metrics["latency_p99"], _ = h.queryPrometheus(`histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) * 1000`)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// SystemMetrics returns system resource metrics
func (h *MetricsHandler) SystemMetrics(w http.ResponseWriter, r *http.Request) {
	metrics := map[string]interface{}{
		"timestamp": time.Now(),
	}

	// CPU usage
	metrics["cpu_usage"], _ = h.queryPrometheus(`100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`)

	// Memory usage
	metrics["memory_usage"], _ = h.queryPrometheus(`(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100`)

	// Disk usage
	metrics["disk_usage"], _ = h.queryPrometheus(`(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100`)

	// Container stats
	metrics["container_cpu"], _ = h.queryPrometheus(`sum by (name) (rate(container_cpu_usage_seconds_total[5m])) * 100`)
	metrics["container_memory"], _ = h.queryPrometheus(`sum by (name) (container_memory_usage_bytes / 1024 / 1024)`)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// DatabaseMetrics returns database metrics
func (h *MetricsHandler) DatabaseMetrics(w http.ResponseWriter, r *http.Request) {
	metrics := map[string]interface{}{
		"timestamp": time.Now(),
	}

	// Connection pool
	metrics["active_connections"], _ = h.queryPrometheus(`pg_stat_activity_count{state="active"}`)
	metrics["idle_connections"], _ = h.queryPrometheus(`pg_stat_activity_count{state="idle"}`)

	// Transaction rate
	metrics["commits_rate"], _ = h.queryPrometheus(`rate(pg_stat_database_xact_commit[5m])`)
	metrics["rollbacks_rate"], _ = h.queryPrometheus(`rate(pg_stat_database_xact_rollback[5m])`)

	// Cache hit ratio
	metrics["cache_hit_ratio"], _ = h.queryPrometheus(`pg_stat_database_blks_hit / (pg_stat_database_blks_hit + pg_stat_database_blks_read) * 100`)

	// Rows metrics
	metrics["rows_returned"], _ = h.queryPrometheus(`rate(pg_stat_database_tup_returned[5m])`)
	metrics["rows_inserted"], _ = h.queryPrometheus(`rate(pg_stat_database_tup_inserted[5m])`)
	metrics["rows_updated"], _ = h.queryPrometheus(`rate(pg_stat_database_tup_updated[5m])`)
	metrics["rows_deleted"], _ = h.queryPrometheus(`rate(pg_stat_database_tup_deleted[5m])`)

	// Database size
	metrics["database_size_mb"], _ = h.queryPrometheus(`pg_database_size_bytes / 1024 / 1024`)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// RedisMetrics returns Redis metrics
func (h *MetricsHandler) RedisMetrics(w http.ResponseWriter, r *http.Request) {
	metrics := map[string]interface{}{
		"timestamp": time.Now(),
	}

	// Memory
	metrics["used_memory_mb"], _ = h.queryPrometheus(`redis_memory_used_bytes / 1024 / 1024`)
	metrics["peak_memory_mb"], _ = h.queryPrometheus(`redis_memory_max_bytes / 1024 / 1024`)

	// Connections
	metrics["connected_clients"], _ = h.queryPrometheus(`redis_connected_clients`)

	// Commands per second
	metrics["commands_per_sec"], _ = h.queryPrometheus(`rate(redis_commands_processed_total[5m])`)

	// Hit ratio
	hits, _ := h.queryPrometheus(`redis_keyspace_hits_total`)
	misses, _ := h.queryPrometheus(`redis_keyspace_misses_total`)
	if hits+misses > 0 {
		metrics["hit_ratio"] = (hits / (hits + misses)) * 100
	}

	// Keys
	metrics["total_keys"], _ = h.queryPrometheus(`sum(redis_db_keys)`)
	metrics["expired_keys"], _ = h.queryPrometheus(`redis_expired_keys_total`)
	metrics["evicted_keys"], _ = h.queryPrometheus(`redis_evicted_keys_total`)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// queryPrometheus executes an instant query
func (h *MetricsHandler) queryPrometheus(query string) (float64, error) {
	url := fmt.Sprintf("%s/api/v1/query?query=%s", h.cfg.PrometheusURL, query)

	resp, err := h.client.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	var result struct {
		Status string `json:"status"`
		Data   struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Value []interface{} `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return 0, err
	}

	if result.Status != "success" || len(result.Data.Result) == 0 {
		return 0, nil
	}

	if len(result.Data.Result[0].Value) >= 2 {
		if valueStr, ok := result.Data.Result[0].Value[1].(string); ok {
			var value float64
			fmt.Sscanf(valueStr, "%f", &value)
			return value, nil
		}
	}

	return 0, nil
}

// queryPrometheusRange executes a range query (returns raw response)
func (h *MetricsHandler) queryPrometheusRange(query string) interface{} {
	url := fmt.Sprintf("%s/api/v1/query?query=%s", h.cfg.PrometheusURL, query)

	resp, err := h.client.Get(url)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result
}
