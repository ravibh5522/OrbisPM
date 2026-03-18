package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all configuration for the messaging service.
type Config struct {
	// Server
	Port string
	Env  string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// NATS
	NatsURL string

	// Zitadel / Auth
	ZitadelIssuer      string
	ZitadelInternalURL string
	ZitadelClientID    string

	// MinIO / S3
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinioBucket    string
	MinIOUseSSL    bool

	// CORS
	FrontendURL    string
	AllowedOrigins []string

	// Message settings
	EditWindowMinutes int
	MaxFileSizeMB     int

	// Rate Limiting
	RateLimitPerMinute int
	RateLimitBurst     int

	// Server Timeouts
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		Port:               getEnv("PORT", "8082"),
		Env:                getEnv("ENV", "development"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://orbispm:orbispm@localhost:5432/orbispm?sslmode=disable"),
		RedisURL:           getEnv("REDIS_URL", "redis://localhost:6380/0"),
		NatsURL:            getEnv("NATS_URL", "nats://localhost:4222"),
		ZitadelIssuer:      getEnv("ZITADEL_ISSUER", "http://localhost:8081"),
		ZitadelInternalURL: getEnv("ZITADEL_INTERNAL_URL", "http://zitadel:8080"),
		ZitadelClientID:    getEnv("ZITADEL_CLIENT_ID", ""),
		MinIOEndpoint:      getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey:     getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey:     getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioBucket:        getEnv("MINIO_BUCKET", "orbispm-chat"),
		MinIOUseSSL:        getEnvBool("MINIO_USE_SSL", false),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:3000"),
		AllowedOrigins:     parseOrigins(getEnv("ALLOWED_ORIGINS", ""), getEnv("FRONTEND_URL", "http://localhost:3000")),
		EditWindowMinutes:  getEnvInt("EDIT_WINDOW_MINUTES", 15),
		MaxFileSizeMB:      getEnvInt("MAX_FILE_SIZE_MB", 25),
		RateLimitPerMinute: getEnvInt("RATE_LIMIT_PER_MINUTE", 300),
		RateLimitBurst:     getEnvInt("RATE_LIMIT_BURST", 30),
		ReadTimeout:        time.Duration(getEnvInt("READ_TIMEOUT_SECONDS", 15)) * time.Second,
		WriteTimeout:       time.Duration(getEnvInt("WRITE_TIMEOUT_SECONDS", 15)) * time.Second,
		IdleTimeout:        time.Duration(getEnvInt("IDLE_TIMEOUT_SECONDS", 60)) * time.Second,
	}

	if cfg.Env == "production" && cfg.NatsURL == "" {
		return nil, fmt.Errorf("NATS_URL must be set in production")
	}

	return cfg, nil
}

func parseOrigins(origins, frontendURL string) []string {
	result := make(map[string]struct{})
	result[frontendURL] = struct{}{}
	if origins != "" {
		for _, o := range strings.Split(origins, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				result[o] = struct{}{}
			}
		}
	}
	out := make([]string, 0, len(result))
	for o := range result {
		out = append(out, o)
	}
	return out
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
