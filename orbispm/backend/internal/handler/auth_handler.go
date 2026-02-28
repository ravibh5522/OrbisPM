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

// SignUp godoc
// @Summary Register a new user
// @Description Create a new user account via GoTrue
// @Tags Auth
// @Accept json
// @Produce json
// @Param body body signupRequest true "Signup credentials"
// @Success 201 {object} map[string]interface{} "access_token, refresh_token, user"
// @Failure 400 {object} ErrorResponse
// @Failure 422 {object} ErrorResponse
// @Router /auth/signup [post]
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

// Login godoc
// @Summary User login
// @Description Authenticate a user and receive tokens
// @Tags Auth
// @Accept json
// @Produce json
// @Param body body loginRequest true "Login credentials"
// @Success 200 {object} map[string]interface{} "access_token, refresh_token"
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /auth/login [post]
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

// Refresh godoc
// @Summary Refresh access token
// @Description Exchange a refresh token for a new access token
// @Tags Auth
// @Accept json
// @Produce json
// @Param body body refreshRequest true "Refresh token"
// @Success 200 {object} map[string]interface{} "access_token, refresh_token"
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /auth/refresh [post]
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

// Logout godoc
// @Summary User logout
// @Description Invalidate the current session
// @Tags Auth
// @Produce json
// @Security BearerAuth
// @Success 204 "No Content"
// @Failure 401 {object} ErrorResponse
// @Router /auth/logout [post]
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

// GetUser godoc
// @Summary Get current user
// @Description Retrieve the authenticated user's profile
// @Tags Auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} ErrorResponse
// @Router /auth/user [get]
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
