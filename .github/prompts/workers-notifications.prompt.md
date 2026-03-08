---
applyTo: "backend/internal/worker/**,backend/internal/notification/**"
---

# Background Workers & Notifications — OrbisPM

You are working on Asynq background workers and the notification system.

## Asynq Worker Architecture

### Task Type Naming
Format: `module:action` — e.g., `email:send`, `ai:review_task`, `import:process`

### Task Registration
```go
// internal/worker/router.go
func NewRouter(deps Dependencies) *asynq.ServeMux {
    mux := asynq.NewServeMux()
    mux.HandleFunc("email:send", deps.EmailWorker.Handle)
    mux.HandleFunc("push:send", deps.PushWorker.Handle)
    mux.HandleFunc("slack:notify", deps.SlackWorker.Handle)
    mux.HandleFunc("discord:notify", deps.DiscordWorker.Handle)
    mux.HandleFunc("teams:notify", deps.TeamsWorker.Handle)
    mux.HandleFunc("webhook:deliver", deps.WebhookWorker.Handle)
    mux.HandleFunc("import:process", deps.ImportWorker.Handle)
    mux.HandleFunc("export:generate", deps.ExportWorker.Handle)
    mux.HandleFunc("search:index", deps.SearchIndexWorker.Handle)
    mux.HandleFunc("ai:review_task", deps.AIReviewWorker.Handle)
    return mux
}
```

### Worker Pattern
```go
func (w *EmailWorker) Handle(ctx context.Context, t *asynq.Task) error {
    var payload EmailPayload
    if err := json.Unmarshal(t.Payload(), &payload); err != nil {
        return fmt.Errorf("unmarshal email payload: %w", err)
    }
    // Send email
    if err := w.sender.Send(ctx, payload.To, payload.Subject, payload.Body); err != nil {
        return fmt.Errorf("send email: %w", err) // Asynq will retry
    }
    return nil
}
```

### Worker Rules
- ALWAYS set task timeout: `asynq.Timeout(30 * time.Second)`
- ALWAYS set max retries: `asynq.MaxRetry(3)`
- ALWAYS use exponential backoff for retryable failures
- Return `nil` for success, `error` for retry, `asynq.SkipRetry` for permanent failure
- Log with `zerolog` including task type and payload ID for tracing
- Use priority queues: `critical` (notifications), `default` (imports), `low` (AI, exports)

## Notification Dispatch

### Flow
```
Event Occurs (e.g., task assigned)
    │
    ▼
notification.Dispatcher.Send(ctx, event)
    │
    ├── Check user preferences (notification_preferences table)
    ├── For enabled channels:
    │   ├── in_app  → Insert into notifications table + WebSocket push
    │   ├── email   → Enqueue asynq job: email:send
    │   ├── slack   → Enqueue asynq job: slack:notify
    │   ├── discord → Enqueue asynq job: discord:notify
    │   ├── teams   → Enqueue asynq job: teams:notify
    │   └── push    → Enqueue asynq job: push:send
    └── Return
```

### Rules
- ALWAYS check user notification preferences before sending
- In-app notifications are delivered synchronously (DB insert + WebSocket)
- ALL other channels are dispatched via Asynq (async)
- Email templates: Go html/template in `internal/notification/templates/`
- Slack/Discord/Teams: use incoming webhook URLs stored per org
- Mobile push: use FCM for Android + APNs for iOS via google/go-fcm
- Deduplicate: don't send same notification twice within 5 minutes
- Batch: aggregate multiple events of same type within 30s window for email digest
