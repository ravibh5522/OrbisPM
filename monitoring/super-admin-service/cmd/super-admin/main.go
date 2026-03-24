// Package main is the entry point for the super admin service
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/monitoring-super-admin/internal/config"
	"github.com/orbispm/monitoring-super-admin/internal/handler"
	authmw "github.com/orbispm/monitoring-super-admin/internal/middleware"
)

func main() {
	// Configure zerolog
	zerolog.TimeFieldFormat = time.RFC3339
	if os.Getenv("ENV") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load configuration")
	}

	log.Info().
		Str("env", cfg.Env).
		Str("port", cfg.Port).
		Msg("Starting Super Admin service")

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to PostgreSQL
	dbpool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to PostgreSQL")
	}
	defer dbpool.Close()

	if err := dbpool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("Failed to ping PostgreSQL")
	}
	log.Info().Msg("Connected to PostgreSQL")

	// Connect to Redis
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to parse Redis URL")
	}
	if cfg.RedisPassword != "" {
		redisOpts.Password = cfg.RedisPassword
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatal().Err(err).Msg("Failed to ping Redis")
	}
	log.Info().Msg("Connected to Redis")

	// Initialize handlers
	metricsHandler := handler.NewMetricsHandler(cfg)
	alertsHandler := handler.NewAlertsHandler(cfg)
	tenantsHandler := handler.NewTenantsHandler(dbpool)
	healthHandler := handler.NewHealthHandler(cfg, dbpool, rdb)

	// Setup router
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(authmw.Logger)

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public routes
	r.Get("/health", healthHandler.Health)
	r.Get("/ready", healthHandler.Ready)
	r.Handle("/metrics", promhttp.Handler())

	// Serve static web UI
	webDir := "/app/web"
	if cfg.Env == "development" {
		webDir = "./web"
	}
	fileServer := http.FileServer(http.Dir(webDir))
	r.Handle("/*", http.StripPrefix("/", fileServer))

	// Protected API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth middleware for API routes
		r.Use(authmw.SuperAdminAuth(cfg))

		// Metrics endpoints
		r.Route("/metrics", func(r chi.Router) {
			r.Get("/overview", metricsHandler.Overview)
			r.Get("/api", metricsHandler.APIMetrics)
			r.Get("/system", metricsHandler.SystemMetrics)
			r.Get("/database", metricsHandler.DatabaseMetrics)
			r.Get("/redis", metricsHandler.RedisMetrics)
		})

		// Alerts endpoints
		r.Route("/alerts", func(r chi.Router) {
			r.Get("/", alertsHandler.List)
			r.Get("/active", alertsHandler.Active)
			r.Get("/history", alertsHandler.History)
			r.Post("/{fingerprint}/silence", alertsHandler.Silence)
		})

		// Tenants endpoints
		r.Route("/tenants", func(r chi.Router) {
			r.Get("/", tenantsHandler.List)
			r.Get("/{orgID}", tenantsHandler.Get)
			r.Get("/{orgID}/metrics", tenantsHandler.Metrics)
			r.Get("/{orgID}/usage", tenantsHandler.Usage)
		})

		// Health checks
		r.Route("/health-checks", func(r chi.Router) {
			r.Get("/", healthHandler.AllServices)
			r.Get("/services", healthHandler.ServiceStatus)
		})
	})

	// Start HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Info().Str("addr", srv.Addr).Msg("Starting HTTP server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("HTTP server failed")
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("HTTP server shutdown failed")
	}

	log.Info().Msg("Super Admin service stopped")
}
