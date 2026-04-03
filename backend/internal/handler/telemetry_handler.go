package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/metrics"
)

// TelemetryHandler receives frontend telemetry events and records them as Prometheus metrics.
type TelemetryHandler struct{}

func NewTelemetryHandler() *TelemetryHandler {
	return &TelemetryHandler{}
}

// Routes registers telemetry routes. Mounted under /api/v1/telemetry.
func (h *TelemetryHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/events", h.IngestEvents)
	return r
}

type telemetryEvent struct {
	Type    string  `json:"type"`
	Path    string  `json:"path,omitempty"`
	Feature string  `json:"feature,omitempty"`
	Action  string  `json:"action,omitempty"`
	ErrType string  `json:"error_type,omitempty"`
	Value   float64 `json:"value,omitempty"`
}

type telemetryPayload struct {
	Events []telemetryEvent `json:"events"`
}

// IngestEvents receives a batch of analytics events from the frontend.
func (h *TelemetryHandler) IngestEvents(w http.ResponseWriter, r *http.Request) {
	var payload telemetryPayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if len(payload.Events) > 100 {
		http.Error(w, "too many events", http.StatusBadRequest)
		return
	}

	for _, e := range payload.Events {
		switch e.Type {
		case "page_view":
			if e.Path != "" {
				metrics.PageViewsTotal.WithLabelValues(sanitizeTelemetryPath(e.Path)).Inc()
			}
		case "feature_usage":
			if e.Feature != "" {
				action := e.Action
				if action == "" {
					action = "click"
				}
				metrics.FeatureUsageTotal.WithLabelValues(e.Feature, action).Inc()
			}
		case "error":
			if e.ErrType != "" {
				metrics.FrontendErrorsTotal.WithLabelValues(e.ErrType).Inc()
			}
		case "session_end":
			if e.Value > 0 {
				metrics.SessionDurationSeconds.Observe(e.Value)
			}
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// sanitizeTelemetryPath limits cardinality by truncating long paths.
func sanitizeTelemetryPath(p string) string {
	if len(p) > 200 {
		p = p[:200]
	}
	return p
}
