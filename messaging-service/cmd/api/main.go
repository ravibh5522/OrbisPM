package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	minio "github.com/minio/minio-go/v7"
	miniocreds "github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/nats-io/nats.go"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/config"
	"github.com/orbispm/messaging-service/internal/eventbus"
	"github.com/orbispm/messaging-service/internal/handler"
	mw "github.com/orbispm/messaging-service/internal/middleware"
	natspkg "github.com/orbispm/messaging-service/internal/nats"
	"github.com/orbispm/messaging-service/internal/repository"
	"github.com/orbispm/messaging-service/internal/service"
	"github.com/orbispm/messaging-service/internal/websocket"
)

func main() {
	// ─── Logging ──────────────────────────────
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})

	// ─── Config ───────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}
	log.Info().Str("port", cfg.Port).Str("env", cfg.Env).Msg("messaging-service starting")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ─── Database ─────────────────────────────
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse database URL")
	}
	poolCfg.MaxConns = 20
	poolCfg.MinConns = 5
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to ping database")
	}
	log.Info().Msg("database connected")

	// ─── NATS ─────────────────────────────────
	nc, err := nats.Connect(cfg.NatsURL,
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			if err != nil {
				log.Warn().Err(err).Msg("NATS disconnected")
			}
		}),
		nats.ReconnectHandler(func(_ *nats.Conn) {
			log.Info().Msg("NATS reconnected")
		}),
	)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to NATS")
	}
	defer nc.Close()
	log.Info().Str("url", cfg.NatsURL).Msg("NATS connected")

	// ─── NATS Publisher ───────────────────────
	publisher, err := natspkg.NewPublisher(nc)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create NATS publisher")
	}

	// ─── WebSocket Hub ────────────────────────
	hub := websocket.NewChatHub()

	// ─── NATS Consumer ────────────────────────
	consumer, err := natspkg.NewConsumer(nc, hub.HandleEvent)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create NATS consumer")
	}
	go func() {
		if err := consumer.Start(ctx); err != nil {
			log.Error().Err(err).Msg("NATS consumer error")
		}
	}()

	// ─── Repositories ─────────────────────────
	txManager := repository.NewTxManager(pool)
	channelRepo := repository.NewChannelRepository(pool)
	memberRepo := repository.NewChannelMemberRepository(pool)
	messageRepo := repository.NewMessageRepository(pool)
	reactionRepo := repository.NewReactionRepository(pool)
	attachmentRepo := repository.NewAttachmentRepository(pool)
	pinRepo := repository.NewPinRepository(pool)
	bookmarkRepo := repository.NewBookmarkRepository(pool)
	categoryRepo := repository.NewCategoryRepository(pool)

	// ─── Services ─────────────────────────────
	channelSvc := service.NewChannelService(txManager, channelRepo, memberRepo, publisher)

	// ─── Redis ────────────────────────────────
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse redis URL")
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Warn().Err(err).Msg("redis not available — presence disabled")
	} else {
		log.Info().Msg("redis connected for presence")
	}

	// ─── Redis Event Publisher (forwards chat events to backend OrgHub) ──
	redisEventPublisher := eventbus.NewRedisPublisher(rdb)

	// ─── Presence Service ─────────────────────
	presenceSvc := service.NewPresenceService(rdb, 60*time.Second)

	// ─── MinIO ────────────────────────────────
	mc, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  miniocreds.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create MinIO client")
	}
	log.Info().Str("endpoint", cfg.MinIOEndpoint).Msg("MinIO client created")

	// Create a second MinIO client using the public URL for presigning.
	// Presigned URL signatures include the Host header, so we need a client
	// whose endpoint matches what the browser will use.
	// We set Region to avoid a GetBucketLocation call (unreachable from within Docker).
	var presignMC *minio.Client
	if cfg.MinIOPublicURL != "" {
		pubURL, err := url.Parse(cfg.MinIOPublicURL)
		if err == nil && pubURL.Host != "" {
			presignMC, err = minio.New(pubURL.Host, &minio.Options{
				Creds:  miniocreds.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
				Secure: pubURL.Scheme == "https",
				Region: "us-east-1",
			})
			if err != nil {
				log.Warn().Err(err).Msg("failed to create presign MinIO client — falling back to internal")
			} else {
				log.Info().Str("endpoint", pubURL.Host).Msg("MinIO presign client created (public)")
			}
		}
	}

	// ─── Upload Service ───────────────────────
	uploadSvc := service.NewUploadService(mc, presignMC, cfg.MinioBucket, cfg.MaxFileSizeMB, txManager, attachmentRepo)
	if err := uploadSvc.EnsureBucket(ctx); err != nil {
		log.Warn().Err(err).Msg("failed to ensure MinIO bucket — uploads may fail")
	}

	// ─── Message Service (needs uploadSvc as presigner) ──
	messageSvc := service.NewMessageService(
		txManager, messageRepo, memberRepo, channelRepo,
		reactionRepo, attachmentRepo, pinRepo, bookmarkRepo, publisher, cfg.EditWindowMinutes,
		uploadSvc, redisEventPublisher, rdb,
	)

	// ─── Sidebar Service ──────────────────────
	sidebarSvc := service.NewSidebarService(pool, txManager, channelRepo, memberRepo, categoryRepo, rdb)

	// ─── Category Service ─────────────────────
	categorySvc := service.NewCategoryService(txManager, categoryRepo)

	// ─── Sync Service ─────────────────────────
	syncSvc := service.NewSyncService(pool, txManager, channelRepo, memberRepo)
	go syncSvc.Start(ctx, 30*time.Second)

	// ─── Backend Event Handler ────────────────
	backendEventHandler := service.NewBackendEventHandler(rdb, txManager, channelRepo, memberRepo)
	if err := backendEventHandler.Start(ctx); err != nil {
		log.Warn().Err(err).Msg("failed to start backend event handler — falling back to sync polling")
	}

	// ─── Handlers ─────────────────────────────
	restHandler := handler.NewRESTHandler(channelSvc, messageSvc, uploadSvc, presenceSvc, sidebarSvc, categorySvc)
	wsHandler := handler.NewWSHandler(hub, channelSvc, messageSvc, presenceSvc, cfg.AllowedOrigins)

	// ─── Router ───────────────────────────────
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(mw.RequestLogger)
	r.Use(mw.Metrics)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-Org-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ok","service":"messaging"}`)
	})

	// Deep health check — verifies DB, Redis, NATS
	r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		status := "ok"
		code := http.StatusOK
		checks := map[string]string{}

		if err := pool.Ping(ctx); err != nil {
			checks["db"] = err.Error()
			status = "degraded"
			code = http.StatusServiceUnavailable
		} else {
			checks["db"] = "ok"
		}
		if err := rdb.Ping(ctx).Err(); err != nil {
			checks["redis"] = err.Error()
			status = "degraded"
			code = http.StatusServiceUnavailable
		} else {
			checks["redis"] = "ok"
		}
		if !nc.IsConnected() {
			checks["nats"] = "disconnected"
			status = "degraded"
			code = http.StatusServiceUnavailable
		} else {
			checks["nats"] = "ok"
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		resp, _ := json.Marshal(map[string]any{"status": status, "checks": checks})
		w.Write(resp)
	})

	// Prometheus metrics
	r.Handle("/metrics", promhttp.Handler())

	// Build JWKS URL from internal URL
	parsedIssuer, _ := url.Parse(cfg.ZitadelIssuer)
	jwksURL := cfg.ZitadelInternalURL + "/oauth/v2/keys"
	hostHeader := parsedIssuer.Host

	authMiddleware := mw.Auth(jwksURL, cfg.ZitadelIssuer, hostHeader, cfg.ZitadelInternalURL, cfg.ZitadelServiceToken, rdb, cfg.JWKSCacheTTL)

	// REST API routes (with timeout)
	r.Group(func(r chi.Router) {
		r.Use(chimw.Timeout(30 * time.Second))
		r.Use(authMiddleware)
		r.Use(mw.SetOrgFromHeader)
		r.Use(mw.RateLimiter(cfg.RateLimitPerMinute, cfg.RateLimitBurst))

		r.Route("/api/v1/chat", func(r chi.Router) {
			restHandler.Routes(r)
		})
	})

	// WebSocket route (NO timeout — long-lived connections)
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)
		r.Use(mw.SetOrgFromHeader)

		r.Get("/ws/chat", wsHandler.ServeWS)
	})

	// ─── HTTP Server ──────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	// ─── Graceful Shutdown ────────────────────
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Info().Str("addr", srv.Addr).Msg("messaging-service listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	<-done
	log.Info().Msg("shutting down messaging-service...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	cancel() // Cancel NATS consumer
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server shutdown error")
	}
	log.Info().Msg("messaging-service stopped")
}
