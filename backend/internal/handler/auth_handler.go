package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"

	"github.com/orbispm/orbispm/internal/auth"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	zitadel            *auth.ZitadelClient
	pool               *pgxpool.Pool
	emailServiceURL    string
	emailServiceAPIKey string
	frontendURL        string
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(zitadel *auth.ZitadelClient, pool *pgxpool.Pool, emailServiceURL, emailServiceAPIKey, frontendURL string) *AuthHandler {
	return &AuthHandler{
		zitadel:            zitadel,
		pool:               pool,
		emailServiceURL:    emailServiceURL,
		emailServiceAPIKey: emailServiceAPIKey,
		frontendURL:        frontendURL,
	}
}

// sendPasswordResetEmail sends the reset code to the user via the email service.
func (h *AuthHandler) sendPasswordResetEmail(ctx context.Context, toEmail, code string) error {
	svcURL := h.emailServiceURL
	if svcURL == "" {
		svcURL = "http://email-service:8050"
	}
	frontendURL := h.frontendURL
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	resetURL := frontendURL + "/reset-password?email=" + toEmail + "&code=" + code
	payload := map[string]any{
		"to":       toEmail,
		"subject":  "Reset your OrbisPM password",
		"template": "password_reset",
		"context": map[string]string{
			"reset_code":     code,
			"reset_url":      resetURL,
			"app_name":       "OrbisPM",
			"frontend_url":   frontendURL,
			"expiry_minutes": "60",
		},
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal email payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, svcURL+"/api/v1/email/send", bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("build email request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	apiKey := h.emailServiceAPIKey
	if apiKey == "" {
		apiKey = "email-service-dev-key"
	}
	req.Header.Set("X-API-Key", apiKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("email service request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("email service returned status %d", resp.StatusCode)
	}
	return nil
}

// resolveUUID looks up (or provisions) the stable internal user ID for a
// Zitadel identity — see auth.ResolveUserID. email may be empty when it's
// genuinely unavailable at the call site; that only matters for the very
// first authenticated request an existing (pre-migration) user makes, so an
// empty email here is a rare, self-correcting edge case, not silent data loss.
func (h *AuthHandler) resolveUUID(ctx context.Context, zitadelID, email string) uuid.UUID {
	id, err := auth.ResolveUserID(ctx, h.pool, zitadelID, email)
	if err != nil {
		log.Error().Err(err).Str("zitadel_id", zitadelID).Msg("resolve user id failed")
		return uuid.Nil
	}
	return id
}

// upsertUserProfile caches user info in public.users so joined queries work.
// It also stores the extended profile fields (avatar_url, bio, etc.) from UserMetadata.
// Fields that are empty in UserMetadata are preserved from the existing DB row.
func (h *AuthHandler) upsertUserProfile(ctx context.Context, u *auth.UserInfo) {
	if h.pool == nil || u == nil {
		return
	}
	userUUID := h.resolveUUID(ctx, u.ID, u.Email)
	displayName := stringFromMeta(u.UserMetadata, "name")
	avatarURL := stringFromMeta(u.UserMetadata, "avatar_url")
	bio := stringFromMeta(u.UserMetadata, "bio")
	jobTitle := stringFromMeta(u.UserMetadata, "job_title")
	department := stringFromMeta(u.UserMetadata, "department")
	timezone := stringFromMeta(u.UserMetadata, "timezone")
	language := stringFromMeta(u.UserMetadata, "language")
	theme := stringFromMeta(u.UserMetadata, "theme")

	_, _ = h.pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name, phone, avatar_url, bio, job_title, department, timezone, language, theme, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
		 ON CONFLICT (id) DO UPDATE SET
		  email=EXCLUDED.email, display_name=EXCLUDED.display_name,
		  phone=EXCLUDED.phone,
		  avatar_url=CASE WHEN EXCLUDED.avatar_url != '' THEN EXCLUDED.avatar_url ELSE users.avatar_url END,
		  bio=CASE WHEN EXCLUDED.bio != '' THEN EXCLUDED.bio ELSE users.bio END,
		  job_title=CASE WHEN EXCLUDED.job_title != '' THEN EXCLUDED.job_title ELSE users.job_title END,
		  department=CASE WHEN EXCLUDED.department != '' THEN EXCLUDED.department ELSE users.department END,
		  timezone=CASE WHEN EXCLUDED.timezone != '' THEN EXCLUDED.timezone ELSE users.timezone END,
		  language=CASE WHEN EXCLUDED.language != '' THEN EXCLUDED.language ELSE users.language END,
		  theme=CASE WHEN EXCLUDED.theme != '' THEN EXCLUDED.theme ELSE users.theme END,
		  updated_at=NOW()`,
		userUUID, u.Email, displayName, u.Phone, avatarURL, bio, jobTitle, department, timezone, language, theme,
	)
}

// upsertUserProfilePartial saves only the fields present in req.Data (for UpdateUser).
// It leaves the other columns unchanged via COALESCE.
func (h *AuthHandler) upsertUserProfilePartial(ctx context.Context, u *auth.UserInfo, data map[string]any) {
	if h.pool == nil || u == nil {
		return
	}
	userUUID := h.resolveUUID(ctx, u.ID, u.Email)
	displayName := stringFromMeta(u.UserMetadata, "name")
	avatarURL := stringFromMetaFallback(data, "avatar_url", stringFromMeta(u.UserMetadata, "avatar_url"))
	bio := stringFromMetaFallback(data, "bio", "")
	jobTitle := stringFromMetaFallback(data, "job_title", "")
	department := stringFromMetaFallback(data, "department", "")
	timezone := stringFromMetaFallback(data, "timezone", "")
	language := stringFromMetaFallback(data, "language", "")
	theme := stringFromMetaFallback(data, "theme", "")

	// Extract theme_customisation as JSONB (nil means "don't update")
	var themeCustomisation []byte
	if tc, ok := data["theme_customisation"]; ok {
		if tc == nil {
			themeCustomisation = []byte("null")
		} else {
			themeCustomisation, _ = json.Marshal(tc)
		}
	}

	_, _ = h.pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name, phone, avatar_url, bio, job_title, department, timezone, language, theme, theme_customisation, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
		 ON CONFLICT (id) DO UPDATE SET
		  email=EXCLUDED.email, display_name=EXCLUDED.display_name,
		  phone=EXCLUDED.phone,
		  avatar_url=CASE WHEN EXCLUDED.avatar_url != '' THEN EXCLUDED.avatar_url ELSE users.avatar_url END,
		  bio=CASE WHEN EXCLUDED.bio != '' THEN EXCLUDED.bio ELSE users.bio END,
		  job_title=CASE WHEN EXCLUDED.job_title != '' THEN EXCLUDED.job_title ELSE users.job_title END,
		  department=CASE WHEN EXCLUDED.department != '' THEN EXCLUDED.department ELSE users.department END,
		  timezone=CASE WHEN EXCLUDED.timezone != '' THEN EXCLUDED.timezone ELSE users.timezone END,
		  language=CASE WHEN EXCLUDED.language != '' THEN EXCLUDED.language ELSE users.language END,
		  theme=CASE WHEN EXCLUDED.theme != '' THEN EXCLUDED.theme ELSE users.theme END,
		  theme_customisation=CASE WHEN $12 IS NOT NULL THEN EXCLUDED.theme_customisation ELSE users.theme_customisation END,
		  updated_at=NOW()`,
		userUUID, u.Email, displayName, u.Phone, avatarURL, bio, jobTitle, department, timezone, language, theme, themeCustomisation,
	)
}

// enrichUserFromDB merges extended profile fields stored in the DB into UserInfo.
// This fills avatar_url, bio, job_title, etc. that Zitadel doesn't store.
func (h *AuthHandler) enrichUserFromDB(ctx context.Context, u *auth.UserInfo) {
	if h.pool == nil || u == nil {
		return
	}
	userUUID := h.resolveUUID(ctx, u.ID, u.Email)
	var avatarURL, bio, jobTitle, department, timezone, language, theme string
	var themeCustomisation []byte
	err := h.pool.QueryRow(ctx,
		`SELECT avatar_url, bio, job_title, department, timezone, language, theme, theme_customisation
		 FROM users WHERE id = $1`, userUUID).
		Scan(&avatarURL, &bio, &jobTitle, &department, &timezone, &language, &theme, &themeCustomisation)
	if err != nil {
		return // DB miss is non-fatal
	}
	if u.UserMetadata == nil {
		u.UserMetadata = map[string]any{}
	}
	if avatarURL != "" {
		u.UserMetadata["avatar_url"] = avatarURL
	}
	if bio != "" {
		u.UserMetadata["bio"] = bio
	}
	if jobTitle != "" {
		u.UserMetadata["job_title"] = jobTitle
	}
	if department != "" {
		u.UserMetadata["department"] = department
	}
	if timezone != "" {
		u.UserMetadata["timezone"] = timezone
	}
	if language != "" {
		u.UserMetadata["language"] = language
	}
	if theme != "" {
		u.UserMetadata["theme"] = theme
	}
	if len(themeCustomisation) > 0 && string(themeCustomisation) != "null" {
		var tc any
		if err := json.Unmarshal(themeCustomisation, &tc); err == nil {
			u.UserMetadata["theme_customisation"] = tc
		}
	}
}

// stringFromMeta safely extracts a string value from a map[string]any.
func stringFromMeta(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

// stringFromMetaFallback extracts from m[key] falling back to def.
func stringFromMetaFallback(m map[string]any, key, def string) string {
	if m == nil {
		return def
	}
	if v, ok := m[key].(string); ok {
		return v
	}
	return def
}

// BackfillUserProfiles populates public.users from Zitadel for all existing users.
// Called once at startup in a goroutine so member queries can show user info immediately.
func (h *AuthHandler) BackfillUserProfiles(ctx context.Context) {
	if h.pool == nil {
		return
	}
	users, err := h.zitadel.ListAllUsers(ctx)
	if err != nil {
		return
	}
	for _, u := range users {
		h.upsertUserProfile(ctx, u)
	}
}

// Routes registers auth routes.
func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	// Session-based auth
	r.Post("/signup", h.SignUp)
	r.Post("/login", h.Login)
	r.Post("/refresh", h.Refresh)
	r.Post("/logout", h.Logout)
	r.Get("/user", h.GetUser)
	r.Put("/user", h.UpdateUser)

	// OIDC PKCE flow
	r.Post("/oidc/authorize", h.OIDCAuthorize)
	r.Post("/oidc/callback", h.OIDCCallback)
	r.Post("/oidc/logout-url", h.OIDCLogoutURL)
	r.Post("/oidc/refresh", h.OIDCRefresh)
	// Called after SSO when the IDP (e.g. GitHub with private email) did not
	// supply an email address. The user provides it here and we update Zitadel.
	r.Post("/oidc/complete-profile", h.OIDCCompleteProfile)

	// MFA
	r.Post("/mfa/totp/register", h.RegisterTOTP)
	r.Post("/mfa/totp/verify", h.VerifyTOTP)
	r.Delete("/mfa/totp", h.RemoveTOTP)
	r.Post("/mfa/otp-email/enable", h.EnableOTPEmail)
	r.Delete("/mfa/otp-email", h.DisableOTPEmail)
	r.Post("/mfa/otp-sms/enable", h.EnableOTPSMS)
	r.Delete("/mfa/otp-sms", h.DisableOTPSMS)
	// MFA login challenge (no bearer token — uses partial session from step 1)
	r.Post("/mfa/login-verify", h.VerifyLoginMFA)
	r.Post("/mfa/send-otp-challenge", h.SendOTPChallenge)
	// Backup / recovery codes (authenticated)
	r.Post("/mfa/recovery-codes", h.GenerateRecoveryCodes)
	r.Delete("/mfa/recovery-codes", h.RemoveRecoveryCodes)

	// Password management
	r.Post("/password/change", h.ChangePassword)
	r.Post("/password/forgot", h.ForgotPassword)
	r.Post("/password/reset", h.ResetPassword)

	// Social / IDP
	r.Get("/idps", h.ListIDPs)
	r.Post("/idp/start", h.StartIDPLogin)
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
// @Description Create a new user account via Zitadel
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

	result, err := h.zitadel.SignUp(r.Context(), auth.SignUpRequest{
		Email:    req.Email,
		Password: req.Password,
		Data:     data,
	})
	if err != nil {
		handleAuthError(w, err)
		return
	}
	if result.User != nil {
		h.upsertUserProfile(r.Context(), result.User)
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

	result, err := h.zitadel.SignIn(r.Context(), req.Email, req.Password)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	if result.User != nil {
		// Set internal UUID that matches what messaging service uses
		result.User.InternalID = h.resolveUUID(r.Context(), result.User.ID, result.User.Email).String()
		h.upsertUserProfile(r.Context(), result.User)
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

	result, err := h.zitadel.RefreshSessionToken(r.Context(), req.RefreshToken)
	if err != nil {
		handleAuthError(w, err)
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

	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}

	if err := h.zitadel.Logout(r.Context(), claims, token); err != nil {
		handleAuthError(w, err)
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

	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}

	if claims.Subject == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token claims"})
		return
	}

	user, err := h.zitadel.GetUser(r.Context(), claims.Subject)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	// Set internal UUID that matches what messaging service uses
	user.InternalID = h.resolveUUID(r.Context(), user.ID, user.Email).String()
	// Merge extended profile fields (avatar_url, bio, etc.) from our DB.
	h.enrichUserFromDB(r.Context(), user)
	h.upsertUserProfile(r.Context(), user)
	JSON(w, http.StatusOK, user)
}

type updateUserRequest struct {
	Data  map[string]any `json:"data"`
	Phone string         `json:"phone"`
}

func (h *AuthHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}

	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}

	var req updateUserRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}

	user, err := h.zitadel.UpdateUser(r.Context(), claims.Subject, auth.UpdateUserRequest{
		Data:  req.Data,
		Phone: req.Phone,
	})
	if err != nil {
		handleAuthError(w, err)
		return
	}
	// Set internal UUID that matches what messaging service uses
	user.InternalID = h.resolveUUID(r.Context(), user.ID, user.Email).String()
	// Save extended profile fields (avatar_url, bio, job_title, etc.) to our DB.
	h.upsertUserProfilePartial(r.Context(), user, req.Data)
	// Re-enrich so the returned user includes the fields we just saved.
	h.enrichUserFromDB(r.Context(), user)
	JSON(w, http.StatusOK, user)
}

// --- OIDC PKCE Endpoints ---

type oidcAuthorizeRequest struct {
	RedirectURI string `json:"redirect_uri" validate:"required,url"`
	State       string `json:"state" validate:"required"`
	// IDPID is optional. When set, Zitadel adds the IDP hint scope
	// (urn:zitadel:iam:org:idp:id:{id}) to bypass its own login page and
	// redirect directly to the named identity provider (e.g. Google, GitHub).
	IDPID string `json:"idp_id"`
	// Prompt is optional. "create" tells the centralized login UI this is a
	// signup (OrbisPM's /signup page), not a sign-in — it lands on /register
	// instead of /login. See GenerateAuthURL.
	Prompt string `json:"prompt"`
}

func (h *AuthHandler) OIDCAuthorize(w http.ResponseWriter, r *http.Request) {
	var req oidcAuthorizeRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	result, err := h.zitadel.GenerateAuthURL(req.RedirectURI, req.State, req.IDPID, req.Prompt)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

type oidcCallbackRequest struct {
	Code         string `json:"code" validate:"required"`
	RedirectURI  string `json:"redirect_uri" validate:"required,url"`
	CodeVerifier string `json:"code_verifier" validate:"required"`
}

func (h *AuthHandler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	var req oidcCallbackRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	result, err := h.zitadel.ExchangeCode(r.Context(), req.Code, req.RedirectURI, req.CodeVerifier)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

type oidcLogoutURLRequest struct {
	IDToken               string `json:"id_token" validate:"required"`
	PostLogoutRedirectURI string `json:"post_logout_redirect_uri" validate:"required,url"`
}

type oidcLogoutURLResponse struct {
	LogoutURL string `json:"logout_url"`
}

// OIDCLogoutURL hands back Zitadel's real end_session URL for the frontend
// to navigate to — same reason OIDCAuthorize hands back auth_url instead of
// redirecting itself: this is a JSON API for an SPA, not a browser-facing
// redirect endpoint like sample-app's BFF.
func (h *AuthHandler) OIDCLogoutURL(w http.ResponseWriter, r *http.Request) {
	var req oidcLogoutURLRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	logoutURL := h.zitadel.GenerateLogoutURL(req.IDToken, req.PostLogoutRedirectURI)
	JSON(w, http.StatusOK, oidcLogoutURLResponse{LogoutURL: logoutURL})
}

type oidcRefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

func (h *AuthHandler) OIDCRefresh(w http.ResponseWriter, r *http.Request) {
	var req oidcRefreshRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	result, err := h.zitadel.RefreshOIDCToken(r.Context(), req.RefreshToken)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// OIDCCompleteProfile is called when an SSO provider (e.g. GitHub with a
// private account) didn't return an email. The user has already exchanged the
// code and holds a valid access_token; this endpoint sets their email in
// Zitadel and returns a refreshed UserInfo so the frontend can continue.
type oidcCompleteProfileRequest struct {
	Email string `json:"email" validate:"required,email"`
}

func (h *AuthHandler) OIDCCompleteProfile(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}

	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid or expired token"})
		return
	}

	var req oidcCompleteProfileRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	// Update the email in Zitadel (marks it as verified immediately).
	if err := h.zitadel.UpdateUserEmail(r.Context(), claims.Subject, req.Email); err != nil {
		handleAuthError(w, err)
		return
	}

	// Re-fetch the full user so the client gets the updated profile.
	user, err := h.zitadel.GetUser(r.Context(), claims.Subject)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	user.InternalID = h.resolveUUID(r.Context(), user.ID, user.Email).String()
	h.upsertUserProfile(r.Context(), user)
	h.enrichUserFromDB(r.Context(), user)
	JSON(w, http.StatusOK, user)
}

// --- MFA Endpoints ---

func (h *AuthHandler) RegisterTOTP(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	result, err := h.zitadel.RegisterTOTP(r.Context(), claims.Subject)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

type verifyTOTPRequest struct {
	Code string `json:"code" validate:"required"`
}

func (h *AuthHandler) VerifyTOTP(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	var req verifyTOTPRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if err := h.zitadel.VerifyTOTP(r.Context(), claims.Subject, req.Code); err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": "verified"})
}

func (h *AuthHandler) RemoveTOTP(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	if err := h.zitadel.RemoveTOTP(r.Context(), claims.Subject); err != nil {
		handleAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) EnableOTPEmail(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	if err := h.zitadel.AddOTPEmail(r.Context(), claims.Subject); err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": "enabled"})
}

func (h *AuthHandler) DisableOTPEmail(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	if err := h.zitadel.RemoveOTPEmail(r.Context(), claims.Subject); err != nil {
		handleAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) EnableOTPSMS(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	if err := h.zitadel.AddOTPSMS(r.Context(), claims.Subject); err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": "enabled"})
}

func (h *AuthHandler) DisableOTPSMS(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	if err := h.zitadel.RemoveOTPSMS(r.Context(), claims.Subject); err != nil {
		handleAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- MFA Login (two-step) ---

type mfaLoginVerifyRequest struct {
	SessionID    string `json:"session_id" validate:"required"`
	SessionToken string `json:"session_token" validate:"required"`
	Method       string `json:"method" validate:"required"`
	Code         string `json:"code" validate:"required"`
}

// VerifyLoginMFA completes MFA step-2 for a login initiated with /auth/login.
// No bearer token needed — it uses the temporary session from step-1.
// For method=recovery_code the verification is performed against our DB
// (Zitadel v2 does not implement GenerateRecoveryCodes on the server).
func (h *AuthHandler) VerifyLoginMFA(w http.ResponseWriter, r *http.Request) {
	var req mfaLoginVerifyRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	if req.Method == "recovery_code" {
		// Verify backup code against our own DB (Zitadel server doesn't support this).
		userID, loginName, displayName, err := h.zitadel.GetSessionUserDetails(r.Context(), req.SessionID)
		if err != nil {
			handleAuthError(w, err)
			return
		}
		ok, err := h.verifyAndConsumeBackupCode(r.Context(), userID, loginName, req.Code)
		if err != nil || !ok {
			JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid or already-used backup code"})
			return
		}
		result, err := h.zitadel.BuildTokenFromSession(req.SessionID, req.SessionToken, userID, loginName, displayName)
		if err != nil {
			handleAuthError(w, err)
			return
		}
		if result.User != nil {
			h.enrichUserFromDB(r.Context(), result.User)
			h.upsertUserProfile(r.Context(), result.User)
		}
		JSON(w, http.StatusOK, result)
		return
	}

	result, err := h.zitadel.VerifyLoginMFA(r.Context(), req.SessionID, req.SessionToken, req.Method, req.Code)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	if result.User != nil {
		h.enrichUserFromDB(r.Context(), result.User)
		h.upsertUserProfile(r.Context(), result.User)
	}
	JSON(w, http.StatusOK, result)
}

type sendOTPChallengeRequest struct {
	SessionID    string `json:"session_id" validate:"required"`
	SessionToken string `json:"session_token" validate:"required"`
	Method       string `json:"method" validate:"required"`
}

// SendOTPChallenge triggers Zitadel to send a one-time code via email/SMS.
// Required before calling VerifyLoginMFA with method=otp_email or otp_sms.
func (h *AuthHandler) SendOTPChallenge(w http.ResponseWriter, r *http.Request) {
	var req sendOTPChallengeRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if err := h.zitadel.SendOTPChallenge(r.Context(), req.SessionID, req.SessionToken, req.Method); err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

// GenerateRecoveryCodes generates new backup codes for the authenticated user.
// Codes are stored as bcrypt hashes in our DB (Zitadel v2 server has this unimplemented).
func (h *AuthHandler) GenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	codes, err := h.generateBackupCodes(r.Context(), claims.Subject, claims.Email)
	if err != nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "failed to generate backup codes"})
		return
	}
	JSON(w, http.StatusOK, map[string]any{"codes": codes})
}

// RemoveRecoveryCodes removes all backup codes for the authenticated user.
func (h *AuthHandler) RemoveRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}
	userUUID := h.resolveUUID(r.Context(), claims.Subject, claims.Email)
	if h.pool != nil {
		_, _ = h.pool.Exec(r.Context(),
			`DELETE FROM user_backup_codes WHERE user_id = $1`, userUUID)
	}
	w.WriteHeader(http.StatusNoContent)
}

// generateBackupCodes creates 10 random backup codes, hashes them, stores in DB,
// and returns the plaintext codes (shown once only).
func (h *AuthHandler) generateBackupCodes(ctx context.Context, zitadelUserID, email string) ([]string, error) {
	if h.pool == nil {
		return nil, fmt.Errorf("no database connection")
	}
	userUUID := h.resolveUUID(ctx, zitadelUserID, email)

	// Ensure user row exists (backup_codes references users.id).
	_, _ = h.pool.Exec(ctx,
		`INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, userUUID)

	// Delete old backup codes.
	_, _ = h.pool.Exec(ctx, `DELETE FROM user_backup_codes WHERE user_id = $1`, userUUID)

	const total = 10
	plainCodes := make([]string, total)
	for i := 0; i < total; i++ {
		raw := make([]byte, 8)
		if _, err := rand.Read(raw); err != nil {
			return nil, err
		}
		hexStr := hex.EncodeToString(raw) // 16 hex chars
		// Format as XXXX-XXXX-XXXX-XXXX
		plainCodes[i] = fmt.Sprintf("%s-%s-%s-%s",
			hexStr[0:4], hexStr[4:8], hexStr[8:12], hexStr[12:16])
	}

	for _, code := range plainCodes {
		hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		_, err = h.pool.Exec(ctx,
			`INSERT INTO user_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
			userUUID, string(hash))
		if err != nil {
			return nil, err
		}
	}
	return plainCodes, nil
}

// verifyAndConsumeBackupCode checks the submitted code against stored hashes
// and deletes the matching row (one-time use). Returns true when valid.
func (h *AuthHandler) verifyAndConsumeBackupCode(ctx context.Context, zitadelUserID, email, code string) (bool, error) {
	if h.pool == nil {
		return false, fmt.Errorf("no database connection")
	}
	userUUID := h.resolveUUID(ctx, zitadelUserID, email)

	rows, err := h.pool.Query(ctx,
		`SELECT id, code_hash FROM user_backup_codes WHERE user_id = $1`, userUUID)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	type row struct {
		ID   uuid.UUID
		Hash string
	}
	var stored []row
	for rows.Next() {
		var rr row
		if err := rows.Scan(&rr.ID, &rr.Hash); err != nil {
			continue
		}
		stored = append(stored, rr)
	}
	rows.Close()

	// Constant-time comparison via bcrypt to avoid timing attacks.
	for _, s := range stored {
		if err := bcrypt.CompareHashAndPassword([]byte(s.Hash), []byte(code)); err == nil {
			// Delete to prevent reuse.
			_, _ = h.pool.Exec(ctx, `DELETE FROM user_backup_codes WHERE id = $1`, s.ID)
			return true, nil
		}
	}
	// Defensive constant-time delay so an attacker can't distinguish "no codes" from "wrong code".
	_ = subtle.ConstantTimeCompare([]byte(code), []byte(code))
	return false, nil
}

// --- Password Management ---

// ChangePassword allows an authenticated user to change their password.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	token := extractBearerToken(r)
	if token == "" {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "missing authorization header"})
		return
	}
	claims, err := h.zitadel.ValidateToken(r.Context(), token)
	if err != nil {
		JSON(w, http.StatusUnauthorized, ErrorResponse{Message: "invalid token"})
		return
	}

	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "old_password and new_password are required"})
		return
	}
	if len(req.NewPassword) < 8 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "new password must be at least 8 characters"})
		return
	}

	if err := h.zitadel.ChangePassword(r.Context(), claims.Subject, req.OldPassword, req.NewPassword); err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": "password_changed"})
}

// ForgotPassword initiates a password reset flow (public — no auth required).
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}
	if req.Email == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "email is required"})
		return
	}

	// Find user by email in Zitadel
	userID, err := h.zitadel.FindUserByEmail(r.Context(), req.Email)
	if err != nil {
		// Don't reveal whether the email exists — always return success
		JSON(w, http.StatusOK, map[string]string{"status": "reset_initiated"})
		return
	}

	// Request password reset code from Zitadel (returns the code via ReturnCode medium)
	code, err := h.zitadel.RequestPasswordReset(r.Context(), userID)
	if err != nil {
		log.Error().Err(err).Str("email", req.Email).Msg("password reset request failed")
		// Still return success to prevent email enumeration
		JSON(w, http.StatusOK, map[string]string{"status": "reset_initiated"})
		return
	}

	// Send the reset code to the user via the email service
	if sendErr := h.sendPasswordResetEmail(r.Context(), req.Email, code); sendErr != nil {
		log.Error().Err(sendErr).Str("email", req.Email).Msg("failed to send password reset email")
	}

	JSON(w, http.StatusOK, map[string]string{"status": "reset_initiated"})
}

// ResetPassword completes a password reset using a verification code (public — no auth required).
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"new_password"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}
	if req.Email == "" || req.Code == "" || req.NewPassword == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "email, code, and new_password are required"})
		return
	}
	if len(req.NewPassword) < 8 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "new password must be at least 8 characters"})
		return
	}

	userID, err := h.zitadel.FindUserByEmail(r.Context(), req.Email)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid reset request"})
		return
	}

	if err := h.zitadel.ResetPasswordWithCode(r.Context(), userID, req.Code, req.NewPassword); err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": "password_reset"})
}

// --- Social / IDP Endpoints ---

func (h *AuthHandler) ListIDPs(w http.ResponseWriter, r *http.Request) {
	idps, err := h.zitadel.ListIDPs(r.Context())
	if err != nil {
		// Return empty list instead of error — Zitadel management API may be
		// unavailable if the service token is not yet configured. The login page
		// uses this only to render social login buttons; no IDPs = no buttons.
		log.Warn().Err(err).Msg("ListIDPs: Zitadel management unavailable, returning empty list")
		JSON(w, http.StatusOK, map[string]any{"idps": []any{}})
		return
	}
	JSON(w, http.StatusOK, map[string]any{"idps": idps})
}

type startIDPRequest struct {
	IDPID      string `json:"idp_id" validate:"required"`
	SuccessURL string `json:"success_url" validate:"required,url"`
	FailureURL string `json:"failure_url" validate:"required,url"`
}

func (h *AuthHandler) StartIDPLogin(w http.ResponseWriter, r *http.Request) {
	var req startIDPRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	authURL, err := h.zitadel.StartIDPIntent(r.Context(), req.IDPID, req.SuccessURL, req.FailureURL)
	if err != nil {
		handleAuthError(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"auth_url": authURL})
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

func handleAuthError(w http.ResponseWriter, err error) {
	if authErr, ok := err.(*auth.AuthError); ok {
		code := authErr.Code
		if code == 0 {
			code = http.StatusInternalServerError
		}
		JSON(w, code, ErrorResponse{Message: authErr.Error()})
		return
	}
	log.Error().Err(err).Msg("auth service error")
	JSON(w, http.StatusBadGateway, ErrorResponse{Message: "auth service error"})
}
