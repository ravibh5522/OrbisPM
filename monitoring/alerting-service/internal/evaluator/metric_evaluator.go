// Package evaluator provides metric alert evaluation
package evaluator

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/rs/zerolog/log"
)

// MetricEvaluator evaluates Prometheus metric-based alerts
type MetricEvaluator struct {
	prometheusURL string
	client        *http.Client
}

// NewMetricEvaluator creates a new metric evaluator
func NewMetricEvaluator(prometheusURL string) *MetricEvaluator {
	return &MetricEvaluator{
		prometheusURL: prometheusURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// PrometheusAlertsResponse represents the Prometheus alerts API response
type PrometheusAlertsResponse struct {
	Status string `json:"status"`
	Data   struct {
		Alerts []struct {
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
			State       string            `json:"state"`
			ActiveAt    time.Time         `json:"activeAt"`
			Value       string            `json:"value"`
		} `json:"alerts"`
	} `json:"data"`
}

// Evaluate fetches firing alerts from Prometheus
func (e *MetricEvaluator) Evaluate(ctx context.Context) ([]Alert, error) {
	// Query Prometheus alerts API
	alertsURL := fmt.Sprintf("%s/api/v1/alerts", e.prometheusURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, alertsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching alerts: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("prometheus returned %d: %s", resp.StatusCode, string(body))
	}

	var promResp PrometheusAlertsResponse
	if err := json.NewDecoder(resp.Body).Decode(&promResp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	if promResp.Status != "success" {
		return nil, fmt.Errorf("prometheus returned status: %s", promResp.Status)
	}

	// Convert to our Alert type
	var alerts []Alert
	for _, promAlert := range promResp.Data.Alerts {
		if promAlert.State != "firing" {
			continue
		}

		alert := Alert{
			Name:        promAlert.Labels["alertname"],
			Severity:    promAlert.Labels["severity"],
			Status:      "firing",
			Labels:      promAlert.Labels,
			Annotations: promAlert.Annotations,
			StartsAt:    promAlert.ActiveAt,
			Fingerprint: generateFingerprint(promAlert.Labels),
		}
		alerts = append(alerts, alert)
	}

	log.Debug().Int("firing_alerts", len(alerts)).Msg("Metric evaluation complete")
	return alerts, nil
}

// QueryInstant performs an instant query against Prometheus
func (e *MetricEvaluator) QueryInstant(ctx context.Context, query string) (float64, error) {
	queryURL := fmt.Sprintf("%s/api/v1/query", e.prometheusURL)

	params := url.Values{}
	params.Set("query", query)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, queryURL+"?"+params.Encode(), nil)
	if err != nil {
		return 0, fmt.Errorf("creating request: %w", err)
	}

	resp, err := e.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("executing query: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("prometheus returned %d", resp.StatusCode)
	}

	var result struct {
		Status string `json:"status"`
		Data   struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Value []interface{} `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decoding response: %w", err)
	}

	if result.Status != "success" || len(result.Data.Result) == 0 {
		return 0, nil
	}

	// Extract value
	if len(result.Data.Result[0].Value) >= 2 {
		if valueStr, ok := result.Data.Result[0].Value[1].(string); ok {
			var value float64
			fmt.Sscanf(valueStr, "%f", &value)
			return value, nil
		}
	}

	return 0, nil
}

func generateFingerprint(labels map[string]string) string {
	data, _ := json.Marshal(labels)
	hash := sha256.Sum256(data)
	return fmt.Sprintf("%x", hash[:8])
}
