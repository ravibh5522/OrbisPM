package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
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

	// Zitadel
	ZitadelDomain       string // e.g. "localhost:8081"
	ZitadelIssuer       string // e.g. "http://localhost:8081"
	ZitadelInternalURL  string // e.g. "http://zitadel:8080"
	ZitadelServiceToken string // PAT for management API
	ZitadelClientID     string // OIDC application client ID
	ZitadelGRPCDisabled bool   // force REST-only mode (set true when gRPC is blocked, e.g. behind Cloudflare)
	ZitadelGitHubIDPID  string // Zitadel IDP config ID for GitHub OAuth (used by startup action)

	// MinIO / S3
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinioBucket    string
	MinIOUseSSL    bool
	MinIOPublicURL string // browser-accessible base URL for uploaded objects

	// Meilisearch
	MeiliURL       string
	MeiliMasterKey string

	// CORS
	FrontendURL    string
	AllowedOrigins []string

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

	// Cache
	CacheEnabled bool
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		Port:                getEnv("PORT", "8080"),
		Env:                 getEnv("ENV", "development"),
		BaseURL:             getEnv("BASE_URL", "http://localhost:8080"),
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://orbispm:orbispm@localhost:5432/orbispm?sslmode=disable"),
		RedisURL:            getEnv("REDIS_URL", "redis://localhost:6380/0"),
		ZitadelDomain:       getEnv("ZITADEL_DOMAIN", "localhost:8081"),
		ZitadelIssuer:       getEnv("ZITADEL_ISSUER", "http://localhost:8081"),
		ZitadelInternalURL:  getEnv("ZITADEL_INTERNAL_URL", "http://zitadel:8080"),
		ZitadelServiceToken: getEnv("ZITADEL_SERVICE_TOKEN", ""),
		ZitadelClientID:     getEnv("ZITADEL_CLIENT_ID", ""),
		ZitadelGRPCDisabled: getEnvBool("ZITADEL_GRPC_DISABLED", false),
		ZitadelGitHubIDPID:  getEnv("ZITADEL_GITHUB_IDP_ID", "371633241645384194"),
		MinIOEndpoint:       getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey:      getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey:      getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioBucket:         getEnv("MINIO_BUCKET", "orbispm"),
		MinIOUseSSL:         getEnvBool("MINIO_USE_SSL", false),
		MinIOPublicURL:      getEnv("MINIO_PUBLIC_URL", "http://localhost:8000/storage/orbispm"),
		MeiliURL:            getEnv("MEILI_URL", "http://localhost:7700"),
		MeiliMasterKey:      getEnv("MEILI_MASTER_KEY", "masterkey-for-dev-only"),
		FrontendURL:         getEnv("FRONTEND_URL", "http://localhost:3000"),
		AllowedOrigins:      parseOrigins(getEnv("ALLOWED_ORIGINS", ""), getEnv("FRONTEND_URL", "http://localhost:3000")),
		SMTPHost:            getEnv("SMTP_HOST", "localhost"),
		SMTPPort:            getEnvInt("SMTP_PORT", 1025),
		SMTPUser:            getEnv("SMTP_USER", ""),
		SMTPPassword:        getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:            getEnv("SMTP_FROM", "noreply@orbispm.local"),
		SMTPEnabled:         getEnvBool("SMTP_ENABLED", true),
		RateLimitPerMinute:  getEnvInt("RATE_LIMIT_PER_MINUTE", 600),
		RateLimitBurst:      getEnvInt("RATE_LIMIT_BURST", 50),
		ReadTimeout:         time.Duration(getEnvInt("READ_TIMEOUT_SECONDS", 15)) * time.Second,
		WriteTimeout:        time.Duration(getEnvInt("WRITE_TIMEOUT_SECONDS", 15)) * time.Second,
		IdleTimeout:         time.Duration(getEnvInt("IDLE_TIMEOUT_SECONDS", 60)) * time.Second,
		StripeSecretKey:     getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET", ""),
		StripeEnabled:       getEnvBool("STRIPE_ENABLED", false),
		CacheEnabled:        getEnvBool("CACHE_ENABLED", true),
	}

	if cfg.Env == "production" && cfg.ZitadelServiceToken == "" {
		return nil, fmt.Errorf("ZITADEL_SERVICE_TOKEN must be set in production")
	}

	return cfg, nil
}

func parseOrigins(origins, frontendURL string) []string {
	defaultOrigins := []string{
		"https://orbispm.live",
		"https://www.orbispm.live",
		"https://app.orbispm.live",
		"https://orbispm.in",
		"https://www.orbispm.in",
		"https://app.orbispm.in",
	}
	result := make(map[string]struct{})
	result[frontendURL] = struct{}{}
	for _, o := range defaultOrigins {
		result[o] = struct{}{}
	}
	if origins != "" {
		for _, o := range splitAndTrim(origins) {
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

func splitAndTrim(s string) []string {
	parts := make([]string, 0)
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
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
