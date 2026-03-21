// Package handler provides HTTP handlers for the super admin service
package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/monitoring-super-admin/internal/config"
)

// AlertsHandler handles alerts endpoints
type AlertsHandler struct {
	cfg    *config.Config
	client *http.Client
}

// NewAlertsHandler creates a new alerts handler
func NewAlertsHandler(cfg *config.Config) *AlertsHandler {
	return &AlertsHandler{
		cfg: cfg,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Alert represents an alert
type Alert struct {
	Fingerprint string            `json:"fingerprint"`
	Status      string            `json:"status"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	StartsAt    time.Time         `json:"startsAt"`
	EndsAt      *time.Time        `json:"endsAt,omitempty"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

// AlertsResponse represents the alerts list response
type AlertsResponse struct {
	Timestamp time.Time `json:"timestamp"`
	Alerts    []Alert   `json:"alerts"`
	Summary   struct {
		Total    int `json:"total"`
		Firing   int `json:"firing"`
		Resolved int `json:"resolved"`
	} `json:"summary"`
}

// List returns all alerts
func (h *AlertsHandler) List(w http.ResponseWriter, r *http.Request) {
	url := h.cfg.AlertmanagerURL + "/api/v2/alerts"

	resp, err := h.client.Get(url)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch alerts from Alertmanager")
		http.Error(w, `{"error":"failed to fetch alerts"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read response"}`, http.StatusInternalServerError)
		return
	}

	var alerts []Alert
	if err := json.Unmarshal(body, &alerts); err != nil {
		// Return empty list on parse error
		alerts = []Alert{}
	}

	response := AlertsResponse{
		Timestamp: time.Now(),
		Alerts:    alerts,
	}

	// Calculate summary
	for _, alert := range alerts {
		response.Summary.Total++
		if alert.Status == "firing" {
			response.Summary.Firing++
		} else {
			response.Summary.Resolved++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Active returns only active/firing alerts
func (h *AlertsHandler) Active(w http.ResponseWriter, r *http.Request) {
	url := h.cfg.AlertmanagerURL + "/api/v2/alerts?active=true"

	resp, err := h.client.Get(url)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch active alerts")
		http.Error(w, `{"error":"failed to fetch alerts"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read response"}`, http.StatusInternalServerError)
		return
	}

	var alerts []Alert
	if err := json.Unmarshal(body, &alerts); err != nil {
		alerts = []Alert{}
	}

	// Group by severity
	grouped := map[string][]Alert{
		"critical": {},
		"warning":  {},
		"info":     {},
	}

	for _, alert := range alerts {
		severity := alert.Labels["severity"]
		if severity == "" {
			severity = "info"
		}
		grouped[severity] = append(grouped[severity], alert)
	}

	response := map[string]interface{}{
		"timestamp": time.Now(),
		"alerts":    grouped,
		"counts": map[string]int{
			"critical": len(grouped["critical"]),
			"warning":  len(grouped["warning"]),
			"info":     len(grouped["info"]),
			"total":    len(alerts),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// History returns alert history from Prometheus
func (h *AlertsHandler) History(w http.ResponseWriter, r *http.Request) {
	// In a full implementation, this would query ClickHouse for historical alerts
	// For now, we return a placeholder

	timeRange := r.URL.Query().Get("range")
	if timeRange == "" {
		timeRange = "24h"
	}

	response := map[string]interface{}{
		"timestamp":  time.Now(),
		"range":      timeRange,
		"alerts":     []Alert{},
		"message":    "Historical alerts from ClickHouse - placeholder",
		"pagination": map[string]int{"page": 1, "per_page": 50, "total": 0},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Silence creates a silence for an alert
func (h *AlertsHandler) Silence(w http.ResponseWriter, r *http.Request) {
	fingerprint := chi.URLParam(r, "fingerprint")
	if fingerprint == "" {
		http.Error(w, `{"error":"fingerprint is required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Duration string `json:"duration"`
		Comment  string `json:"comment"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Duration == "" {
		req.Duration = "1h"
	}

	duration, err := time.ParseDuration(req.Duration)
	if err != nil {
		http.Error(w, `{"error":"invalid duration format"}`, http.StatusBadRequest)
		return
	}

	// Create silence in Alertmanager
	silence := map[string]interface{}{
		"matchers": []map[string]interface{}{
			{"name": "fingerprint", "value": fingerprint, "isRegex": false},
		},
		"startsAt":  time.Now().Format(time.RFC3339),
		"endsAt":    time.Now().Add(duration).Format(time.RFC3339),
		"createdBy": "super-admin",
		"comment":   req.Comment,
	}

	silenceJSON, _ := json.Marshal(silence)

	resp, err := h.client.Post(
		h.cfg.AlertmanagerURL+"/api/v2/silences",
		"application/json",
		nil,
	)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create silence")
		http.Error(w, `{"error":"failed to create silence"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	response := map[string]interface{}{
		"success":     true,
		"fingerprint": fingerprint,
		"silence":     silence,
		"raw":         string(silenceJSON),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
