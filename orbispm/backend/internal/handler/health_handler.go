package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthHandler handles health check endpoints.
type HealthHandler struct {
	pool  *pgxpool.Pool
	redis *redis.Client
}

func NewHealthHandler(pool *pgxpool.Pool, redis *redis.Client) *HealthHandler {
	return &HealthHandler{pool: pool, redis: redis}
}

// Routes registers health check routes.
func (h *HealthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.Health)
	r.Get("/ready", h.Ready)
	return r
}

// Health returns a basic health check.
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Ready checks database and Redis connectivity.
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	status := map[string]string{"status": "ok"}

	if err := h.pool.Ping(ctx); err != nil {
		status["status"] = "degraded"
		status["postgres"] = "down"
	} else {
		status["postgres"] = "up"
	}

	if h.redis != nil {
		if err := h.redis.Ping(ctx).Err(); err != nil {
			status["status"] = "degraded"
			status["redis"] = "down"
		} else {
			status["redis"] = "up"
		}
	}

	code := http.StatusOK
	if status["status"] == "degraded" {
		code = http.StatusServiceUnavailable
	}
	JSON(w, code, status)
}
