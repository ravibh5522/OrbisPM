// Package config handles configuration for the super admin service
package config

import (
	"os"
	"strings"
)

// Config holds the super admin service configuration
type Config struct {
	// Server
	Port     string
	Env      string
	LogLevel string

	// Database
	DatabaseURL   string
	ClickHouseURL string
	ClickHouseDB  string
	RedisURL      string
	RedisPassword string

	// Monitoring endpoints
	PrometheusURL   string
	LokiURL         string
	AlertmanagerURL string
	GrafanaURL      string

	// Auth
	ZitadelDomain string
	ZitadelIssuer string

	// Super admin users
	SuperAdminEmails []string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	cfg := &Config{
		Port:            getEnv("PORT", "8091"),
		Env:             getEnv("ENV", "development"),
		LogLevel:        getEnv("LOG_LEVEL", "info"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://orbispm:changeme@postgres:5432/orbispm?sslmode=disable"),
		ClickHouseURL:   getEnv("CLICKHOUSE_URL", "http://clickhouse:8123"),
		ClickHouseDB:    getEnv("CLICKHOUSE_DB", "monitoring"),
		RedisURL:        getEnv("REDIS_URL", "redis://redis:6379"),
		RedisPassword:   getEnv("REDIS_PASSWORD", ""),
		PrometheusURL:   getEnv("PROMETHEUS_URL", "http://prometheus:9090"),
		LokiURL:         getEnv("LOKI_URL", "http://loki:3100"),
		AlertmanagerURL: getEnv("ALERTMANAGER_URL", "http://alertmanager:9093"),
		GrafanaURL:      getEnv("GRAFANA_URL", "http://grafana:3000"),
		ZitadelDomain:   getEnv("ZITADEL_DOMAIN", "localhost:8080"),
		ZitadelIssuer:   getEnv("ZITADEL_ISSUER", "http://localhost:8080"),
	}

	// Parse super admin emails
	emails := getEnv("SUPER_ADMIN_EMAILS", "admin@orbispm.local")
	cfg.SuperAdminEmails = strings.Split(emails, ",")
	for i, email := range cfg.SuperAdminEmails {
		cfg.SuperAdminEmails[i] = strings.TrimSpace(email)
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// IsSuperAdmin checks if the given email is a super admin
func (c *Config) IsSuperAdmin(email string) bool {
	for _, adminEmail := range c.SuperAdminEmails {
		if strings.EqualFold(adminEmail, email) {
			return true
		}
	}
	return false
}
