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
)

// Handlers holds dependencies for task handler functions.
type Handlers struct {
	Pool *pgxpool.Pool
}

// RegisterAll registers all task handlers on the mux.
func (h *Handlers) RegisterAll(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeActivityLog, h.HandleActivityLog)
	mux.HandleFunc(TypeNotification, h.HandleNotification)
	mux.HandleFunc(TypeSearchIndex, h.HandleSearchIndex)
	mux.HandleFunc(TypeSearchDelete, h.HandleSearchDelete)
	mux.HandleFunc(TypeWebhookDeliver, h.HandleWebhookDeliver)
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

// HandleNotification inserts a notification for a user.
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

	_, err = h.Pool.Exec(ctx,
		`INSERT INTO notifications (id, user_id, org_id, type, title, body, payload, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		uuid.New(), userID, orgID, p.Type, p.Title, p.Body, p.Payload, time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("insert notification: %w", err)
	}

	log.Debug().Str("type", p.Type).Str("user_id", p.UserID).Msg("notification created")
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
