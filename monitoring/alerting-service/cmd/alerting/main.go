// Package main is the entry point for the alerting service
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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/monitoring-alerting/internal/config"
	"github.com/orbispm/monitoring-alerting/internal/evaluator"
	"github.com/orbispm/monitoring-alerting/internal/notifier"
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
		Str("eval_interval", cfg.EvalInterval.String()).
		Msg("Starting alert engine")

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to PostgreSQL
	dbpool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to PostgreSQL")
	}
	defer dbpool.Close()

	// Verify database connection
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

	// Verify Redis connection
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatal().Err(err).Msg("Failed to ping Redis")
	}
	log.Info().Msg("Connected to Redis")

	// Initialize evaluators
	metricEval := evaluator.NewMetricEvaluator(cfg.PrometheusURL)
	logEval := evaluator.NewLogEvaluator(cfg.LokiURL)
	businessEval := evaluator.NewBusinessEvaluator(dbpool)

	// Initialize notifier
	dedup := notifier.NewDeduplicator(rdb, cfg.AlertCooldown)
	router := notifier.NewRouter(cfg.AlertmanagerURL)

	// Create alert engine
	engine := &AlertEngine{
		cfg:          cfg,
		metricEval:   metricEval,
		logEval:      logEval,
		businessEval: businessEval,
		dedup:        dedup,
		router:       router,
	}

	// Start evaluation loop
	go engine.Run(ctx)

	// Setup HTTP server
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Health endpoints
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		// Check dependencies
		if err := dbpool.Ping(r.Context()); err != nil {
			http.Error(w, "database not ready", http.StatusServiceUnavailable)
			return
		}
		if err := rdb.Ping(r.Context()).Err(); err != nil {
			http.Error(w, "redis not ready", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`))
	})

	// Prometheus metrics
	r.Handle("/metrics", promhttp.Handler())

	// Start HTTP server
	srv := &http.Server{
		Addr:         ":8090",
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

	// Graceful shutdown
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("HTTP server shutdown failed")
	}

	log.Info().Msg("Alert engine stopped")
}

// AlertEngine orchestrates alert evaluation
type AlertEngine struct {
	cfg          *config.Config
	metricEval   *evaluator.MetricEvaluator
	logEval      *evaluator.LogEvaluator
	businessEval *evaluator.BusinessEvaluator
	dedup        *notifier.Deduplicator
	router       *notifier.Router
}

// Run starts the evaluation loop
func (e *AlertEngine) Run(ctx context.Context) {
	ticker := time.NewTicker(e.cfg.EvalInterval)
	defer ticker.Stop()

	// Run immediately on start
	e.evaluate(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Evaluation loop stopped")
			return
		case <-ticker.C:
			e.evaluate(ctx)
		}
	}
}

// evaluate runs all evaluators and routes alerts
func (e *AlertEngine) evaluate(ctx context.Context) {
	log.Debug().Msg("Starting evaluation cycle")

	var alerts []evaluator.Alert

	// Evaluate metric alerts
	metricAlerts, err := e.metricEval.Evaluate(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Metric evaluation failed")
	} else {
		alerts = append(alerts, metricAlerts...)
	}

	// Evaluate log alerts
	logAlerts, err := e.logEval.Evaluate(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Log evaluation failed")
	} else {
		alerts = append(alerts, logAlerts...)
	}

	// Evaluate business alerts
	businessAlerts, err := e.businessEval.Evaluate(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Business evaluation failed")
	} else {
		alerts = append(alerts, businessAlerts...)
	}

	log.Debug().Int("total_alerts", len(alerts)).Msg("Evaluation complete")

	// Deduplicate and route alerts
	for _, alert := range alerts {
		if e.dedup.ShouldNotify(ctx, alert) {
			if err := e.router.Send(ctx, alert); err != nil {
				log.Error().Err(err).Str("alert", alert.Name).Msg("Failed to send alert")
			} else {
				log.Info().Str("alert", alert.Name).Str("severity", alert.Severity).Msg("Alert sent")
			}
		}
	}
}
