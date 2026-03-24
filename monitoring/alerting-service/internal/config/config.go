// Package config handles configuration for the alerting service
package config

import (
	"os"
	"time"
)

// Config holds the alerting service configuration
type Config struct {
	// Environment
	Env      string
	LogLevel string

	// Database
	DatabaseURL string

	// Redis
	RedisURL      string
	RedisPassword string

	// Monitoring endpoints
	PrometheusURL   string
	LokiURL         string
	AlertmanagerURL string

	// Evaluation settings
	EvalInterval  time.Duration
	AlertCooldown time.Duration
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	cfg := &Config{
		Env:             getEnv("ENV", "development"),
		LogLevel:        getEnv("LOG_LEVEL", "info"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://orbispm:changeme@postgres:5432/orbispm?sslmode=disable"),
		RedisURL:        getEnv("REDIS_URL", "redis://redis:6379"),
		RedisPassword:   getEnv("REDIS_PASSWORD", ""),
		PrometheusURL:   getEnv("PROMETHEUS_URL", "http://prometheus:9090"),
		LokiURL:         getEnv("LOKI_URL", "http://loki:3100"),
		AlertmanagerURL: getEnv("ALERTMANAGER_URL", "http://alertmanager:9093"),
	}

	// Parse durations
	evalInterval, err := time.ParseDuration(getEnv("EVAL_INTERVAL", "30s"))
	if err != nil {
		evalInterval = 30 * time.Second
	}
	cfg.EvalInterval = evalInterval

	alertCooldown, err := time.ParseDuration(getEnv("ALERT_COOLDOWN", "15m"))
	if err != nil {
		alertCooldown = 15 * time.Minute
	}
	cfg.AlertCooldown = alertCooldown

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
