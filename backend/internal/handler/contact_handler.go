package handler

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/rs/zerolog/log"
)

type ContactHandler struct {
	repo *repository.ContactRepo
}

func NewContactHandler(repo *repository.ContactRepo) *ContactHandler {
	return &ContactHandler{repo: repo}
}

func (h *ContactHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Submit)
	return r
}

type contactRequest struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Company string `json:"company"`
	Message string `json:"message"`
}

// Submit godoc
// @Summary Submit a contact form
// @Description Public endpoint to submit a contact inquiry (no auth required)
// @Tags Contact
// @Accept json
// @Produce json
// @Param body body contactRequest true "Contact form"
// @Success 201 {object} map[string]string
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/public/contact [post]
func (h *ContactHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var req contactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}

	// Validate required fields
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(req.Email)
	req.Company = strings.TrimSpace(req.Company)
	req.Message = strings.TrimSpace(req.Message)

	if req.Name == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "name is required"})
		return
	}
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "valid email is required"})
		return
	}
	if req.Message == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "message is required"})
		return
	}

	// Length limits
	if len(req.Name) > 200 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "name too long (max 200 characters)"})
		return
	}
	if len(req.Email) > 320 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "email too long"})
		return
	}
	if len(req.Message) > 5000 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "message too long (max 5000 characters)"})
		return
	}
	if len(req.Company) > 200 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "company name too long (max 200 characters)"})
		return
	}

	// Extract client IP
	ip := clientIP(r)

	cs, err := h.repo.Create(r.Context(), req.Name, req.Email, req.Company, req.Message, ip)
	if err != nil {
		log.Error().Err(err).Msg("failed to save contact submission")
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to save your message"})
		return
	}

	JSON(w, http.StatusCreated, map[string]string{
		"id":      cs.ID.String(),
		"message": "Thank you! We'll get back to you soon.",
	})
}

func clientIP(r *http.Request) string {
	// Check X-Forwarded-For (first entry)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		ip := strings.TrimSpace(parts[0])
		if net.ParseIP(ip) != nil {
			return ip
		}
	}
	// Check X-Real-IP
	if xri := r.Header.Get("X-Real-Ip"); xri != "" {
		if net.ParseIP(xri) != nil {
			return xri
		}
	}
	// Fall back to RemoteAddr
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
