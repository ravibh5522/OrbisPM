package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
	"github.com/rs/zerolog/log"
)

// Task type constants.
const (
	TypeActivityLog         = "activity:log"
	TypeNotification        = "notification:send"
	TypeSearchIndex         = "search:index"
	TypeSearchDelete        = "search:delete"
	TypeWebhookDeliver      = "webhook:deliver"
	TypeImportProcess       = "import:process"
	TypeExportGenerate      = "export:generate"
	TypeRecurringGenerate   = "recurring:generate"
	TypeDBFlushTask         = "db:flush-task"
	TypeDBFlushProject      = "db:flush-project"
	TypeAnalyticsSnapshot   = "analytics:snapshot"
	TypeAnalyticsTransition = "analytics:transition"
	TypeGenerateReport      = "analytics:generate-report"
	TypeDrivePurge          = "drive:purge"
)

// ActivityLogPayload holds data for creating an activity log entry.
type ActivityLogPayload struct {
	OrgID      string         `json:"org_id"`
	EntityType string         `json:"entity_type"`
	EntityID   string         `json:"entity_id"`
	Action     string         `json:"action"`
	ActorID    string         `json:"actor_id"`
	Changes    map[string]any `json:"changes,omitempty"`
}

// NotificationPayload holds data for sending a notification.
type NotificationPayload struct {
	UserID  string         `json:"user_id"`
	OrgID   string         `json:"org_id"`
	Type    string         `json:"type"`
	Title   string         `json:"title"`
	Body    string         `json:"body"`
	Payload map[string]any `json:"payload,omitempty"`
}

// SearchIndexPayload holds data for indexing a document.
type SearchIndexPayload struct {
	Index    string         `json:"index"`
	Document map[string]any `json:"document"`
}

// SearchDeletePayload holds data for removing a document from the index.
type SearchDeletePayload struct {
	Index string `json:"index"`
	DocID string `json:"doc_id"`
}

// WebhookDeliverPayload holds data for delivering a webhook.
type WebhookDeliverPayload struct {
	WebhookID string         `json:"webhook_id"`
	URL       string         `json:"url"`
	Secret    string         `json:"secret"`
	Event     string         `json:"event"`
	Payload   map[string]any `json:"payload"`
}

// RecurringGeneratePayload holds data for creating a recurring task instance.
type RecurringGeneratePayload struct {
	TaskID string `json:"task_id"`
	OrgID  string `json:"org_id"`
}

// DBFlushTaskPayload holds data for flushing a single cached task to DB.
type DBFlushTaskPayload struct {
	ProjectID string `json:"project_id"`
	TaskID    string `json:"task_id"`
	Version   int64  `json:"version"`
}

// DBFlushProjectPayload holds data for flushing all dirty tasks in a project.
type DBFlushProjectPayload struct {
	ProjectID string `json:"project_id"`
}

// AnalyticsSnapshotPayload holds data for the daily analytics snapshot job.
type AnalyticsSnapshotPayload struct {
	OrgID string `json:"org_id"`
}

// AnalyticsTransitionPayload holds data for recording a task state transition.
type AnalyticsTransitionPayload struct {
	OrgID      string `json:"org_id"`
	TaskID     string `json:"task_id"`
	ProjectID  string `json:"project_id"`
	ActorID    string `json:"actor_id"`
	FromStatus string `json:"from_status"`
	ToStatus   string `json:"to_status"`
}

// --- Task creators ---

// NewActivityLogTask creates a new activity log background task.
func NewActivityLogTask(p ActivityLogPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeActivityLog, data), nil
}

// NewNotificationTask creates a new notification background task.
func NewNotificationTask(p NotificationPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeNotification, data), nil
}

// NewSearchIndexTask creates a new search indexing background task.
func NewSearchIndexTask(p SearchIndexPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeSearchIndex, data), nil
}

// NewSearchDeleteTask creates a new search delete background task.
func NewSearchDeleteTask(p SearchDeletePayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeSearchDelete, data), nil
}

// NewWebhookDeliverTask creates a new webhook delivery background task.
func NewWebhookDeliverTask(p WebhookDeliverPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeWebhookDeliver, data), nil
}

// NewRecurringGenerateTask creates a task to generate the next recurring instance.
func NewRecurringGenerateTask(p RecurringGeneratePayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeRecurringGenerate, data), nil
}

// NewDBFlushTask creates a task to flush a single dirty cached task to the database.
func NewDBFlushTask(p DBFlushTaskPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeDBFlushTask, data), nil
}

// NewDBFlushProjectTask creates a task to flush all dirty cached tasks in a project to the database.
func NewDBFlushProjectTask(p DBFlushProjectPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeDBFlushProject, data), nil
}

// NewAnalyticsSnapshotTask creates a task for the daily analytics snapshot.
func NewAnalyticsSnapshotTask(p AnalyticsSnapshotPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeAnalyticsSnapshot, data), nil
}

// NewAnalyticsTransitionTask creates a task for recording a task state transition.
func NewAnalyticsTransitionTask(p AnalyticsTransitionPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeAnalyticsTransition, data), nil
}

// GenerateReportPayload holds data for generating a performance report.
type GenerateReportPayload struct {
	ReportID   string `json:"report_id"`
	OrgID      string `json:"org_id"`
	ScopeType  string `json:"scope_type"`
	ScopeID    string `json:"scope_id"`
	ReportType string `json:"report_type"`
}

// NewGenerateReportTask creates a task for generating a performance report.
func NewGenerateReportTask(p GenerateReportPayload) (*asynq.Task, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeGenerateReport, data), nil
}

// StartScheduler starts the periodic task scheduler. Unique() makes the
// schedule safe with several API replicas: each enqueues, only one task runs.
func StartScheduler(redisOpt asynq.RedisClientOpt) (*asynq.Scheduler, error) {
	sched := asynq.NewScheduler(redisOpt, nil)
	if _, err := sched.Register("@every 1h", asynq.NewTask(TypeDrivePurge, nil),
		asynq.Queue("low"), asynq.Unique(55*time.Minute)); err != nil {
		return nil, fmt.Errorf("register %s: %w", TypeDrivePurge, err)
	}
	if err := sched.Start(); err != nil {
		return nil, fmt.Errorf("start scheduler: %w", err)
	}
	return sched, nil
}

// Server wraps asynq server and client for background job processing.
type Server struct {
	client *asynq.Client
	server *asynq.Server
}

// NewServer creates a new background job server.
func NewServer(redisOpt asynq.RedisClientOpt) *Server {
	client := asynq.NewClient(redisOpt)
	srv := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: 10,
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				log.Error().Err(err).Str("type", task.Type()).Msg("worker task failed")
			}),
		},
	)
	return &Server{client: client, server: srv}
}

// Client returns the asynq client for enqueuing tasks.
func (s *Server) Client() *asynq.Client {
	return s.client
}

// Enqueue enqueues a task for background processing.
func (s *Server) Enqueue(task *asynq.Task, opts ...asynq.Option) error {
	_, err := s.client.Enqueue(task, opts...)
	if err != nil {
		return fmt.Errorf("enqueue %s: %w", task.Type(), err)
	}
	return nil
}

// Start starts the background worker server with the given mux.
func (s *Server) Start(mux *asynq.ServeMux) error {
	return s.server.Start(mux)
}

// Stop stops the background worker server.
func (s *Server) Stop() {
	s.server.Stop()
	_ = s.client.Close()
}
