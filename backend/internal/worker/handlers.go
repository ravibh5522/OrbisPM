package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/cache"
	"github.com/orbispm/orbispm/internal/email"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
)

// Handlers holds dependencies for task handler functions.
type Handlers struct {
	Pool               *pgxpool.Pool
	EmailSender        *email.Sender
	FrontendURL        string
	Cache              *cache.Manager
	TxManager          *repository.TxManager
	MeiliURL           string
	MeiliMasterKey     string
	EmailServiceURL    string
	EmailServiceAPIKey string
}

// sendViaEmailService attempts to send an email through the email-service microservice.
// It maps notifType to a template name and passes org_id so custom org templates are used.
func (h *Handlers) sendViaEmailService(ctx context.Context, to, subject, orgID, notifType, title, body string) error {
	svcURL := h.EmailServiceURL
	if svcURL == "" {
		svcURL = "http://email-service:8050"
	}

	template := "notification"
	if notifType == "announcement_created" {
		template = "announcement"
	}

	payload := map[string]any{
		"to":       to,
		"subject":  subject,
		"template": template,
		"context": map[string]string{
			"title":        title,
			"body":         body,
			"org_id":       orgID,
			"frontend_url": h.FrontendURL,
		},
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal email service payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, svcURL+"/api/v1/email/send", bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("build email service request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	apiKey := h.EmailServiceAPIKey
	if apiKey == "" {
		apiKey = "email-service-dev-key"
	}
	req.Header.Set("X-API-Key", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("email service request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("email service returned %d", resp.StatusCode)
	}
	return nil
}

// RegisterAll registers all task handlers on the mux.
func (h *Handlers) RegisterAll(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeActivityLog, h.HandleActivityLog)
	mux.HandleFunc(TypeNotification, h.HandleNotification)
	mux.HandleFunc(TypeSearchIndex, h.HandleSearchIndex)
	mux.HandleFunc(TypeSearchDelete, h.HandleSearchDelete)
	mux.HandleFunc(TypeWebhookDeliver, h.HandleWebhookDeliver)
	mux.HandleFunc(TypeRecurringGenerate, h.HandleRecurringGenerate)
	mux.HandleFunc(TypeAnalyticsSnapshot, h.HandleAnalyticsSnapshot)
	mux.HandleFunc(TypeAnalyticsTransition, h.HandleAnalyticsTransition)
	mux.HandleFunc(TypeGenerateReport, h.HandleGenerateReport)
	if h.Cache != nil {
		mux.HandleFunc(TypeDBFlushTask, h.HandleDBFlushTask)
		mux.HandleFunc(TypeDBFlushProject, h.HandleDBFlushProject)
	}
}

// HandleActivityLog inserts an activity log entry into the database.
func (h *Handlers) HandleActivityLog(ctx context.Context, t *asynq.Task) error {
	var p ActivityLogPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal activity log payload: %w", err)
	}

	orgID, err := uuid.Parse(p.OrgID)
	if err != nil {
		return fmt.Errorf("parse org_id: %w", err)
	}
	var actorID uuid.UUID
	if p.ActorID != "" {
		actorID, err = uuid.Parse(p.ActorID)
		if err != nil {
			return fmt.Errorf("parse actor_id: %w", err)
		}
	}
	entityID, err := uuid.Parse(p.EntityID)
	if err != nil {
		return fmt.Errorf("parse entity_id: %w", err)
	}

	// Use TxManager to set RLS context (app.current_org_id) before inserting
	ctx = tenant.SetOrgID(ctx, orgID)
	err = h.TxManager.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO activity_log (id, org_id, entity_type, entity_id, action, actor_id, changes, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			uuid.New(), orgID, p.EntityType, entityID, p.Action, actorID, p.Changes, time.Now().UTC(),
		)
		return err
	})
	if err != nil {
		return fmt.Errorf("insert activity log: %w", err)
	}

	log.Debug().Str("entity_type", p.EntityType).Str("action", p.Action).Msg("activity log recorded")
	return nil
}

// HandleNotification inserts a notification for a user and sends email if enabled.
func (h *Handlers) HandleNotification(ctx context.Context, t *asynq.Task) error {
	var p NotificationPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal notification payload: %w", err)
	}

	userID, err := uuid.Parse(p.UserID)
	if err != nil {
		return fmt.Errorf("parse user_id: %w", err)
	}
	orgID, err := uuid.Parse(p.OrgID)
	if err != nil {
		return fmt.Errorf("parse org_id: %w", err)
	}

	// 1. Always create in-app notification (use TxManager for RLS context)
	ctx = tenant.SetOrgID(ctx, orgID)
	err = h.TxManager.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO notifications (id, user_id, org_id, type, title, body, payload, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			uuid.New(), userID, orgID, p.Type, p.Title, p.Body, p.Payload, time.Now().UTC(),
		)
		return err
	})
	if err != nil {
		return fmt.Errorf("insert notification: %w", err)
	}
	log.Debug().Str("type", p.Type).Str("user_id", p.UserID).Msg("notification created")

	// 2. Check if email channel is enabled for this event type
	if h.EmailSender != nil && h.EmailSender.IsEnabled() {
		var emailEnabled bool
		err := h.Pool.QueryRow(ctx,
			`SELECT COALESCE(
				(SELECT enabled FROM notification_preferences
				 WHERE user_id = $1 AND org_id = $2 AND event_type = $3 AND channel = 'email'),
				true
			)`, userID, orgID, p.Type,
		).Scan(&emailEnabled)
		if err != nil {
			log.Warn().Err(err).Msg("failed to check email preference, defaulting to send")
			emailEnabled = true
		}

		if emailEnabled {
			// Lookup user email from public.users cache
			var userEmail string
			err := h.Pool.QueryRow(ctx,
				`SELECT COALESCE(email, '') FROM users WHERE id = $1`, userID,
			).Scan(&userEmail)
			if err != nil || userEmail == "" {
				log.Warn().Err(err).Str("user_id", p.UserID).Msg("could not find user email")
			} else {
				subject := fmt.Sprintf("[OrbisPM] %s", p.Title)

				// Try email-service first (supports custom org templates).
				svcErr := h.sendViaEmailService(ctx, userEmail, subject, p.OrgID, p.Type, p.Title, p.Body)
				if svcErr == nil {
					log.Debug().Str("to", userEmail).Str("type", p.Type).Msg("notification email sent via email-service")
				} else {
					// Fall back to direct SMTP.
					log.Warn().Err(svcErr).Str("to", userEmail).Msg("email-service failed, falling back to SMTP")
					htmlBody := email.FormatNotificationEmail(p.Title, p.Body, h.FrontendURL)
					if sendErr := h.EmailSender.Send(email.Message{
						To:      userEmail,
						Subject: subject,
						Body:    htmlBody,
					}); sendErr != nil {
						log.Error().Err(sendErr).Str("to", userEmail).Msg("failed to send notification email")
						// Don't fail the task — in-app notification was already created
					} else {
						log.Debug().Str("to", userEmail).Str("type", p.Type).Msg("notification email sent via SMTP fallback")
					}
				}
			}
		}
	}

	return nil
}

// HandleSearchIndex indexes a document in Meilisearch.
func (h *Handlers) HandleSearchIndex(ctx context.Context, t *asynq.Task) error {
	var p SearchIndexPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal search index payload: %w", err)
	}

	body, err := json.Marshal([]map[string]any{p.Document})
	if err != nil {
		return fmt.Errorf("marshal document: %w", err)
	}

	meiliURL := h.MeiliURL
	if meiliURL == "" {
		meiliURL = "http://meilisearch:7700"
	}
	url := fmt.Sprintf("%s/indexes/%s/documents", meiliURL, p.Index)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if h.MeiliMasterKey != "" {
		req.Header.Set("Authorization", "Bearer "+h.MeiliMasterKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("meilisearch index: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("meilisearch returned %d", resp.StatusCode)
	}

	log.Debug().Str("index", p.Index).Msg("document indexed")
	return nil
}

// HandleSearchDelete removes a document from Meilisearch.
func (h *Handlers) HandleSearchDelete(ctx context.Context, t *asynq.Task) error {
	var p SearchDeletePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal search delete payload: %w", err)
	}

	meiliURL := h.MeiliURL
	if meiliURL == "" {
		meiliURL = "http://meilisearch:7700"
	}
	url := fmt.Sprintf("%s/indexes/%s/documents/%s", meiliURL, p.Index, p.DocID)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	if h.MeiliMasterKey != "" {
		req.Header.Set("Authorization", "Bearer "+h.MeiliMasterKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("meilisearch delete: %w", err)
	}
	defer resp.Body.Close()

	log.Debug().Str("index", p.Index).Str("doc_id", p.DocID).Msg("document deleted from index")
	return nil
}

// HandleWebhookDeliver delivers a webhook event to the configured URL.
func (h *Handlers) HandleWebhookDeliver(ctx context.Context, t *asynq.Task) error {
	var p WebhookDeliverPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal webhook payload: %w", err)
	}

	body, err := json.Marshal(p.Payload)
	if err != nil {
		return fmt.Errorf("marshal webhook payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.URL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Event", p.Event)
	if p.Secret != "" {
		req.Header.Set("X-Webhook-Secret", p.Secret)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("deliver webhook to %s: %w", p.URL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook %s returned %d", p.URL, resp.StatusCode)
	}

	log.Debug().Str("url", p.URL).Str("event", p.Event).Msg("webhook delivered")
	return nil
}

// HandleRecurringGenerate creates the next instance of a recurring task.
func (h *Handlers) HandleRecurringGenerate(ctx context.Context, t *asynq.Task) error {
	var p RecurringGeneratePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal recurring payload: %w", err)
	}

	taskID, err := uuid.Parse(p.TaskID)
	if err != nil {
		return fmt.Errorf("parse task_id: %w", err)
	}
	orgID, err := uuid.Parse(p.OrgID)
	if err != nil {
		return fmt.Errorf("parse org_id: %w", err)
	}

	// Fetch the template task
	var title, description, status, priority, recurrenceRule string
	var projectID uuid.UUID
	var assigneeID, reporterID *uuid.UUID
	var labels []string
	var metadata map[string]any
	var estimatedHours *float64
	var nextOccurrence *time.Time

	err = h.Pool.QueryRow(ctx,
		`SELECT title, description, status, priority, project_id, assignee_id, reporter_id,
		  labels, metadata, estimated_hours, recurrence_rule, next_occurrence
		 FROM tasks WHERE id = $1 AND org_id = $2 AND recurrence_rule IS NOT NULL`,
		taskID, orgID,
	).Scan(&title, &description, &status, &priority, &projectID, &assigneeID, &reporterID,
		&labels, &metadata, &estimatedHours, &recurrenceRule, &nextOccurrence)
	if err != nil {
		return fmt.Errorf("fetch recurring task: %w", err)
	}

	if nextOccurrence == nil || time.Now().Before(*nextOccurrence) {
		// Not yet due
		return nil
	}

	// Create new task instance
	dueDate := *nextOccurrence
	newTaskID := uuid.New()
	_, err = h.Pool.Exec(ctx,
		`INSERT INTO tasks (id, org_id, project_id, title, description, status, priority,
		  assignee_id, reporter_id, labels, metadata, estimated_hours, due_date, recurrence_parent_id, depth, position)
		 VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8, $9, $10, $11, $12, $13, 0, 0)`,
		newTaskID, orgID, projectID, title, description, priority,
		assigneeID, reporterID, labels, metadata, estimatedHours, dueDate, taskID,
	)
	if err != nil {
		return fmt.Errorf("create recurring instance: %w", err)
	}

	// Calculate and update next occurrence
	next := calculateNextOccurrence(*nextOccurrence, recurrenceRule)
	_, err = h.Pool.Exec(ctx,
		`UPDATE tasks SET next_occurrence = $1 WHERE id = $2`,
		next, taskID,
	)
	if err != nil {
		return fmt.Errorf("update next occurrence: %w", err)
	}

	log.Debug().Str("task_id", taskID.String()).Str("new_id", newTaskID.String()).Time("due_date", dueDate).Msg("recurring task instance created")
	return nil
}

// calculateNextOccurrence calculates the next occurrence based on RRULE.
func calculateNextOccurrence(current time.Time, rrule string) *time.Time {
	// Simple RRULE parser for: FREQ=DAILY, FREQ=WEEKLY, FREQ=MONTHLY, FREQ=YEARLY
	// Also supports INTERVAL=N
	freq := "DAILY"
	interval := 1

	for _, part := range strings.Split(rrule, ";") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "FREQ":
			freq = kv[1]
		case "INTERVAL":
			if i, err := fmt.Sscanf(kv[1], "%d", &interval); err == nil && i == 1 && interval > 0 {
				// interval parsed
			}
		}
	}

	var next time.Time
	switch freq {
	case "DAILY":
		next = current.AddDate(0, 0, interval)
	case "WEEKLY":
		next = current.AddDate(0, 0, 7*interval)
	case "MONTHLY":
		next = current.AddDate(0, interval, 0)
	case "YEARLY":
		next = current.AddDate(interval, 0, 0)
	default:
		next = current.AddDate(0, 0, 1) // Default to daily
	}
	return &next
}

// ─── DB Flush Handlers ──────────────────────────────────────

// HandleDBFlushTask flushes a single dirty cached task to the database.
func (h *Handlers) HandleDBFlushTask(ctx context.Context, t *asynq.Task) error {
	var p DBFlushTaskPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal db flush task payload: %w", err)
	}

	projectID, err := uuid.Parse(p.ProjectID)
	if err != nil {
		return fmt.Errorf("parse project_id: %w", err)
	}
	taskID, err := uuid.Parse(p.TaskID)
	if err != nil {
		return fmt.Errorf("parse task_id: %w", err)
	}

	// Read the task from cache
	task, err := h.Cache.GetTask(ctx, projectID, taskID)
	if err != nil {
		log.Warn().Err(err).Str("task_id", p.TaskID).Msg("cache miss during flush, skipping")
		// Remove from dirty set anyway — if it's not in cache, nothing to flush
		h.Cache.RemoveFromDirty(ctx, projectID, taskID)
		return nil
	}

	// Write to DB via TxManager (sets RLS context)
	err = h.TxManager.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`UPDATE tasks SET
				title = $1, description = $2, status = $3, priority = $4,
				assignee_id = $5, reporter_id = $6, labels = $7, metadata = $8,
				estimated_hours = $9, due_date = $10, start_date = $11,
				position = $12, parent_task_id = $13, updated_at = $14
			WHERE id = $15`,
			task.Title, task.Description, task.Status, task.Priority,
			task.AssigneeID, task.ReporterID, task.Labels, task.Metadata,
			task.EstimatedHours, task.DueDate, task.StartDate,
			task.Position, task.ParentTaskID, time.Now().UTC(),
			task.ID,
		)
		return err
	})
	if err != nil {
		return fmt.Errorf("flush task to db: %w", err)
	}

	// Remove from dirty set on successful flush
	if err := h.Cache.RemoveFromDirty(ctx, projectID, taskID); err != nil {
		log.Warn().Err(err).Str("task_id", p.TaskID).Msg("failed to remove from dirty set")
	}

	log.Debug().Str("task_id", p.TaskID).Msg("task flushed to DB")
	return nil
}

// HandleDBFlushProject flushes all dirty cached tasks in a project to the database.
func (h *Handlers) HandleDBFlushProject(ctx context.Context, t *asynq.Task) error {
	var p DBFlushProjectPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal db flush project payload: %w", err)
	}

	projectID, err := uuid.Parse(p.ProjectID)
	if err != nil {
		return fmt.Errorf("parse project_id: %w", err)
	}

	dirtyIDs, err := h.Cache.GetDirtyTasks(ctx, projectID)
	if err != nil {
		return fmt.Errorf("get dirty tasks: %w", err)
	}

	if len(dirtyIDs) == 0 {
		return nil
	}

	var flushed int
	for _, taskID := range dirtyIDs {
		task, err := h.Cache.GetTask(ctx, projectID, taskID)
		if err != nil {
			h.Cache.RemoveFromDirty(ctx, projectID, taskID)
			continue
		}

		err = h.TxManager.WithTx(ctx, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx,
				`UPDATE tasks SET
					title = $1, description = $2, status = $3, priority = $4,
					assignee_id = $5, reporter_id = $6, labels = $7, metadata = $8,
					estimated_hours = $9, due_date = $10, start_date = $11,
					position = $12, parent_task_id = $13, updated_at = $14
				WHERE id = $15`,
				task.Title, task.Description, task.Status, task.Priority,
				task.AssigneeID, task.ReporterID, task.Labels, task.Metadata,
				task.EstimatedHours, task.DueDate, task.StartDate,
				task.Position, task.ParentTaskID, time.Now().UTC(),
				task.ID,
			)
			return err
		})
		if err != nil {
			log.Error().Err(err).Str("task_id", taskID.String()).Msg("failed to flush task in project batch")
			continue
		}

		h.Cache.RemoveFromDirty(ctx, projectID, taskID)
		flushed++
	}

	log.Debug().Str("project_id", p.ProjectID).Int("flushed", flushed).Int("total_dirty", len(dirtyIDs)).Msg("project flush completed")
	return nil
}

// HandleAnalyticsSnapshot takes daily task-status snapshots for all projects in an org.
func (h *Handlers) HandleAnalyticsSnapshot(ctx context.Context, t *asynq.Task) error {
	var p AnalyticsSnapshotPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal analytics snapshot payload: %w", err)
	}

	orgID, err := uuid.Parse(p.OrgID)
	if err != nil {
		return fmt.Errorf("parse org_id: %w", err)
	}

	ctx = tenant.SetOrgID(ctx, orgID)
	analyticsRepo := repository.NewAnalyticsRepo(h.Pool)
	projectRepo := repository.NewProjectRepo(h.Pool)

	projects, err := projectRepo.ListByOrg(ctx, orgID, nil)
	if err != nil {
		return fmt.Errorf("list projects for snapshot: %w", err)
	}

	today := time.Now().Truncate(24 * time.Hour)

	return h.TxManager.WithTx(ctx, func(tx pgx.Tx) error {
		for _, proj := range projects {
			statusMap, err := analyticsRepo.CountTasksByStatusForProject(ctx, proj.ID)
			if err != nil {
				log.Warn().Err(err).Str("project_id", proj.ID.String()).Msg("snapshot: failed to count tasks")
				continue
			}
			totalCount := 0
			for _, c := range statusMap {
				totalCount += c
			}
			_, err = tx.Exec(ctx,
				`INSERT INTO task_status_snapshots (org_id, project_id, snapshot_date, todo_count, in_progress_count, blocked_count, done_count, total_count)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				 ON CONFLICT (org_id, project_id, snapshot_date) DO UPDATE SET
				   todo_count = EXCLUDED.todo_count, in_progress_count = EXCLUDED.in_progress_count,
				   blocked_count = EXCLUDED.blocked_count, done_count = EXCLUDED.done_count, total_count = EXCLUDED.total_count`,
				orgID, proj.ID, today, statusMap["todo"], statusMap["in_progress"], statusMap["blocked"], statusMap["done"], totalCount)
			if err != nil {
				log.Warn().Err(err).Str("project_id", proj.ID.String()).Msg("snapshot: failed to upsert")
			}
		}
		return nil
	})
}

// HandleAnalyticsTransition records a task state transition for analytics tracking.
func (h *Handlers) HandleAnalyticsTransition(ctx context.Context, t *asynq.Task) error {
	var p AnalyticsTransitionPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal analytics transition payload: %w", err)
	}

	orgID, err := uuid.Parse(p.OrgID)
	if err != nil {
		return fmt.Errorf("parse org_id: %w", err)
	}
	taskID, err := uuid.Parse(p.TaskID)
	if err != nil {
		return fmt.Errorf("parse task_id: %w", err)
	}
	projectID, err := uuid.Parse(p.ProjectID)
	if err != nil {
		return fmt.Errorf("parse project_id: %w", err)
	}
	actorID, err := uuid.Parse(p.ActorID)
	if err != nil {
		return fmt.Errorf("parse actor_id: %w", err)
	}

	ctx = tenant.SetOrgID(ctx, orgID)

	return h.TxManager.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO task_state_transitions (org_id, task_id, project_id, from_status, to_status, actor_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			orgID, taskID, projectID, p.FromStatus, p.ToStatus, actorID)
		return err
	})
}

// HandleGenerateReport processes a queued report generation task.
// It collects analytics data for the requested scope and marks the report completed.
func (h *Handlers) HandleGenerateReport(ctx context.Context, t *asynq.Task) error {
	var p GenerateReportPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal generate report payload: %w", err)
	}

	reportID, err := uuid.Parse(p.ReportID)
	if err != nil {
		return fmt.Errorf("parse report_id: %w", err)
	}
	orgID, err := uuid.Parse(p.OrgID)
	if err != nil {
		return fmt.Errorf("parse org_id: %w", err)
	}

	ctx = tenant.SetOrgID(ctx, orgID)

	// Mark as generating
	_, err = h.Pool.Exec(ctx,
		`UPDATE performance_reports SET status = 'generating' WHERE id = $1`, reportID)
	if err != nil {
		log.Warn().Err(err).Msg("generate report: failed to set generating status")
	}

	// Collect summary stats for the report
	analyticsRepo := repository.NewAnalyticsRepo(h.Pool)

	var reportData map[string]any
	switch p.ScopeType {
	case "project":
		scopeID, parseErr := uuid.Parse(p.ScopeID)
		if parseErr != nil {
			return fmt.Errorf("parse scope_id: %w", parseErr)
		}
		statusMap, _ := analyticsRepo.CountTasksByStatusForProject(ctx, scopeID)
		velocity, _ := analyticsRepo.GetVelocityTrend(ctx, scopeID, 30)
		velocityData := make([]map[string]any, 0, len(velocity))
		for _, v := range velocity {
			velocityData = append(velocityData, map[string]any{
				"date": v.Date, "completed": v.Completed, "created": v.Created,
			})
		}
		reportData = map[string]any{
			"scope_type":   "project",
			"scope_id":     p.ScopeID,
			"report_type":  p.ReportType,
			"task_status":  statusMap,
			"velocity":     velocityData,
			"generated_at": time.Now().UTC().Format(time.RFC3339),
		}
	default: // org-level
		statusMap, _ := analyticsRepo.CountTasksByStatusForOrg(ctx, orgID)
		velocity, _ := analyticsRepo.GetOrgVelocityTrend(ctx, orgID, 30)
		velocityData := make([]map[string]any, 0, len(velocity))
		for _, v := range velocity {
			velocityData = append(velocityData, map[string]any{
				"date": v.Date, "completed": v.Completed, "created": v.Created,
			})
		}
		reportData = map[string]any{
			"scope_type":   "org",
			"scope_id":     p.OrgID,
			"report_type":  p.ReportType,
			"task_status":  statusMap,
			"velocity":     velocityData,
			"generated_at": time.Now().UTC().Format(time.RFC3339),
		}
	}

	reportJSON, err := json.Marshal(reportData)
	if err != nil {
		return fmt.Errorf("marshal report data: %w", err)
	}

	// Store report data in parameters column and mark completed
	now := time.Now()
	_, err = h.Pool.Exec(ctx,
		`UPDATE performance_reports
		 SET status = 'completed', generated_at = $2, expires_at = $3, parameters = $4
		 WHERE id = $1`,
		reportID, now, now.Add(30*24*time.Hour), string(reportJSON))
	if err != nil {
		return fmt.Errorf("update report completed: %w", err)
	}

	log.Info().Str("report_id", p.ReportID).Str("org_id", p.OrgID).Msg("report generation completed")
	return nil
}
