// Package evaluator provides log alert evaluation
package evaluator

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/rs/zerolog/log"
)

// LogEvaluator evaluates Loki log-based alerts
type LogEvaluator struct {
	lokiURL string
	client  *http.Client
	rules   []LogAlertRule
}

// LogAlertRule defines a log-based alert rule
type LogAlertRule struct {
	Name       string
	Query      string // LogQL query
	Threshold  int    // Number of matches to trigger
	Severity   string
	Window     time.Duration
}

// NewLogEvaluator creates a new log evaluator
func NewLogEvaluator(lokiURL string) *LogEvaluator {
	return &LogEvaluator{
		lokiURL: lokiURL,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		// Default log alert rules
		rules: []LogAlertRule{
			{
				Name:      "ErrorSpike",
				Query:     `count_over_time({level="error"}[5m])`,
				Threshold: 50,
				Severity:  "warning",
				Window:    5 * time.Minute,
			},
			{
				Name:      "PanicDetected",
				Query:     `count_over_time({level="fatal"} |= "panic"[5m])`,
				Threshold: 1,
				Severity:  "critical",
				Window:    5 * time.Minute,
			},
			{
				Name:      "AuthFailureSpike",
				Query:     `count_over_time({service="orbispm-api"} |= "authentication failed"[5m])`,
				Threshold: 20,
				Severity:  "warning",
				Window:    5 * time.Minute,
			},
			{
				Name:      "DatabaseError",
				Query:     `count_over_time({service="orbispm-api"} |= "database error"[5m])`,
				Threshold: 10,
				Severity:  "critical",
				Window:    5 * time.Minute,
			},
		},
	}
}

// LokiQueryResponse represents a Loki query response
type LokiQueryResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  []interface{}     `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

// Evaluate checks all log alert rules
func (e *LogEvaluator) Evaluate(ctx context.Context) ([]Alert, error) {
	var alerts []Alert

	for _, rule := range e.rules {
		count, err := e.queryLoki(ctx, rule.Query)
		if err != nil {
			log.Error().Err(err).Str("rule", rule.Name).Msg("Failed to evaluate log rule")
			continue
		}

		if count >= rule.Threshold {
			alert := Alert{
				Name:     rule.Name,
				Severity: rule.Severity,
				Status:   "firing",
				Labels: map[string]string{
					"alertname": rule.Name,
					"severity":  rule.Severity,
					"type":      "log",
				},
				Annotations: map[string]string{
					"summary":     fmt.Sprintf("Log alert: %s triggered", rule.Name),
					"description": fmt.Sprintf("Detected %d matches (threshold: %d) in the last %s", count, rule.Threshold, rule.Window),
					"query":       rule.Query,
				},
				StartsAt:    time.Now(),
				Fingerprint: generateFingerprint(map[string]string{"alertname": rule.Name, "type": "log"}),
			}
			alerts = append(alerts, alert)
		}
	}

	log.Debug().Int("log_alerts", len(alerts)).Msg("Log evaluation complete")
	return alerts, nil
}

// queryLoki executes a LogQL query and returns the count
func (e *LogEvaluator) queryLoki(ctx context.Context, query string) (int, error) {
	queryURL := fmt.Sprintf("%s/loki/api/v1/query", e.lokiURL)

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
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("loki returned %d: %s", resp.StatusCode, string(body))
	}

	var lokiResp LokiQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&lokiResp); err != nil {
		return 0, fmt.Errorf("decoding response: %w", err)
	}

	if lokiResp.Status != "success" {
		return 0, fmt.Errorf("loki returned status: %s", lokiResp.Status)
	}

	// Extract count from result
	if len(lokiResp.Data.Result) > 0 && len(lokiResp.Data.Result[0].Value) >= 2 {
		if valueStr, ok := lokiResp.Data.Result[0].Value[1].(string); ok {
			var count int
			fmt.Sscanf(valueStr, "%d", &count)
			return count, nil
		}
	}

	return 0, nil
}
