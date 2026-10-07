// @title OrbisPM API
// @version 1.0
// @description OrbisPM — AI-native project management platform API.
// @termsOfService https://orbisom.live/terms
//
// @contact.name OrbisPM Support
// @contact.url https://orbisom.live/support
// @contact.email support@orbispm.in
//
// @license.name MIT
// @license.url https://opensource.org/licenses/MIT
//
// @host localhost:8080
// @BasePath /api/v1
//
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Enter your bearer token in the format: Bearer {token}
//
// @tag.name Auth
// @tag.description Authentication (Zitadel proxy)
// @tag.name Organizations
// @tag.description Organization management
// @tag.name Teams
// @tag.description Team management within organizations
// @tag.name Projects
// @tag.description Project management within organizations
// @tag.name Tasks
// @tag.description Task management within projects
// @tag.name Checklists
// @tag.description Checklist items within tasks
// @tag.name Comments
// @tag.description Comments on tasks
// @tag.name Rules
// @tag.description Task completion rules
// @tag.name Dependencies
// @tag.description Task dependencies
// @tag.name Watchers
// @tag.description Task watchers
// @tag.name Attachments
// @tag.description File attachments on tasks
// @tag.name Templates
// @tag.description Task templates
// @tag.name Webhooks
// @tag.description Webhook configurations
// @tag.name APIKeys
// @tag.description API key management
// @tag.name CustomRoles
// @tag.description Custom role management
// @tag.name Billing
// @tag.description Billing plans and subscriptions
// @tag.name NotificationPreferences
// @tag.description Notification preference management
// @tag.name Imports
// @tag.description CSV/XLSX import jobs
// @tag.name Search
// @tag.description Full-text search
// @tag.name Events
// @tag.description Real-time SSE events
// @tag.name Activity
// @tag.description Activity audit log
// @tag.name Notifications
// @tag.description User notifications
// @tag.name Health
// @tag.description Health checks
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
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	httpSwagger "github.com/swaggo/http-swagger/v2"

	_ "github.com/orbispm/orbispm/docs"

	"github.com/orbispm/orbispm/internal/affine"
	"github.com/orbispm/orbispm/internal/auth"
	"github.com/orbispm/orbispm/internal/cache"
	"github.com/orbispm/orbispm/internal/config"
	"github.com/orbispm/orbispm/internal/email"
	"github.com/orbispm/orbispm/internal/eventbus"
	"github.com/orbispm/orbispm/internal/handler"
	appMetrics "github.com/orbispm/orbispm/internal/metrics"
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
	// Keep MaxConns at or below PgBouncer's MAX_DB_CONNECTIONS (55) and within
	// RDS max_connections budget (79 total; ~20 reserved for Zitadel + DBA tools).
	poolCfg.MaxConns = 25
	// Keep 5 warm connections to pgbouncer so the first requests after idle periods
	// don't pay the pgbouncer→RDS SSL handshake cost (~100ms).
	poolCfg.MinConns = 5
	// Recycle connections every 20 min to avoid stale SSL sessions and RDS failover.
	poolCfg.MaxConnLifetime = 20 * time.Minute
	// Return idle connections to the pool quickly so pgbouncer can reuse the slot.
	poolCfg.MaxConnIdleTime = 5 * time.Minute
	// Background health-check period — 30s is sufficient; default is 60s.
	poolCfg.HealthCheckPeriod = 30 * time.Second
	// AfterConnect: set session-level timeouts to prevent runaway queries from
	// holding connections and causing cascading pool exhaustion.
	// RuntimeParams cannot be used here because pgbouncer blocks unknown startup params.
	poolCfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET statement_timeout = '30s'; SET idle_in_transaction_session_timeout = '10s'")
		return err
	}

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

	// --- Cache Manager (Redis-backed task cache) ---
	var cacheManager *cache.Manager
	if cfg.CacheEnabled {
		cacheManager = cache.NewManager(rdb)
		log.Info().Msg("Redis cache manager enabled")
	}

	// --- Zitadel Auth Client (gRPC + OIDC) ---
	zitadelClient, err := auth.NewZitadelClient(ctx, cfg.ZitadelDomain, cfg.ZitadelIssuer, cfg.ZitadelInternalURL, cfg.ZitadelServiceToken, cfg.ZitadelClientID, cfg.ZitadelGRPCDisabled)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create Zitadel client")
	}
	log.Info().Str("issuer", cfg.ZitadelIssuer).Msg("Zitadel gRPC client connected")

	// Ensure the GitHub-name-mapping action exists in Zitadel so that new users who
	// sign up via GitHub SSO have their first/last name populated automatically.
	// GitHub OAuth does not return given_name/family_name, so without this action
	// Zitadel shows "First name in profile is empty" when auto-creating the account.
	if cfg.ZitadelGitHubIDPID != "" {
		if actionErr := zitadelClient.EnsureGitHubNameAction(ctx, cfg.ZitadelGitHubIDPID); actionErr != nil {
			log.Warn().Err(actionErr).Msg("failed to ensure GitHub name action in Zitadel (GitHub SSO name mapping may not work)")
		}
	}

	// Disable the MFA-init prompt in the org login policy so that SSO users
	// (Google, GitHub) are not redirected to a "2-Factor Setup" screen after
	// authenticating via their IDP. Setting mfaInitSkipLifetime=0s deactivates
	// the prompt entirely per Zitadel docs.
	if policyErr := zitadelClient.EnsureLoginPolicy(ctx); policyErr != nil {
		log.Warn().Err(policyErr).Msg("failed to configure Zitadel org login policy (MFA prompt may appear for SSO users)")
	}

	// --- MinIO Storage Client (best-effort) ---
	var storageClient *storage.Client
	sc, err := storage.NewClient(cfg.MinIOEndpoint, cfg.MinIOAccessKey, cfg.MinIOSecretKey, cfg.MinioBucket, cfg.MinIOPublicURL, cfg.MinIOUseSSL)
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
	publisher := eventbus.NewRedisPublisher(rdb)
	subscriber := eventbus.NewRedisSubscriber(rdb)

	// --- Org WebSocket Hub (unified: replaces SSE + per-project WS) ---
	orgHub := websocket.NewOrgHub(subscriber)
	go func() {
		if err := orgHub.Start(ctx); err != nil {
			log.Error().Err(err).Msg("org websocket hub error")
		}
	}()
	log.Info().Msg("Org WebSocket hub started")
	// --- Background Worker (Asynq) ---
	workerSrv := worker.NewServer(asynq.RedisClientOpt{
		Addr:     redisOpts.Addr,
		Password: redisOpts.Password,
		Username: redisOpts.Username,
		DB:       redisOpts.DB,
	})
	defer workerSrv.Stop()
	log.Info().Msg("Asynq worker configured")

	// --- Chat Mention Handler (subscribes to messaging-service mention events) ---
	mentionSubscriber := eventbus.NewRedisSubscriber(rdb)
	chatMentionHandler := service.NewChatMentionHandler(workerSrv.Client(), mentionSubscriber)
	go func() {
		if err := chatMentionHandler.Start(ctx); err != nil {
			log.Error().Err(err).Msg("chat mention handler error")
		}
	}()
	log.Info().Msg("chat mention handler started")

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
	stickyNoteRepo := repository.NewStickyNoteRepo(pool)
	projectCanvasRepo := repository.NewProjectCanvasRepo(pool)
	affineRepo := repository.NewAffineRepo(pool)

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

	// --- Repositories (RBAC / Review) ---
	permRepo := repository.NewPermissionRepo(pool)
	roleRepo := repository.NewRoleRepo(pool)
	projectTeamRepo := repository.NewProjectTeamRepo(pool)
	changeReqRepo := repository.NewChangeRequestRepo(pool)

	// --- Repositories (Announcements) ---
	announcementRepo := repository.NewAnnouncementRepo(pool)

	// --- Repositories (Analytics) ---
	analyticsRepo := repository.NewAnalyticsRepo(pool)

	// --- Repositories (Theme) ---
	orgThemeRepo := repository.NewOrgThemeRepo(pool)

	// --- Services (existing) ---
	orgSvc := service.NewOrgService(orgRepo, orgMemberRepo, txm)
	teamSvc := service.NewTeamService(teamRepo, teamMemberRepo, txm, publisher)
	projectSvc := service.NewProjectService(projectRepo, projectMemberRepo, txm, workerSrv, publisher)
	taskSvc := service.NewTaskService(taskRepo, checklistRepo, ruleRepo, txm, workerSrv, publisher)
	checklistSvc := service.NewChecklistService(checklistRepo, txm, publisher)
	commentSvc := service.NewCommentService(commentRepo, orgMemberRepo, txm, workerSrv, publisher)
	ruleSvc := service.NewRuleService(ruleRepo, txm)
	activitySvc := service.NewActivityService(activityRepo, txm)
	notifSvc := service.NewNotificationService(notifRepo, txm)
	stickyNoteSvc := service.NewStickyNoteService(stickyNoteRepo, txm)
	projectCanvasSvc := service.NewProjectCanvasService(projectCanvasRepo, txm, publisher)
	affineClient := affine.NewClient(cfg.AffineInternalURL, cfg.AffineAdminEmail, cfg.AffineAdminPassword)
	affineSvc := service.NewAffineService(affineRepo, affineClient, cfg.AffinePublicURL)

	// --- Services (new) ---
	attachmentSvc := service.NewAttachmentService(attachmentRepo, storageClient, txm)
	templateSvc := service.NewTemplateService(templateRepo, txm)
	depSvc := service.NewDependencyService(depRepo, taskRepo, txm, publisher)
	watcherSvc := service.NewWatcherService(watcherRepo, txm)
	webhookSvc := service.NewWebhookService(webhookRepo, txm)
	apikeySvc := service.NewAPIKeyService(apikeyRepo, txm)
	importSvc := service.NewImportService(importJobRepo, taskRepo, orgMemberRepo, txm, workerSrv)
	billingSvc := service.NewBillingService(planRepo, subRepo, txm)
	dashboardSvc := service.NewDashboardService(taskRepo, projectRepo, projectMemberRepo, orgMemberRepo, txm)
	dashboardSvc.SetRedis(rdb)
	customRoleSvc := service.NewCustomRoleService(customRoleRepo, txm)
	notifPrefSvc := service.NewNotificationPrefService(notifPrefRepo, txm)

	// --- Services (Announcements) ---
	announcementSvc := service.NewAnnouncementService(announcementRepo, orgMemberRepo, projectMemberRepo, txm, workerSrv, publisher)

	// --- Services (Analytics) ---
	analyticsSvc := service.NewAnalyticsService(analyticsRepo, taskRepo, projectRepo, orgMemberRepo, txm, workerSrv)

	// --- Services (RBAC / Review) ---
	permSvc := service.NewPermissionService(permRepo, roleRepo, orgRepo, txm)
	permSvc.SetMemberChecker(repository.NewRoleMemberChecker(pool))
	permSvc.SetActivityRepo(activityRepo)
	permSvc.SetPublisher(publisher)
	permResolver := service.NewPermissionResolver(orgMemberRepo, teamMemberRepo, projectMemberRepo, projectTeamRepo, roleRepo, orgRepo)
	projectTeamSvc := service.NewProjectTeamService(projectTeamRepo, projectRepo, teamRepo, projectMemberRepo, teamMemberRepo, taskRepo, txm, workerSrv, publisher)
	changeReqSvc := service.NewTaskChangeRequestService(changeReqRepo, taskRepo, projectRepo, txm, workerSrv, publisher)

	// Inject review deps into task service + project service
	taskSvc.SetReviewDeps(projectRepo, changeReqRepo, permResolver)
	taskSvc.SetCache(cacheManager)
	taskSvc.SetMembershipRepo(projectMemberRepo)
	projectSvc.SetProjectTeamRepo(projectTeamRepo)
	projectSvc.SetTaskRepo(taskRepo)
	projectSvc.SetTeamMemberRepo(teamMemberRepo)
	projectSvc.SetRoleRepo(roleRepo)
	teamSvc.SetProjectDeps(projectTeamRepo, projectMemberRepo, taskRepo)
	teamSvc.SetRoleRepo(roleRepo)
	orgSvc.SetRoleRepo(roleRepo)

	// Inject cache invalidator and publisher into services for permission cache management
	if cacheManager != nil {
		orgSvc.SetCache(cacheManager)
		teamSvc.SetCache(cacheManager)
		projectSvc.SetCache(cacheManager)
		permSvc.SetCache(cacheManager)
	}
	orgSvc.SetPublisher(publisher)

	// --- Handlers (existing) ---
	orgHandler := handler.NewOrgHandler(orgSvc, zitadelClient)
	teamHandler := handler.NewTeamHandler(teamSvc, dashboardSvc)
	projectHandler := handler.NewProjectHandler(projectSvc, dashboardSvc)
	taskHandler := handler.NewTaskHandler(taskSvc)
	checklistHandler := handler.NewChecklistHandler(checklistSvc)
	commentHandler := handler.NewCommentHandler(commentSvc)
	ruleHandler := handler.NewRuleHandler(ruleSvc)
	activityHandler := handler.NewActivityHandler(activitySvc)
	notifHandler := handler.NewNotificationHandler(notifSvc)
	projectCanvasHandler := handler.NewProjectCanvasHandler(projectCanvasSvc)
	affineHandler := handler.NewAffineHandler(affineSvc)
	stickyNoteHandler := handler.NewStickyNoteHandler(stickyNoteSvc)
	healthHandler := handler.NewHealthHandler(pool, rdb)

	// Inject permission resolver into handlers
	permResolver.SetPermRepo(permRepo)
	permResolver.SetCache(cacheManager)
	projectHandler.SetPermResolver(permResolver)
	teamHandler.SetPermResolver(permResolver)

	// --- Email service config (used by auth handler and worker) ---
	emailServiceURL := os.Getenv("EMAIL_SERVICE_URL")
	if emailServiceURL == "" {
		emailServiceURL = "http://email-service:8050"
	}
	emailServiceAPIKey := os.Getenv("EMAIL_SERVICE_API_KEY")
	if emailServiceAPIKey == "" {
		emailServiceAPIKey = "email-service-dev-key"
	}

	// --- Handlers (new) ---
	authHandler := handler.NewAuthHandler(zitadelClient, pool, emailServiceURL, emailServiceAPIKey, cfg.FrontendURL)
	// Backfill public.users cache from Zitadel so member/project queries show names/emails
	go authHandler.BackfillUserProfiles(ctx)

	attachmentHandler := handler.NewAttachmentHandler(attachmentSvc)

	// Upload handler (avatar, logos, etc.) — public URL for MinIO objects
	var uploadHandler *handler.UploadHandler
	if storageClient != nil {
		uploadHandler = handler.NewUploadHandler(storageClient, cfg.MinIOPublicURL)
	}

	templateHandler := handler.NewTemplateHandler(templateSvc)
	depHandler := handler.NewDependencyHandler(depSvc)
	watcherHandler := handler.NewWatcherHandler(watcherSvc)
	webhookHandler := handler.NewWebhookHandler(webhookSvc)
	apikeyHandler := handler.NewAPIKeyHandler(apikeySvc)
	importHandler := handler.NewImportHandler(importSvc)
	billingHandler := handler.NewBillingHandler(billingSvc, cfg.StripeSecretKey, cfg.StripeWebhookSecret, cfg.FrontendURL, cfg.StripeEnabled)
	dashboardHandler := handler.NewDashboardHandler(dashboardSvc, taskSvc)
	customRoleHandler := handler.NewCustomRoleHandler(customRoleSvc)
	notifPrefHandler := handler.NewNotifPrefHandler(notifPrefSvc)
	presenceHandler := handler.NewPresenceHandler(rdb, publisher)

	// --- Contact (public) ---
	contactRepo := repository.NewContactRepo(pool)
	contactHandler := handler.NewContactHandler(contactRepo)

	// --- Handlers (Announcements) ---
	announcementHandler := handler.NewAnnouncementHandler(announcementSvc)

	// --- Handlers (Analytics) ---
	analyticsHandler := handler.NewAnalyticsHandler(analyticsSvc)

	// --- Handlers (Theme) ---
	themeHandler := handler.NewThemeHandler(orgThemeRepo)

	// --- Handlers (Email Templates) ---
	emailTemplateHandler := handler.NewEmailTemplateHandler()

	// --- Handlers (RBAC / Review) ---
	permHandler := handler.NewPermissionHandler(permSvc)
	permHandler.SetPermissionResolver(permResolver)
	projectTeamHandler := handler.NewProjectTeamHandler(projectTeamSvc)
	changeReqHandler := handler.NewChangeRequestHandler(changeReqSvc)

	// --- Handler (WebSocket — real-time project collaboration) ---
	wsHandler := handler.NewWSHandler(orgHub, taskSvc, commentSvc, checklistSvc, depSvc, watcherSvc, changeReqSvc, permResolver)

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
	corsHandler := middleware.NewCORSHandler(cfg.AllowedOrigins)
	r.Use(corsHandler.Handler)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recovery)
	r.Use(middleware.Compress)
	r.Use(rateLimiter.Handler)
	r.Use(middleware.Metrics)
	r.Use(middleware.CacheControl)

	// Prometheus metrics — strip Accept-Encoding so Compress middleware skips gzip
	r.Handle("/metrics", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Header.Del("Accept-Encoding")
		promhttp.Handler().ServeHTTP(w, r)
	}))

	// Frontend telemetry (no auth — fire-and-forget from browser)
	telemetryHandler := handler.NewTelemetryHandler()
	r.Route("/api/v1/telemetry", func(r chi.Router) {
		r.Mount("/", telemetryHandler.Routes())
	})

	// Health endpoints (no auth)
	r.Mount("/health", healthHandler.Routes())

	// Swagger UI (no auth)
	r.Get("/swagger/*", httpSwagger.Handler(
		httpSwagger.URL("/swagger/doc.json"),
	))

	// Auth endpoints (no auth needed — these are the Zitadel proxy)
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Mount("/", authHandler.Routes())
	})

	// Stripe webhook (no auth — uses signature verification)
	r.Route("/api/v1/webhooks/stripe", func(r chi.Router) {
		r.Mount("/", billingHandler.WebhookRoutes())
	})

	// Public contact form (no auth required)
	r.Route("/api/v1/public/contact", func(r chi.Router) {
		r.Mount("/", contactHandler.Routes())
	})

	// API v1 group — requires auth
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.Auth(zitadelClient, pool))

		// Orgs
		r.Route("/orgs", func(r chi.Router) {
			r.Post("/", orgHandler.Create)
			r.Get("/", orgHandler.List)

			r.Route("/{orgId}", func(r chi.Router) {
				r.Use(middleware.RLSTenant())

				r.Get("/", orgHandler.Get)

				// Owner-only: org deletion
				r.With(middleware.RequireResolvedPermission(permResolver, "org", "delete")).Delete("/", orgHandler.Delete)

				// Member access: all routes gate-checked via PermissionResolver
				r.Group(func(r chi.Router) {
					r.Use(middleware.RequireOrgMember(pool))

					// Permission check shorthand
					prm := func(scope, paramName, resource, action string) func(http.Handler) http.Handler {
						return middleware.PermissionResolverMiddleware(permResolver, scope, paramName, resource, action)
					}

					// Org mutation (admin+)
					r.With(prm("org", "", "org", "update")).Patch("/", orgHandler.Update)

					// Org members (admin+)
					r.With(prm("org", "", "org", "manage_members")).Post("/members/invite", orgHandler.InviteMember)
					r.With(prm("org", "", "org", "manage_members")).Post("/members", orgHandler.InviteMember) // alias
					r.With(prm("org", "", "org", "manage_members")).Patch("/members/{userId}", orgHandler.UpdateMemberRole)
					r.With(prm("org", "", "org", "manage_members")).Delete("/members/{userId}", orgHandler.RemoveMember)

					// Settings (admin+)
					r.With(prm("org", "", "webhooks", "manage")).Mount("/webhooks", webhookHandler.Routes())
					r.With(prm("org", "", "api_keys", "manage")).Mount("/api-keys", apikeyHandler.Routes())
					r.With(prm("org", "", "roles", "update")).Mount("/roles", customRoleHandler.Routes())
					r.With(prm("org", "", "billing", "manage")).Mount("/billing", billingHandler.Routes())
					r.With(prm("org", "", "org", "update")).Put("/theme", themeHandler.UpdateOrgTheme)

					r.Get("/me", orgHandler.GetMyMembership)
					r.Get("/members", orgHandler.ListMembers)
					r.Get("/theme", themeHandler.GetOrgTheme)

					// Permissions & Roles (combined: reads for members, mutations for admins)
					r.Mount("/permissions", permHandler.CombinedRoutes(permResolver))
					r.Get("/my-permissions", permHandler.GetMyOrgPermissions)

					// Teams
					r.Route("/teams", func(r chi.Router) {
						r.With(prm("org", "", "teams", "create")).Post("/", teamHandler.Create)
						r.With(prm("org", "", "teams", "read")).Get("/", teamHandler.List)

						r.Route("/{teamId}", func(r chi.Router) {
							r.With(prm("team", "teamId", "team", "read")).Get("/", teamHandler.Get)
							r.With(prm("team", "teamId", "team", "update")).Patch("/", teamHandler.Update)
							r.With(prm("team", "teamId", "team", "delete")).Delete("/", teamHandler.Delete)
							r.With(prm("team", "teamId", "team", "read")).Get("/dashboard", teamHandler.Dashboard)
							// my-permissions is a self-check: requires org membership only (enforced by
							// the outer RequireOrgMember group), never a specific team permission —
							// otherwise a custom role missing team:read could never learn what it has.
							r.Get("/my-permissions", teamHandler.GetMyPermissions)
							r.With(prm("team", "teamId", "team", "read")).Mount("/analytics", analyticsHandler.TeamAnalyticsRoutes())
							r.With(prm("team", "teamId", "team", "update")).Put("/manager", teamHandler.SetManager)
							r.With(prm("team", "teamId", "team", "read")).Get("/members", teamHandler.ListMembers)
							r.With(prm("team", "teamId", "team", "manage_members")).Post("/members", teamHandler.AddMember)
							r.With(prm("team", "teamId", "team", "manage_members")).Patch("/members/{userId}", teamHandler.UpdateMemberRole)
							r.With(prm("team", "teamId", "team", "manage_members")).Delete("/members/{userId}", teamHandler.RemoveMember)
						})
					})

					// Activity
					r.Mount("/activity", activityHandler.Routes())

					// Templates
					r.Route("/templates", func(r chi.Router) {
						r.With(prm("org", "", "templates", "read")).Get("/", templateHandler.List)
						r.With(prm("org", "", "templates", "create")).Post("/", templateHandler.Create)
						r.With(prm("org", "", "templates", "create")).Post("/import", templateHandler.Import)
						r.Route("/{templateId}", func(r chi.Router) {
							r.With(prm("org", "", "templates", "read")).Get("/", templateHandler.Get)
							r.With(prm("org", "", "templates", "update")).Patch("/", templateHandler.Update)
							r.With(prm("org", "", "templates", "delete")).Delete("/", templateHandler.Delete)
							r.With(prm("org", "", "templates", "read")).Get("/export", templateHandler.Export)
						})
					})

					// Dashboard
					r.Mount("/dashboard", dashboardHandler.Routes())

					// Analytics
					r.Mount("/analytics", analyticsHandler.Routes())

					// Notification Preferences
					r.Mount("/notification-preferences", notifPrefHandler.Routes())

					// Search
					if searchHandler != nil {
						r.Mount("/search", searchHandler.Routes())
					}

					// Org-level WebSocket (replaces SSE + per-project WS)
					r.Get("/ws", wsHandler.ServeWS)

					// Announcements
					r.Route("/announcements", func(r chi.Router) {
						r.With(prm("org", "", "announcements", "create")).Post("/", announcementHandler.Create)
						r.With(prm("org", "", "announcements", "read")).Get("/", announcementHandler.List)
						r.With(prm("org", "", "announcements", "read")).Get("/unread-count", announcementHandler.UnreadCount)
						r.Route("/{announcementId}", func(r chi.Router) {
							r.With(prm("org", "", "announcements", "read")).Get("/", announcementHandler.Get)
							r.With(prm("org", "", "announcements", "update")).Patch("/", announcementHandler.Update)
							r.With(prm("org", "", "announcements", "delete")).Delete("/", announcementHandler.Delete)
							r.Post("/read", announcementHandler.MarkRead)
						})
					})

					// Email templates (proxy to email service)
					r.Route("/email-templates", func(r chi.Router) {
						r.With(prm("org", "", "org", "update")).Mount("/", emailTemplateHandler.Routes())
					})

					// Change request review actions (org-level)
					r.With(prm("org", "", "tasks", "review")).Mount("/change-requests", changeReqHandler.ReviewRoutes())

					// Change request attachments
					r.Route("/change-requests/{crId}/attachments", func(r chi.Router) {
						r.Mount("/", attachmentHandler.CRRoutes())
					})

					// Presence indicators
					r.Mount("/presence", presenceHandler.Routes())

					// File uploads (avatars, logos)
					if uploadHandler != nil {
						r.Mount("/uploads", uploadHandler.Routes())
					}

					// Projects
					r.Route("/projects", func(r chi.Router) {
						r.With(prm("org", "", "projects", "create")).Post("/", projectHandler.Create)
						r.With(prm("org", "", "projects", "read")).Get("/", projectHandler.List)

						r.Route("/{projectId}", func(r chi.Router) {
							r.With(prm("project", "projectId", "project", "read")).Get("/", projectHandler.Get)
							r.With(prm("project", "projectId", "project", "update")).Patch("/", projectHandler.Update)
							r.With(prm("project", "projectId", "project", "delete")).Delete("/", projectHandler.Delete)
							r.With(prm("project", "projectId", "project", "read")).Get("/members", projectHandler.ListMembers)
							r.With(prm("project", "projectId", "members", "manage")).Post("/members", projectHandler.AddMember)
							r.With(prm("project", "projectId", "members", "manage")).Patch("/members/{userId}", projectHandler.UpdateMemberRole)
							r.With(prm("project", "projectId", "members", "manage")).Delete("/members/{userId}", projectHandler.RemoveMember)
							r.With(prm("project", "projectId", "project", "read")).Get("/members/{userId}/preview", projectHandler.PreviewRemoveMember)
							r.With(prm("project", "projectId", "project", "read")).Get("/dashboard", projectHandler.Dashboard)
							// my-permissions is a self-check: requires org membership only (enforced by
							// the outer RequireOrgMember group), never a specific project permission —
							// otherwise a custom role missing project:read could never learn what it has.
							r.Get("/my-permissions", projectHandler.GetMyPermissions)

							// Project analytics
							r.With(prm("project", "projectId", "project", "read")).Mount("/analytics", analyticsHandler.ProjectAnalyticsRoutes())

							// Project teams (multi-team)
							// GET list requires only project:read so external members can see linked teams.
							// Mutating operations keep members:manage.
							r.With(prm("project", "projectId", "project", "read")).Get("/teams", projectTeamHandler.ListTeams)
							r.With(prm("project", "projectId", "members", "manage")).Post("/teams", projectTeamHandler.LinkTeams)
							r.With(prm("project", "projectId", "members", "manage")).Delete("/teams/{teamId}", projectTeamHandler.UnlinkTeam)
							r.With(prm("project", "projectId", "project", "read")).Get("/teams/{teamId}/unlink-preview", projectTeamHandler.PreviewUnlinkTeam)
							r.With(prm("project", "projectId", "members", "manage")).Get("/teams/eligible-members", projectTeamHandler.ListEligibleMembers)

							// Project-level change requests (list + project-scoped approve/reject)
							r.With(prm("project", "projectId", "tasks", "read")).Get("/change-requests", changeReqHandler.ListByProject)
							r.With(prm("project", "projectId", "tasks", "review")).Route("/change-requests/{crId}", func(r chi.Router) {
								r.Post("/approve", changeReqHandler.Approve)
								r.Post("/reject", changeReqHandler.Reject)
							})

							// Imports
							r.With(prm("project", "projectId", "tasks", "create")).Mount("/imports", importHandler.Routes())

							// Project canvases (whiteboards)
							r.Route("/canvases", func(r chi.Router) {
								r.With(prm("project", "projectId", "project", "read")).Get("/", projectCanvasHandler.List)
								r.With(prm("project", "projectId", "project", "update")).Post("/", projectCanvasHandler.Create)
								r.Route("/{canvasId}", func(r chi.Router) {
									r.With(prm("project", "projectId", "project", "read")).Get("/", projectCanvasHandler.Get)
									r.With(prm("project", "projectId", "project", "update")).Patch("/", projectCanvasHandler.UpdateMeta)
									r.With(prm("project", "projectId", "project", "update")).Put("/state", projectCanvasHandler.SaveState)
									r.With(prm("project", "projectId", "project", "update")).Delete("/", projectCanvasHandler.Delete)
								})
							})

							// AFFiNE doc (unified document+canvas, provisioned lazily)
							r.With(prm("project", "projectId", "project", "read")).Get("/affine-doc", affineHandler.GetProjectDoc)

							// Tasks
							r.Route("/tasks", func(r chi.Router) {
								r.With(prm("project", "projectId", "tasks", "create")).Post("/", taskHandler.Create)
								r.With(prm("project", "projectId", "tasks", "read")).Get("/", taskHandler.List)
								r.With(prm("project", "projectId", "tasks", "read")).Get("/tree", taskHandler.ListTree)
								r.With(prm("project", "projectId", "tasks", "read")).Get("/export", taskHandler.Export)
								r.With(prm("project", "projectId", "tasks", "read")).Get("/calendar.ics", taskHandler.CalendarExport)
								r.With(prm("project", "projectId", "tasks", "update")).Post("/bulk", taskHandler.BulkUpdate)
								r.With(prm("project", "projectId", "tasks", "update")).Patch("/reorder", taskHandler.Reorder)

								r.Route("/{taskId}", func(r chi.Router) {
									r.With(prm("project", "projectId", "tasks", "read")).Get("/", taskHandler.Get)
									r.With(prm("project", "projectId", "tasks", "update")).Patch("/", taskHandler.Update)
									r.With(prm("project", "projectId", "tasks", "delete")).Delete("/", taskHandler.Delete)
									r.With(prm("project", "projectId", "tasks", "read")).Get("/tree", taskHandler.GetTree)
									r.With(prm("project", "projectId", "tasks", "update")).Post("/submit-review", taskHandler.SubmitForReview)
									r.With(prm("project", "projectId", "tasks", "review")).Post("/complete", taskHandler.MarkComplete)
									r.With(prm("project", "projectId", "tasks", "create")).Post("/duplicate", taskHandler.Duplicate)

									// Task sub-resources — each HTTP method carries its own permission guard.
									// GET operations require tasks:read; mutations require tasks:update.
									// Watchers (watch/unwatch self) only require tasks:read.
									r.Route("/checklists", func(r chi.Router) {
										r.With(prm("project", "projectId", "tasks", "read")).Get("/", checklistHandler.List)
										r.With(prm("project", "projectId", "tasks", "update")).Post("/", checklistHandler.Create)
										r.Route("/{checklistId}", func(r chi.Router) {
											r.With(prm("project", "projectId", "tasks", "update")).Patch("/", checklistHandler.Update)
											r.With(prm("project", "projectId", "tasks", "update")).Delete("/", checklistHandler.Delete)
										})
									})
									r.Route("/comments", func(r chi.Router) {
										r.With(prm("project", "projectId", "tasks", "read")).Get("/", commentHandler.List)
										r.With(prm("project", "projectId", "tasks", "update")).Post("/", commentHandler.Create)
										r.Route("/{commentId}", func(r chi.Router) {
											r.With(prm("project", "projectId", "tasks", "update")).Delete("/", commentHandler.Delete)
										})
									})
									r.Route("/rules", func(r chi.Router) {
										r.With(prm("project", "projectId", "tasks", "read")).Get("/", ruleHandler.List)
										r.With(prm("project", "projectId", "tasks", "update")).Post("/", ruleHandler.Create)
										r.Route("/{ruleId}", func(r chi.Router) {
											r.With(prm("project", "projectId", "tasks", "update")).Delete("/", ruleHandler.Delete)
										})
									})
									r.Route("/attachments", func(r chi.Router) {
										r.With(prm("project", "projectId", "tasks", "read")).Get("/", attachmentHandler.ListByTask)
										r.With(prm("project", "projectId", "tasks", "update")).Post("/", attachmentHandler.Create)
										r.With(prm("project", "projectId", "tasks", "update")).Post("/upload", attachmentHandler.DirectUpload)
										r.Route("/{attachmentId}", func(r chi.Router) {
											r.With(prm("project", "projectId", "tasks", "read")).Get("/download", attachmentHandler.Download)
											r.With(prm("project", "projectId", "tasks", "read")).Get("/content", attachmentHandler.Content)
											r.With(prm("project", "projectId", "tasks", "update")).Delete("/", attachmentHandler.Delete)
										})
									})
									r.Route("/dependencies", func(r chi.Router) {
										r.With(prm("project", "projectId", "tasks", "read")).Get("/", depHandler.List)
										r.With(prm("project", "projectId", "tasks", "read")).Get("/dependents", depHandler.ListDependents)
										r.With(prm("project", "projectId", "tasks", "update")).Post("/", depHandler.Add)
										r.With(prm("project", "projectId", "tasks", "update")).Delete("/{dependsOnId}", depHandler.Remove)
									})
									r.Route("/watchers", func(r chi.Router) {
										r.With(prm("project", "projectId", "tasks", "read")).Get("/", watcherHandler.List)
										r.With(prm("project", "projectId", "tasks", "read")).Post("/", watcherHandler.Watch)
										r.With(prm("project", "projectId", "tasks", "read")).Delete("/", watcherHandler.Unwatch)
									})

									// Task-level change requests
									r.With(prm("project", "projectId", "tasks", "update")).Mount("/change-requests", changeReqHandler.TaskRoutes())
								})
							})
						})
					})
				})
			})
		})

		// Notifications (user-scoped, no org context needed)
		r.Mount("/notifications", notifHandler.Routes())

		// Sticky Notes (user-scoped, no org context needed)
		r.Mount("/sticky-notes", stickyNoteHandler.Routes())
	})

	// --- Background Worker (Start) ---
	emailSender := email.NewSender(email.Config{
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		User:     cfg.SMTPUser,
		Password: cfg.SMTPPassword,
		From:     cfg.SMTPFrom,
		Enabled:  cfg.SMTPEnabled,
	})
	workerHandlers := &worker.Handlers{
		Pool:               pool,
		EmailSender:        emailSender,
		FrontendURL:        cfg.FrontendURL,
		Cache:              cacheManager,
		TxManager:          txm,
		MeiliURL:           cfg.MeiliURL,
		MeiliMasterKey:     cfg.MeiliMasterKey,
		EmailServiceURL:    emailServiceURL,
		EmailServiceAPIKey: emailServiceAPIKey,
		OrgRepo:            orgRepo,
	}
	workerMux := asynq.NewServeMux()
	workerHandlers.RegisterAll(workerMux)
	go func() {
		if err := workerSrv.Start(workerMux); err != nil {
			log.Fatal().Err(err).Msg("asynq worker failed to start")
		}
	}()
	log.Info().Msg("Asynq worker started")

	// --- DB Pool Metrics (background goroutine) ---
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				stat := pool.Stat()
				appMetrics.DBPoolActive.Set(float64(stat.AcquiredConns()))
				appMetrics.DBPoolIdle.Set(float64(stat.IdleConns()))
			}
		}
	}()

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
