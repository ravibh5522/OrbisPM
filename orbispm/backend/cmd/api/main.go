package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/auth"
	"github.com/orbispm/orbispm/internal/config"
	"github.com/orbispm/orbispm/internal/eventbus"
	"github.com/orbispm/orbispm/internal/handler"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/search"
	"github.com/orbispm/orbispm/internal/service"
	"github.com/orbispm/orbispm/internal/storage"
	"github.com/orbispm/orbispm/internal/websocket"
	"github.com/orbispm/orbispm/internal/worker"
)

func main() {
	// Pretty logging for development
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	log.Info().Str("env", cfg.Env).Str("port", cfg.Port).Msg("starting OrbisPM API")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// --- Database (PostgreSQL) ---
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse database url")
	}
	poolCfg.MaxConns = 20
	poolCfg.MinConns = 2
	poolCfg.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to ping database")
	}
	log.Info().Msg("connected to PostgreSQL")

	// --- Redis ---
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse redis url")
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Warn().Err(err).Msg("failed to ping redis (continuing without cache)")
	} else {
		log.Info().Msg("connected to Redis")
	}

	// --- GoTrue Auth Client ---
	gotrueClient := auth.NewGoTrueClient(cfg.GoTrueURL)
	log.Info().Str("url", cfg.GoTrueURL).Msg("GoTrue client configured")

	// --- MinIO Storage Client (best-effort) ---
	var storageClient *storage.Client
	sc, err := storage.NewClient(cfg.MinIOEndpoint, cfg.MinIOAccessKey, cfg.MinIOSecretKey, cfg.MinioBucket, cfg.MinIOUseSSL)
	if err != nil {
		log.Warn().Err(err).Msg("failed to init MinIO storage (continuing without file storage)")
	} else {
		storageClient = sc
		log.Info().Str("endpoint", cfg.MinIOEndpoint).Msg("connected to MinIO")
	}

	// --- Meilisearch Client (best-effort) ---
	var searchClient *search.Client
	meili, err := search.NewClient(cfg.MeiliURL, cfg.MeiliMasterKey)
	if err != nil {
		log.Warn().Err(err).Msg("failed to init Meilisearch (continuing without search)")
	} else {
		searchClient = meili
		log.Info().Str("url", cfg.MeiliURL).Msg("connected to Meilisearch")
	}

	// --- Event Bus (Redis Pub/Sub) ---
	_ = eventbus.NewRedisPublisher(rdb)
	subscriber := eventbus.NewRedisSubscriber(rdb)

	// --- WebSocket Hub ---
	hub := websocket.NewHub(subscriber)
	go func() {
		if err := hub.Start(ctx); err != nil {
			log.Error().Err(err).Msg("websocket hub error")
		}
	}()
	log.Info().Msg("WebSocket hub started")

	// --- Background Worker (Asynq) ---
	workerSrv := worker.NewServer(redisOpts.Addr)
	defer workerSrv.Stop()
	log.Info().Msg("Asynq worker configured")

	// --- Transaction Manager ---
	txm := repository.NewTxManager(pool)

	// --- Repositories (existing) ---
	orgRepo := repository.NewOrgRepo(pool)
	orgMemberRepo := repository.NewOrgMemberRepo(pool)
	teamRepo := repository.NewTeamRepo(pool)
	teamMemberRepo := repository.NewTeamMemberRepo(pool)
	projectRepo := repository.NewProjectRepo(pool)
	projectMemberRepo := repository.NewProjectMemberRepo(pool)
	taskRepo := repository.NewTaskRepo(pool)
	checklistRepo := repository.NewChecklistRepo(pool)
	ruleRepo := repository.NewTaskRuleRepo(pool)
	commentRepo := repository.NewCommentRepo(pool)
	activityRepo := repository.NewActivityRepo(pool)
	notifRepo := repository.NewNotificationRepo(pool)

	// --- Repositories (new) ---
	attachmentRepo := repository.NewAttachmentRepo(pool)
	templateRepo := repository.NewTemplateRepo(pool)
	depRepo := repository.NewTaskDependencyRepo(pool)
	watcherRepo := repository.NewTaskWatcherRepo(pool)
	webhookRepo := repository.NewWebhookRepo(pool)
	apikeyRepo := repository.NewAPIKeyRepo(pool)
	importJobRepo := repository.NewImportJobRepo(pool)
	notifPrefRepo := repository.NewNotificationPrefRepo(pool)
	planRepo := repository.NewBillingPlanRepo(pool)
	subRepo := repository.NewOrgSubscriptionRepo(pool)
	customRoleRepo := repository.NewCustomRoleRepo(pool)

	// --- Services (existing) ---
	orgSvc := service.NewOrgService(orgRepo, orgMemberRepo, txm)
	teamSvc := service.NewTeamService(teamRepo, teamMemberRepo, txm)
	projectSvc := service.NewProjectService(projectRepo, projectMemberRepo, txm)
	taskSvc := service.NewTaskService(taskRepo, checklistRepo, ruleRepo, txm)
	checklistSvc := service.NewChecklistService(checklistRepo, txm)
	commentSvc := service.NewCommentService(commentRepo, txm)
	ruleSvc := service.NewRuleService(ruleRepo, txm)
	activitySvc := service.NewActivityService(activityRepo, txm)
	notifSvc := service.NewNotificationService(notifRepo, txm)

	// --- Services (new) ---
	attachmentSvc := service.NewAttachmentService(attachmentRepo, storageClient, txm)
	templateSvc := service.NewTemplateService(templateRepo, txm)
	depSvc := service.NewDependencyService(depRepo, taskRepo, txm)
	watcherSvc := service.NewWatcherService(watcherRepo, txm)
	webhookSvc := service.NewWebhookService(webhookRepo, txm)
	apikeySvc := service.NewAPIKeyService(apikeyRepo, txm)
	importSvc := service.NewImportService(importJobRepo, txm)
	billingSvc := service.NewBillingService(planRepo, subRepo, txm)
	customRoleSvc := service.NewCustomRoleService(customRoleRepo, txm)
	notifPrefSvc := service.NewNotificationPrefService(notifPrefRepo, txm)

	// --- Handlers (existing) ---
	orgHandler := handler.NewOrgHandler(orgSvc)
	teamHandler := handler.NewTeamHandler(teamSvc)
	projectHandler := handler.NewProjectHandler(projectSvc)
	taskHandler := handler.NewTaskHandler(taskSvc)
	checklistHandler := handler.NewChecklistHandler(checklistSvc)
	commentHandler := handler.NewCommentHandler(commentSvc)
	ruleHandler := handler.NewRuleHandler(ruleSvc)
	activityHandler := handler.NewActivityHandler(activitySvc)
	notifHandler := handler.NewNotificationHandler(notifSvc)
	healthHandler := handler.NewHealthHandler(pool, rdb)

	// --- Handlers (new) ---
	authHandler := handler.NewAuthHandler(gotrueClient)
	attachmentHandler := handler.NewAttachmentHandler(attachmentSvc)
	templateHandler := handler.NewTemplateHandler(templateSvc)
	depHandler := handler.NewDependencyHandler(depSvc)
	watcherHandler := handler.NewWatcherHandler(watcherSvc)
	webhookHandler := handler.NewWebhookHandler(webhookSvc)
	apikeyHandler := handler.NewAPIKeyHandler(apikeySvc)
	importHandler := handler.NewImportHandler(importSvc)
	billingHandler := handler.NewBillingHandler(billingSvc)
	customRoleHandler := handler.NewCustomRoleHandler(customRoleSvc)
	notifPrefHandler := handler.NewNotifPrefHandler(notifPrefSvc)
	eventsHandler := handler.NewEventsHandler(hub)

	// Search handler (optional — only if Meilisearch is available)
	var searchHandler *handler.SearchHandler
	if searchClient != nil {
		searchSvc := service.NewSearchService(searchClient)
		searchHandler = handler.NewSearchHandler(searchSvc)
	}

	// --- Rate Limiter ---
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimitPerMinute, cfg.RateLimitBurst)

	// --- Router ---
	r := chi.NewRouter()

	// Global middleware
	corsHandler := middleware.NewCORSHandler(cfg.FrontendURL)
	r.Use(corsHandler.Handler)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recovery)
	r.Use(rateLimiter.Handler)

	// Health endpoints (no auth)
	r.Mount("/health", healthHandler.Routes())

	// Auth endpoints (no auth needed — these are the GoTrue proxy)
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Mount("/", authHandler.Routes())
	})

	// API v1 group — requires auth
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))

		// Orgs
		r.Route("/orgs", func(r chi.Router) {
			r.Post("/", orgHandler.Create)
			r.Get("/", orgHandler.List)

			r.Route("/{orgId}", func(r chi.Router) {
				r.Use(middleware.RLSTenant())

				r.Get("/", orgHandler.Get)
				r.Patch("/", orgHandler.Update)
				r.Delete("/", orgHandler.Delete)

				// Org members
				r.Get("/members", orgHandler.ListMembers)
				r.Post("/members/invite", orgHandler.InviteMember)
				r.Patch("/members/{userId}", orgHandler.UpdateMemberRole)
				r.Delete("/members/{userId}", orgHandler.RemoveMember)

				// Teams
				r.Mount("/teams", teamHandler.Routes())

				// Activity
				r.Mount("/activity", activityHandler.Routes())

				// Templates
				r.Mount("/templates", templateHandler.Routes())

				// Webhooks
				r.Mount("/webhooks", webhookHandler.Routes())

				// API Keys
				r.Mount("/api-keys", apikeyHandler.Routes())

				// Custom Roles
				r.Mount("/roles", customRoleHandler.Routes())

				// Billing
				r.Mount("/billing", billingHandler.Routes())

				// Notification Preferences
				r.Mount("/notification-preferences", notifPrefHandler.Routes())

				// Search
				if searchHandler != nil {
					r.Mount("/search", searchHandler.Routes())
				}

				// Events (SSE)
				r.Mount("/events", eventsHandler.Routes())

				// Projects
				r.Route("/projects", func(r chi.Router) {
					r.Post("/", projectHandler.Create)
					r.Get("/", projectHandler.List)

					r.Route("/{projectId}", func(r chi.Router) {
						r.Get("/", projectHandler.Get)
						r.Patch("/", projectHandler.Update)
						r.Delete("/", projectHandler.Delete)
						r.Get("/members", projectHandler.ListMembers)
						r.Post("/members", projectHandler.AddMember)
						r.Delete("/members/{userId}", projectHandler.RemoveMember)

						// Imports
						r.Mount("/imports", importHandler.Routes())

						// Tasks
						r.Route("/tasks", func(r chi.Router) {
							r.Post("/", taskHandler.Create)
							r.Get("/", taskHandler.List)

							r.Route("/{taskId}", func(r chi.Router) {
								r.Get("/", taskHandler.Get)
								r.Patch("/", taskHandler.Update)
								r.Delete("/", taskHandler.Delete)
								r.Get("/tree", taskHandler.GetTree)
								r.Post("/submit-review", taskHandler.SubmitForReview)
								r.Post("/complete", taskHandler.MarkComplete)

								// Task sub-resources
								r.Mount("/checklists", checklistHandler.Routes())
								r.Mount("/comments", commentHandler.Routes())
								r.Mount("/rules", ruleHandler.Routes())
								r.Mount("/attachments", attachmentHandler.Routes())
								r.Mount("/dependencies", depHandler.Routes())
								r.Mount("/watchers", watcherHandler.Routes())
							})
						})
					})
				})
			})
		})

		// Notifications (user-scoped, no org context needed)
		r.Mount("/notifications", notifHandler.Routes())
	})

	// Suppress unused variable warnings for worker
	_ = workerSrv

	// --- HTTP Server ---
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Info().Str("addr", srv.Addr).Msg("HTTP server listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	<-quit
	log.Info().Msg("shutting down server...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("server forced to shutdown")
	}

	log.Info().Msg("server stopped")
}
