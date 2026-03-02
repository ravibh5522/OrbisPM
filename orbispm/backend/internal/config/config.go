package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	// Server
	Port    string
	Env     string // development, staging, production
	BaseURL string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// JWT (shared with GoTrue)
	JWTSecret string

	// GoTrue (Supabase Auth)
	GoTrueURL string

	// MinIO / S3
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinioBucket    string
	MinIOUseSSL    bool

	// Meilisearch
	MeiliURL       string
	MeiliMasterKey string

	// CORS
	FrontendURL string

	// SMTP / Email
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	SMTPEnabled  bool

	// Rate Limiting
	RateLimitPerMinute int
	RateLimitBurst     int

	// Server Timeouts
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration

	// Stripe
	StripeSecretKey     string
	StripeWebhookSecret string
	StripeEnabled       bool
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		Env:                getEnv("ENV", "development"),
		BaseURL:            getEnv("BASE_URL", "http://localhost:8080"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://orbispm:orbispm@localhost:5432/orbispm?sslmode=disable"),
		RedisURL:           getEnv("REDIS_URL", "redis://localhost:6380/0"),
		JWTSecret:          getEnv("JWT_SECRET", "super-secret-jwt-token-with-at-least-32-characters-long"),
		GoTrueURL:          getEnv("GOTRUE_URL", "http://localhost:9999"),
		MinIOEndpoint:      getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey:     getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey:     getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioBucket:        getEnv("MINIO_BUCKET", "orbispm"),
		MinIOUseSSL:        getEnvBool("MINIO_USE_SSL", false),
		MeiliURL:           getEnv("MEILI_URL", "http://localhost:7700"),
		MeiliMasterKey:     getEnv("MEILI_MASTER_KEY", "masterkey-for-dev-only"),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:3000"),
		SMTPHost:           getEnv("SMTP_HOST", "localhost"),
		SMTPPort:           getEnvInt("SMTP_PORT", 1025),
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPassword:       getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:           getEnv("SMTP_FROM", "noreply@orbispm.local"),
		SMTPEnabled:        getEnvBool("SMTP_ENABLED", true),
		RateLimitPerMinute: getEnvInt("RATE_LIMIT_PER_MINUTE", 100),
		RateLimitBurst:     getEnvInt("RATE_LIMIT_BURST", 20),
		ReadTimeout:        time.Duration(getEnvInt("READ_TIMEOUT_SECONDS", 15)) * time.Second,
		WriteTimeout:       time.Duration(getEnvInt("WRITE_TIMEOUT_SECONDS", 15)) * time.Second,
		IdleTimeout:        time.Duration(getEnvInt("IDLE_TIMEOUT_SECONDS", 60)) * time.Second,
		StripeSecretKey:    getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET", ""),
		StripeEnabled:      getEnvBool("STRIPE_ENABLED", false),
	}

	if cfg.Env == "production" && cfg.JWTSecret == "super-secret-jwt-token-with-at-least-32-characters-long" {
		return nil, fmt.Errorf("JWT_SECRET must be set in production")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}
