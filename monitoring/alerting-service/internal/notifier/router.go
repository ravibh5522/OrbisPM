package notifier

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/orbispm/monitoring-alerting/internal/evaluator"
)

// Router sends alerts to Alertmanager
type Router struct {
	alertmanagerURL string
	httpClient      *http.Client
}

// NewRouter creates a new alert router
func NewRouter(alertmanagerURL string) *Router {
	return &Router{
		alertmanagerURL: alertmanagerURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// AlertmanagerAlert represents an alert in Alertmanager format
type AlertmanagerAlert struct {
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	StartsAt    time.Time         `json:"startsAt"`
	EndsAt      time.Time         `json:"endsAt,omitempty"`
}

// Send sends a single alert to Alertmanager
func (r *Router) Send(ctx context.Context, alert evaluator.Alert) error {
	// Convert to Alertmanager format
	alertmanagerAlert := AlertmanagerAlert{
		Labels:      alert.Labels,
		Annotations: alert.Annotations,
		StartsAt:    alert.StartsAt,
		EndsAt:      alert.EndsAt,
	}

	// Ensure required labels
	if alertmanagerAlert.Labels == nil {
		alertmanagerAlert.Labels = make(map[string]string)
	}
	alertmanagerAlert.Labels["alertname"] = alert.Name
	alertmanagerAlert.Labels["severity"] = alert.Severity
	alertmanagerAlert.Labels["instance"] = "monitoring-alerting"

	// Ensure annotations exist
	if alertmanagerAlert.Annotations == nil {
		alertmanagerAlert.Annotations = make(map[string]string)
	}
	if alertmanagerAlert.Annotations["summary"] == "" {
		alertmanagerAlert.Annotations["summary"] = fmt.Sprintf("Alert: %s", alert.Name)
	}

	// Send as array (Alertmanager expects array)
	alerts := []AlertmanagerAlert{alertmanagerAlert}

	payload, err := json.Marshal(alerts)
	if err != nil {
		return fmt.Errorf("failed to marshal alert: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/alerts", r.alertmanagerURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send alert: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("alertmanager returned status %d", resp.StatusCode)
	}

	log.Debug().Str("alert", alert.Name).Msg("Alert sent to Alertmanager")
	return nil
}