package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
)

var validate = validator.New()

// parseBody decodes JSON body and validates it.
func parseBody(r *http.Request, dst any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if err := json.Unmarshal(body, dst); err != nil {
		return err
	}
	return validate.Struct(dst)
}

// uuidParam extracts a UUID from URL params.
func uuidParam(r *http.Request, name string) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, name))
}

// queryInt extracts an int from query params, with a default.
func queryInt(r *http.Request, name string, defaultVal int) int {
	s := r.URL.Query().Get(name)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return v
}

// queryStr extracts a string from query params.
func queryStr(r *http.Request, name string) *string {
	s := r.URL.Query().Get(name)
	if s == "" {
		return nil
	}
	return &s
}

// queryUUID extracts a UUID from query params.
func queryUUID(r *http.Request, name string) *uuid.UUID {
	s := r.URL.Query().Get(name)
	if s == "" {
		return nil
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return nil
	}
	return &id
}
