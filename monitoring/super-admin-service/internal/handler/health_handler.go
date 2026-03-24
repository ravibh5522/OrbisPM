// Package handler provides HTTP handlers for the super admin service
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/monitoring-super-admin/internal/config"
)

// HealthHandler handles health check endpoints
type HealthHandler struct {
	cfg    *config.Config
	db     *pgxpool.Pool
	redis  *redis.Client
	client *http.Client
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(cfg *config.Config, db *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{
		cfg:   cfg,
		db:    db,
		redis: rdb,
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// ServiceHealth represents the health status of a service
type ServiceHealth struct {
	Name      string        `json:"name"`
	Status    string        `json:"status"` // "healthy", "unhealthy", "degraded"
	Latency   time.Duration `json:"latency_ms"`
	Message   string        `json:"message,omitempty"`
	CheckedAt time.Time     `json:"checked_at"`
}

// Health returns basic health status
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok","service":"super-admin"}`))
}

// Ready checks if the service is ready
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check PostgreSQL
	if err := h.db.Ping(ctx); err != nil {
		http.Error(w, `{"status":"not ready","reason":"database unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	// Check Redis
	if err := h.redis.Ping(ctx).Err(); err != nil {
		http.Error(w, `{"status":"not ready","reason":"redis unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ready"}`))
}

// AllServices returns health status of all services
func (h *HealthHandler) AllServices(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	services := []ServiceHealth{
		h.checkDatabase(ctx),
		h.checkRedis(ctx),
		h.checkPrometheus(ctx),
		h.checkLoki(ctx),
		h.checkAlertmanager(ctx),
		h.checkGrafana(ctx),
	}

	// Calculate overall status
	overallStatus := "healthy"
	unhealthyCount := 0
	for _, svc := range services {
		if svc.Status == "unhealthy" {
			unhealthyCount++
		}
	}
	if unhealthyCount > 0 {
		if unhealthyCount == len(services) {
			overallStatus = "unhealthy"
		} else {
			overallStatus = "degraded"
		}
	}

	response := map[string]interface{}{
		"timestamp": time.Now(),
		"status":    overallStatus,
		"services":  services,
		"summary": map[string]int{
			"total":     len(services),
			"healthy":   len(services) - unhealthyCount,
			"unhealthy": unhealthyCount,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ServiceStatus returns a simplified service status
func (h *HealthHandler) ServiceStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	status := map[string]string{
		"api":          h.checkHTTP(ctx, "http://orbispm-api:8080/health"),
		"postgres":     h.checkDBStatus(ctx),
		"redis":        h.checkRedisStatus(ctx),
		"prometheus":   h.checkHTTP(ctx, h.cfg.PrometheusURL+"/-/healthy"),
		"loki":         h.checkHTTP(ctx, h.cfg.LokiURL+"/ready"),
		"alertmanager": h.checkHTTP(ctx, h.cfg.AlertmanagerURL+"/-/healthy"),
		"grafana":      h.checkHTTP(ctx, h.cfg.GrafanaURL+"/api/health"),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"timestamp": time.Now(),
		"services":  status,
	})
}

func (h *HealthHandler) checkDatabase(ctx context.Context) ServiceHealth {
	start := time.Now()
	svc := ServiceHealth{
		Name:      "PostgreSQL",
		CheckedAt: time.Now(),
	}

	if err := h.db.Ping(ctx); err != nil {
		svc.Status = "unhealthy"
		svc.Message = err.Error()
	} else {
		svc.Status = "healthy"
	}
	svc.Latency = time.Since(start) / time.Millisecond

	return svc
}

func (h *HealthHandler) checkRedis(ctx context.Context) ServiceHealth {
	start := time.Now()
	svc := ServiceHealth{
		Name:      "Redis",
		CheckedAt: time.Now(),
	}

	if err := h.redis.Ping(ctx).Err(); err != nil {
		svc.Status = "unhealthy"
		svc.Message = err.Error()
	} else {
		svc.Status = "healthy"
	}
	svc.Latency = time.Since(start) / time.Millisecond

	return svc
}

func (h *HealthHandler) checkPrometheus(ctx context.Context) ServiceHealth {
	return h.checkService(ctx, "Prometheus", h.cfg.PrometheusURL+"/-/healthy")
}

func (h *HealthHandler) checkLoki(ctx context.Context) ServiceHealth {
	return h.checkService(ctx, "Loki", h.cfg.LokiURL+"/ready")
}

func (h *HealthHandler) checkAlertmanager(ctx context.Context) ServiceHealth {
	return h.checkService(ctx, "Alertmanager", h.cfg.AlertmanagerURL+"/-/healthy")
}

func (h *HealthHandler) checkGrafana(ctx context.Context) ServiceHealth {
	return h.checkService(ctx, "Grafana", h.cfg.GrafanaURL+"/api/health")
}

func (h *HealthHandler) checkService(ctx context.Context, name, url string) ServiceHealth {
	start := time.Now()
	svc := ServiceHealth{
		Name:      name,
		CheckedAt: time.Now(),
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		svc.Status = "unhealthy"
		svc.Message = err.Error()
		return svc
	}

	resp, err := h.client.Do(req)
	if err != nil {
		svc.Status = "unhealthy"
		svc.Message = err.Error()
	} else {
		defer resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			svc.Status = "healthy"
		} else {
			svc.Status = "unhealthy"
			svc.Message = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
	}
	svc.Latency = time.Since(start) / time.Millisecond

	return svc
}

func (h *HealthHandler) checkHTTP(ctx context.Context, url string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "unhealthy"
	}

	resp, err := h.client.Do(req)
	if err != nil {
		log.Debug().Err(err).Str("url", url).Msg("Health check failed")
		return "unhealthy"
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return "healthy"
	}
	return "unhealthy"
}

func (h *HealthHandler) checkDBStatus(ctx context.Context) string {
	if err := h.db.Ping(ctx); err != nil {
		return "unhealthy"
	}
	return "healthy"
}

func (h *HealthHandler) checkRedisStatus(ctx context.Context) string {
	if err := h.redis.Ping(ctx).Err(); err != nil {
		return "unhealthy"
	}
	return "healthy"
}
