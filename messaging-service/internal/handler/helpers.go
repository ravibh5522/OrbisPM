package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
)

// ErrorResponse represents a standard error response.
type ErrorResponse struct {
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

// JSON sends a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Error().Err(err).Msg("failed to encode response")
		}
	}
}

// Error sends a JSON error response, mapping domain errors to HTTP status codes.
func Error(w http.ResponseWriter, r *http.Request, err error) {
	if appErr, ok := domain.IsAppError(err); ok {
		JSON(w, appErr.Code, ErrorResponse{Message: appErr.Message, Detail: appErr.Detail})
		return
	}
	log.Error().Err(err).Str("method", r.Method).Str("path", r.URL.Path).Msg("unhandled error")
	JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "internal server error"})
}

// ListResponse wraps a list with pagination metadata.
type ListResponse struct {
	Data   any `json:"data"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

func mustMarshal(v any) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}

func parseBody(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}
