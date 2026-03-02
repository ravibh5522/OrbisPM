package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/email"
)

// Handlers holds dependencies for task handler functions.
type Handlers struct {
	Pool        *pgxpool.Pool
	EmailSender *email.Sender
	FrontendURL string
}

// RegisterAll registers all task handlers on the mux.
func (h *Handlers) RegisterAll(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeActivityLog, h.HandleActivityLog)
	mux.HandleFunc(TypeNotification, h.HandleNotification)
	mux.HandleFunc(TypeSearchIndex, h.HandleSearchIndex)
	mux.HandleFunc(TypeSearchDelete, h.HandleSearchDelete)
	mux.HandleFunc(TypeWebhookDeliver, h.HandleWebhookDeliver)
	mux.HandleFunc(TypeRecurringGenerate, h.HandleRecurringGenerate)
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
	actorID, err := uuid.Parse(p.ActorID)
	if err != nil {
		return fmt.Errorf("parse actor_id: %w", err)
	}
	entityID, err := uuid.Parse(p.EntityID)
	if err != nil {
		return fmt.Errorf("parse entity_id: %w", err)
	}

	_, err = h.Pool.Exec(ctx,
		`INSERT INTO activity_logs (id, org_id, entity_type, entity_id, action, actor_id, changes, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		uuid.New(), orgID, p.EntityType, entityID, p.Action, actorID, p.Changes, time.Now().UTC(),
	)
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

	// 1. Always create in-app notification
	_, err = h.Pool.Exec(ctx,
		`INSERT INTO notifications (id, user_id, org_id, type, title, body, payload, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		uuid.New(), userID, orgID, p.Type, p.Title, p.Body, p.Payload, time.Now().UTC(),
	)
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
			// Lookup user email from auth.users
			var userEmail string
			err := h.Pool.QueryRow(ctx,
				`SELECT COALESCE(email, '') FROM auth.users WHERE id = $1`, userID,
			).Scan(&userEmail)
			if err != nil || userEmail == "" {
				log.Warn().Err(err).Str("user_id", p.UserID).Msg("could not find user email")
			} else {
				htmlBody := email.FormatNotificationEmail(p.Title, p.Body, h.FrontendURL)
				if sendErr := h.EmailSender.Send(email.Message{
					To:      userEmail,
					Subject: fmt.Sprintf("[OrbisPM] %s", p.Title),
					Body:    htmlBody,
				}); sendErr != nil {
					log.Error().Err(sendErr).Str("to", userEmail).Msg("failed to send notification email")
					// Don't fail the task — in-app notification was already created
				} else {
					log.Debug().Str("to", userEmail).Str("type", p.Type).Msg("notification email sent")
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

	meiliURL := "http://meilisearch:7700"
	url := fmt.Sprintf("%s/indexes/%s/documents", meiliURL, p.Index)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

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

	meiliURL := "http://meilisearch:7700"
	url := fmt.Sprintf("%s/indexes/%s/documents/%s", meiliURL, p.Index, p.DocID)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
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
