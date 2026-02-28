package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/auth"
)

// AuthHandler handles authentication endpoints (GoTrue proxy).
type AuthHandler struct {
	goTrue *auth.GoTrueClient
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(goTrue *auth.GoTrueClient) *AuthHandler {
	return &AuthHandler{goTrue: goTrue}
}

// Routes registers auth routes.
func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/signup", h.SignUp)
	r.Post("/login", h.Login)
	r.Post("/refresh", h.Refresh)
	r.Post("/logout", h.Logout)
	r.Get("/user", h.GetUser)
	return r
}

type signupRequest struct {
	Email    string         `json:"email" validate:"required,email"`
	Password string         `json:"password" validate:"required,min=8"`
	Name     string         `json:"name,omitempty"`
	Data     map[string]any `json:"data,omitempty"`
}

func (h *AuthHandler) SignUp(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	data := req.Data
	if data == nil {
		data = map[string]any{}
	}
	if req.Name != "" {
		data["name"] = req.Name
	}

	result, err := h.goTrue.SignUp(r.Context(), auth.SignUpRequest{
		Email:    req.Email,
		Password: req.Password,
		Data:     data,
	})
	if err != nil {
		handleGoTrueError(w, err)
		return
	}
	JSON(w, http.StatusCreated, result)
}

type loginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	result, err := h.goTrue.SignIn(r.Context(), req.Email, req.Password)
	if err != nil {
		handleGoTrueError(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	result, err := h.goTrue.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		handleGoTrueError(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}

	if err := h.goTrue.Logout(r.Context(), token); err != nil {
		handleGoTrueError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}

	user, err := h.goTrue.GetUser(r.Context(), token)
	if err != nil {
		handleGoTrueError(w, err)
		return
	}
	JSON(w, http.StatusOK, user)
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

func handleGoTrueError(w http.ResponseWriter, err error) {
	if gotrueErr, ok := err.(*auth.GoTrueError); ok {
		code := gotrueErr.Code
		if code == 0 {
			code = http.StatusInternalServerError
		}
		JSON(w, code, ErrorResponse{Message: gotrueErr.Error()})
		return
	}
	JSON(w, http.StatusBadGateway, ErrorResponse{Message: "auth service error", Detail: err.Error()})
}
