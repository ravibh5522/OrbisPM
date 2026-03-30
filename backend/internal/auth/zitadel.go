package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	jwtgo "github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog/log"

	zclient "github.com/zitadel/zitadel-go/v3/pkg/client"
	"github.com/zitadel/zitadel-go/v3/pkg/client/zitadel/management"
	objectv2 "github.com/zitadel/zitadel-go/v3/pkg/client/zitadel/object/v2"
	sessionv2 "github.com/zitadel/zitadel-go/v3/pkg/client/zitadel/session/v2"
	userv2 "github.com/zitadel/zitadel-go/v3/pkg/client/zitadel/user/v2"
	"github.com/zitadel/zitadel-go/v3/pkg/zitadel"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// cachedToken stores a validated TokenClaims with an expiry time.
type cachedToken struct {
	claims    *TokenClaims
	expiresAt time.Time
}

// cachedUser stores a fetched UserInfo with an expiry time.
type cachedUser struct {
	user      *UserInfo
	expiresAt time.Time
}

// ZitadelClient communicates with Zitadel via gRPC and provides OIDC PKCE auth flows.
type ZitadelClient struct {
	issuer       string // external Zitadel URL (e.g. http://localhost:8081)
	internalURL  string // docker-internal Zitadel URL (e.g. http://zitadel:8080)
	clientID     string // OIDC application client ID
	externalHost string // Host header value derived from issuer
	httpClient   *http.Client

	// gRPC client (via zitadel-go SDK)
	grpc *zclient.Client

	// JWKS cache for RS256 token validation
	jwks *JWKSCache

	// REST API fallback fields
	serviceToken string      // PAT stored for REST API Authorization header
	useREST      atomic.Bool // true → gRPC unavailable, use REST API

	// In-memory session token cache to avoid calling Zitadel on every request
	sessionCache sync.Map // map[tokenStr]cachedToken

	// In-memory user info cache
	userCache sync.Map // map[userID]cachedUser
}

// NewZitadelClient creates a new Zitadel client with gRPC connections.
// domain is the Zitadel instance domain (e.g. "zitadel.orbispm.in") used for
// instance routing; it may differ from the issuer hostname in local dev.
// grpcDisabled=true skips gRPC entirely and forces REST-only mode (use when gRPC
// is blocked by a proxy such as Cloudflare).
func NewZitadelClient(ctx context.Context, domain, issuer, internalURL, serviceToken, clientID string, grpcDisabled bool) (*ZitadelClient, error) {
	// Use domain as Host header for REST calls and JWKS fetches.
	// Fall back to issuer host if domain is empty.
	externalHost := domain
	if externalHost == "" {
		if parsed, err := url.Parse(issuer); err == nil {
			externalHost = parsed.Host
		}
	}

	c := &ZitadelClient{
		issuer:       issuer,
		internalURL:  internalURL,
		clientID:     clientID,
		externalHost: externalHost,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}

	// Initialize JWKS cache — use internal URL for within-Docker access
	jwksURL := internalURL + "/oauth/v2/keys"
	c.jwks = NewJWKSCache(jwksURL, c.httpClient, c.externalHost)

	// Skip gRPC entirely when explicitly disabled (e.g. behind Cloudflare which blocks gRPC).
	if grpcDisabled {
		c.serviceToken = serviceToken
		c.useREST.Store(true)
		log.Info().Msg("Zitadel gRPC disabled — using REST API only")
		return c, nil
	}

	// Connect gRPC via zitadel-go SDK
	// Domain tells Zitadel which instance to route to.
	// TLS mode and TCP target are driven by the INTERNAL URL — Coolify terminates
	// TLS externally; the internal Docker connection is always plain HTTP.
	if domain == "" {
		parsedIssuer, err := url.Parse(issuer)
		if err != nil {
			return nil, fmt.Errorf("parse issuer URL: %w", err)
		}
		domain = parsedIssuer.Hostname()
	}

	// Parse internal URL first — this determines the actual gRPC transport security.
	parsedInternal, err := url.Parse(internalURL)
	if err != nil {
		return nil, fmt.Errorf("parse internal URL: %w", err)
	}
	grpcTarget := parsedInternal.Host // e.g. "zitadel:8080"
	if parsedInternal.Port() == "" {
		if parsedInternal.Scheme == "https" {
			grpcTarget = parsedInternal.Hostname() + ":443"
		} else {
			grpcTarget = parsedInternal.Hostname() + ":80"
		}
	}

	// Use insecure gRPC when the internal URL is plain HTTP (even if external issuer is HTTPS).
	// Using TLS here would fail because the internal Zitadel container does not terminate TLS.
	var z *zitadel.Zitadel
	if parsedInternal.Scheme == "http" {
		internalPort := parsedInternal.Port()
		if internalPort == "" {
			internalPort = "80"
		}
		z = zitadel.New(domain, zitadel.WithInsecure(internalPort))
	} else {
		z = zitadel.New(domain) // TLS — internal URL is also HTTPS
	}

	c.serviceToken = serviceToken

	grpcClient, err := zclient.New(ctx, z,
		zclient.WithAuth(zclient.PAT(serviceToken)),
		zclient.WithGRPCDialOptions(
			grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
				return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, "tcp", grpcTarget)
			}),
		),
	)
	if err != nil {
		log.Warn().Err(err).Msg("gRPC client creation failed — REST API fallback enabled")
		c.useREST.Store(true)
		return c, nil
	}
	c.grpc = grpcClient

	// Test gRPC connectivity — on failure (e.g., Cloudflare blocking gRPC protocol),
	// the client automatically falls back to Zitadel's REST API.
	testCtx, testCancel := context.WithTimeout(ctx, 5*time.Second)
	_, testErr := c.grpc.SessionServiceV2().GetSession(testCtx, &sessionv2.GetSessionRequest{
		SessionId: "00000000-0000-0000-0000-000000000000",
	})
	testCancel()
	if testErr != nil && isGRPCTransportError(testErr) {
		log.Warn().Err(testErr).Msg("gRPC to Zitadel unavailable — REST API fallback enabled")
		c.useREST.Store(true)
	} else {
		log.Info().Msg("Zitadel gRPC connection verified")
	}

	return c, nil
}

// --- Types ---

// TokenResponse is the response from auth endpoints.
type TokenResponse struct {
	AccessToken  string    `json:"access_token,omitempty"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	TokenType    string    `json:"token_type,omitempty"`
	ExpiresIn    int       `json:"expires_in,omitempty"`
	ExpiresAt    int64     `json:"expires_at,omitempty"`
	User         *UserInfo `json:"user,omitempty"`

	// MFA challenge fields — set when MFARequired is true, access_token is empty.
	MFARequired      bool     `json:"mfa_required,omitempty"`
	SessionID        string   `json:"session_id,omitempty"`
	SessionToken     string   `json:"session_token,omitempty"`
	AvailableMethods []string `json:"available_methods,omitempty"`
}

// UserInfo holds user information.
type UserInfo struct {
	ID               string         `json:"id"`
	InternalID       string         `json:"internal_id,omitempty"` // UUID derived from Zitadel ID for internal use
	Email            string         `json:"email"`
	EmailConfirmedAt *string        `json:"email_confirmed_at,omitempty"`
	Phone            string         `json:"phone,omitempty"`
	UserMetadata     map[string]any `json:"user_metadata"`
	AppMetadata      map[string]any `json:"app_metadata"`
	CreatedAt        string         `json:"created_at,omitempty"`
	UpdatedAt        string         `json:"updated_at,omitempty"`
	MFAEnabled       bool           `json:"mfa_enabled"`
	TOTPEnabled      bool           `json:"totp_enabled"`
	OTPEmailEnabled  bool           `json:"otp_email_enabled"`
	OTPSMSEnabled    bool           `json:"otp_sms_enabled"`
}

// SignUpRequest holds parameters for user signup.
type SignUpRequest struct {
	Email    string         `json:"email"`
	Password string         `json:"password"`
	Data     map[string]any `json:"data,omitempty"`
}

// AuthError represents an auth error.
type AuthError struct {
	Code    int    `json:"code"`
	Message string `json:"msg"`
}

func (e *AuthError) Error() string {
	return fmt.Sprintf("auth: %s (code=%d)", e.Message, e.Code)
}

// TokenClaims holds validated token claims.
type TokenClaims struct {
	Subject     string
	Email       string
	DisplayName string
	SessionID   string
}

// AuthURLResponse contains the OIDC authorize URL and PKCE values.
type AuthURLResponse struct {
	AuthURL      string `json:"auth_url"`
	CodeVerifier string `json:"code_verifier"`
	State        string `json:"state"`
}

// TOTPRegistration contains TOTP setup data.
type TOTPRegistration struct {
	URI    string `json:"uri"`
	Secret string `json:"secret"`
}

// IDPInfo holds identity provider information.
type IDPInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// --- OIDC PKCE Flow ---

// GenerateAuthURL creates an OIDC authorize URL with PKCE parameters.
func (c *ZitadelClient) GenerateAuthURL(redirectURI, state string) (*AuthURLResponse, error) {
	verifier, err := generateCodeVerifier()
	if err != nil {
		return nil, fmt.Errorf("generate code verifier: %w", err)
	}

	challenge := generateCodeChallenge(verifier)

	params := url.Values{
		"client_id":             {c.clientID},
		"redirect_uri":          {redirectURI},
		"response_type":         {"code"},
		"scope":                 {"openid profile email offline_access"},
		"state":                 {state},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
	}

	authURL := c.issuer + "/oauth/v2/authorize?" + params.Encode()

	return &AuthURLResponse{
		AuthURL:      authURL,
		CodeVerifier: verifier,
		State:        state,
	}, nil
}

// ExchangeCode exchanges an authorization code for tokens via the OIDC token endpoint.
func (c *ZitadelClient) ExchangeCode(ctx context.Context, code, redirectURI, codeVerifier string) (*TokenResponse, error) {
	tokenURL := c.internalURL + "/oauth/v2/token"

	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"client_id":     {c.clientID},
		"code_verifier": {codeVerifier},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if c.externalHost != "" {
		req.Host = c.externalHost
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseHTTPError(resp)
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		TokenType    string `json:"token_type"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		IDToken      string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}

	// Parse ID Token to extract user info
	userInfo, err := c.extractUserInfoFromIDToken(tokenResp.IDToken)
	if err != nil {
		userInfo, _ = c.extractUserInfoFromIDToken(tokenResp.AccessToken)
	}

	expiresAt := time.Now().Unix() + int64(tokenResp.ExpiresIn)

	return &TokenResponse{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		TokenType:    tokenResp.TokenType,
		ExpiresIn:    tokenResp.ExpiresIn,
		ExpiresAt:    expiresAt,
		User:         userInfo,
	}, nil
}

// RefreshOIDCToken exchanges a refresh token for new OIDC tokens.
func (c *ZitadelClient) RefreshOIDCToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	tokenURL := c.internalURL + "/oauth/v2/token"

	data := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {c.clientID},
		"scope":         {"openid profile email offline_access"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create refresh request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if c.externalHost != "" {
		req.Host = c.externalHost
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("refresh request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.parseHTTPError(resp)
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		TokenType    string `json:"token_type"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		IDToken      string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("decode refresh response: %w", err)
	}

	userInfo, _ := c.extractUserInfoFromIDToken(tokenResp.IDToken)
	expiresAt := time.Now().Unix() + int64(tokenResp.ExpiresIn)

	return &TokenResponse{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		TokenType:    tokenResp.TokenType,
		ExpiresIn:    tokenResp.ExpiresIn,
		ExpiresAt:    expiresAt,
		User:         userInfo,
	}, nil
}

// --- Session-based Auth (direct login via gRPC) ---

// SignUp creates a new user in Zitadel via gRPC and signs them in.
func (c *ZitadelClient) SignUp(ctx context.Context, req SignUpRequest) (*TokenResponse, error) {
	if c.useREST.Load() {
		return c.restSignUp(ctx, req)
	}
	name := "User"
	if req.Data != nil {
		if n, ok := req.Data["name"].(string); ok && n != "" {
			name = n
		}
	}

	firstName := name
	lastName := "-"
	if parts := strings.SplitN(name, " ", 2); len(parts) == 2 {
		firstName = parts[0]
		lastName = parts[1]
	}

	displayName := name

	createResp, err := c.grpc.UserServiceV2().AddHumanUser(ctx, &userv2.AddHumanUserRequest{
		Username: &req.Email,
		Profile: &userv2.SetHumanProfile{
			GivenName:   firstName,
			FamilyName:  lastName,
			DisplayName: &displayName,
		},
		Email: &userv2.SetHumanEmail{
			Email:        req.Email,
			Verification: &userv2.SetHumanEmail_IsVerified{IsVerified: true},
		},
		PasswordType: &userv2.AddHumanUserRequest_Password{
			Password: &userv2.Password{
				Password:       req.Password,
				ChangeRequired: false,
			},
		},
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restSignUp(ctx, req)
		}
		return nil, c.wrapGRPCError(err)
	}

	log.Info().Str("userId", createResp.GetUserId()).Str("email", req.Email).Msg("user created via gRPC")

	return c.SignIn(ctx, req.Email, req.Password)
}

// SignIn authenticates a user via Zitadel Session API v2 (gRPC).
// If the user has active MFA factors the response has MFARequired=true and
// no access_token; the caller must complete the MFA step via VerifyLoginMFA.
func (c *ZitadelClient) SignIn(ctx context.Context, email, password string) (*TokenResponse, error) {
	if c.useREST.Load() {
		return c.restSignIn(ctx, email, password)
	}
	sessionResp, err := c.grpc.SessionServiceV2().CreateSession(ctx, &sessionv2.CreateSessionRequest{
		Checks: &sessionv2.Checks{
			User: &sessionv2.CheckUser{
				Search: &sessionv2.CheckUser_LoginName{LoginName: email},
			},
			Password: &sessionv2.CheckPassword{
				Password: password,
			},
		},
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restSignIn(ctx, email, password)
		}
		return nil, c.wrapGRPCError(err)
	}

	sessionID := sessionResp.GetSessionId()
	sessionToken := sessionResp.GetSessionToken()

	// Get session details to build user info
	getResp, err := c.grpc.SessionServiceV2().GetSession(ctx, &sessionv2.GetSessionRequest{
		SessionId: sessionID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restSignIn(ctx, email, password)
		}
		return nil, c.wrapGRPCError(err)
	}

	sess := getResp.GetSession()
	userFactor := sess.GetFactors().GetUser()
	userID := userFactor.GetId()

	// Check if user has active MFA factors — if so, require a second step
	var availableMethods []string
	factorsResp, factorsErr := c.grpc.UserServiceV2().ListAuthenticationFactors(ctx, &userv2.ListAuthenticationFactorsRequest{
		UserId: userID,
	})
	if factorsErr != nil && c.grpcFailed(factorsErr) {
		return c.restSignIn(ctx, email, password)
	}
	if factorsErr == nil {
		for _, f := range factorsResp.GetResult() {
			if f.GetState() != userv2.AuthFactorState_AUTH_FACTOR_STATE_READY {
				continue
			}
			switch f.GetType().(type) {
			case *userv2.AuthFactor_Otp:
				availableMethods = append(availableMethods, "totp")
			case *userv2.AuthFactor_OtpEmail:
				availableMethods = append(availableMethods, "otp_email")
			case *userv2.AuthFactor_OtpSms:
				availableMethods = append(availableMethods, "otp_sms")
			}
		}
	}

	if len(availableMethods) > 0 {
		return &TokenResponse{
			MFARequired:      true,
			SessionID:        sessionID,
			SessionToken:     sessionToken,
			AvailableMethods: availableMethods,
		}, nil
	}

	return c.buildSessionTokenResponse(
		sessionID, sessionToken,
		userID,
		userFactor.GetLoginName(),
		userFactor.GetDisplayName(),
	)
}

// SendOTPChallenge requests Zitadel to send a one-time code via email or SMS
// for the given in-progress session. Must be called before VerifyLoginMFA for
// otp_email and otp_sms methods; ignored (no-op) for totp and recovery_code.
func (c *ZitadelClient) SendOTPChallenge(ctx context.Context, sessionID, sessionToken, method string) error {
	if c.useREST.Load() {
		return c.restSendOTPChallenge(ctx, sessionID, sessionToken, method)
	}
	var challenges *sessionv2.RequestChallenges
	switch method {
	case "otp_email":
		challenges = &sessionv2.RequestChallenges{
			OtpEmail: &sessionv2.RequestChallenges_OTPEmail{
				DeliveryType: &sessionv2.RequestChallenges_OTPEmail_SendCode_{
					SendCode: &sessionv2.RequestChallenges_OTPEmail_SendCode{},
				},
			},
		}
	case "otp_sms":
		challenges = &sessionv2.RequestChallenges{
			OtpSms: &sessionv2.RequestChallenges_OTPSMS{},
		}
	default:
		return nil // totp and recovery_code don't need a trigger
	}
	_, err := c.grpc.SessionServiceV2().SetSession(ctx, &sessionv2.SetSessionRequest{
		SessionId:    sessionID,
		SessionToken: sessionToken,
		Challenges:   challenges,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restSendOTPChallenge(ctx, sessionID, sessionToken, method)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// VerifyLoginMFA completes the second factor of a login and returns full tokens.
// method must be one of: "totp", "otp_email", "otp_sms", "recovery_code".
func (c *ZitadelClient) VerifyLoginMFA(ctx context.Context, sessionID, sessionToken, method, code string) (*TokenResponse, error) {
	if c.useREST.Load() {
		return c.restVerifyLoginMFA(ctx, sessionID, sessionToken, method, code)
	}
	checks := &sessionv2.Checks{}
	switch method {
	case "totp":
		checks.Totp = &sessionv2.CheckTOTP{Code: code}
	case "otp_email":
		checks.OtpEmail = &sessionv2.CheckOTP{Code: code}
	case "otp_sms":
		checks.OtpSms = &sessionv2.CheckOTP{Code: code}
	case "recovery_code":
		checks.RecoveryCode = &sessionv2.CheckRecoveryCode{Code: code}
	default:
		return nil, &AuthError{Code: 400, Message: "invalid MFA method"}
	}

	_, err := c.grpc.SessionServiceV2().SetSession(ctx, &sessionv2.SetSessionRequest{
		SessionId:    sessionID,
		SessionToken: sessionToken,
		Checks:       checks,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restVerifyLoginMFA(ctx, sessionID, sessionToken, method, code)
		}
		return nil, c.wrapGRPCError(err)
	}

	// Fetch session to get user details for token response
	getResp, err := c.grpc.SessionServiceV2().GetSession(ctx, &sessionv2.GetSessionRequest{
		SessionId: sessionID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restVerifyLoginMFA(ctx, sessionID, sessionToken, method, code)
		}
		return nil, c.wrapGRPCError(err)
	}
	sess := getResp.GetSession()
	userFactor := sess.GetFactors().GetUser()

	return c.buildSessionTokenResponse(
		sessionID, sessionToken,
		userFactor.GetId(),
		userFactor.GetLoginName(),
		userFactor.GetDisplayName(),
	)
}

// GetSessionUserDetails returns the user ID, login name and display name for an
// in-progress session. Used by the handler to validate backup codes without
// calling into Zitadel's unimplemented RecoveryCodes RPC.
func (c *ZitadelClient) GetSessionUserDetails(ctx context.Context, sessionID string) (userID, loginName, displayName string, err error) {
	if c.useREST.Load() {
		return c.restGetSessionUserDetails(ctx, sessionID)
	}
	getResp, err := c.grpc.SessionServiceV2().GetSession(ctx, &sessionv2.GetSessionRequest{
		SessionId: sessionID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restGetSessionUserDetails(ctx, sessionID)
		}
		return "", "", "", c.wrapGRPCError(err)
	}
	f := getResp.GetSession().GetFactors().GetUser()
	return f.GetId(), f.GetLoginName(), f.GetDisplayName(), nil
}

// BuildTokenFromSession builds a full TokenResponse for an already-verified session.
// Used by the handler after independently verifying a backup code.
func (c *ZitadelClient) BuildTokenFromSession(sessionID, sessionToken, userID, loginName, displayName string) (*TokenResponse, error) {
	return c.buildSessionTokenResponse(sessionID, sessionToken, userID, loginName, displayName)
}

// buildSessionTokenResponse creates token response from session data.
func (c *ZitadelClient) buildSessionTokenResponse(sessionID, sessionToken, userID, email, displayName string) (*TokenResponse, error) {
	// Encode session credentials as both access and refresh tokens
	// Format: base64(sessionID:sessionToken)
	sessionData := sessionID + ":" + sessionToken
	encodedToken := base64.RawURLEncoding.EncodeToString([]byte(sessionData))

	confirmedAt := time.Now().Format(time.RFC3339)
	expiresIn := 3600

	return &TokenResponse{
		AccessToken:  encodedToken,
		RefreshToken: encodedToken,
		TokenType:    "Bearer",
		ExpiresIn:    expiresIn,
		ExpiresAt:    time.Now().Unix() + int64(expiresIn),
		User: &UserInfo{
			ID:               userID,
			Email:            email,
			EmailConfirmedAt: &confirmedAt,
			UserMetadata:     map[string]any{"name": displayName},
			AppMetadata:      map[string]any{},
		},
	}, nil
}

// RefreshSessionToken refreshes a session-based token.
func (c *ZitadelClient) RefreshSessionToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	if c.useREST.Load() {
		return c.restRefreshSessionToken(ctx, refreshToken)
	}
	decoded, err := base64.RawURLEncoding.DecodeString(refreshToken)
	if err != nil {
		return nil, &AuthError{Code: 401, Message: "invalid refresh token"}
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return nil, &AuthError{Code: 401, Message: "invalid refresh token format"}
	}
	sessionID := parts[0]

	getResp, err := c.grpc.SessionServiceV2().GetSession(ctx, &sessionv2.GetSessionRequest{
		SessionId: sessionID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restRefreshSessionToken(ctx, refreshToken)
		}
		return nil, &AuthError{Code: 401, Message: "session expired or invalid"}
	}

	sess := getResp.GetSession()
	userFactor := sess.GetFactors().GetUser()

	return c.buildSessionTokenResponse(
		sessionID, parts[1],
		userFactor.GetId(),
		userFactor.GetLoginName(),
		userFactor.GetDisplayName(),
	)
}

// --- Token Validation ---

const sessionTokenCacheTTL = 3 * time.Minute

// ValidateToken validates a Zitadel-issued JWT (RS256) or a session token.
func (c *ZitadelClient) ValidateToken(ctx context.Context, tokenStr string) (*TokenClaims, error) {
	// Try RS256 JWT validation first (OIDC-issued tokens)
	claims, err := c.jwks.ValidateToken(tokenStr)
	if err == nil {
		return claims, nil
	}

	// Check in-memory session token cache
	if cached, ok := c.sessionCache.Load(tokenStr); ok {
		entry := cached.(cachedToken)
		if time.Now().Before(entry.expiresAt) {
			return entry.claims, nil
		}
		c.sessionCache.Delete(tokenStr)
	}

	// Fallback: validate via Zitadel API and cache the result
	claims, err = c.validateSessionToken(ctx, tokenStr)
	if err != nil {
		return nil, err
	}

	c.sessionCache.Store(tokenStr, cachedToken{
		claims:    claims,
		expiresAt: time.Now().Add(sessionTokenCacheTTL),
	})
	return claims, nil
}

// validateSessionToken validates a session-based token by calling GetSession.
func (c *ZitadelClient) validateSessionToken(ctx context.Context, tokenStr string) (*TokenClaims, error) {
	if c.useREST.Load() {
		return c.restValidateSessionToken(ctx, tokenStr)
	}
	decoded, err := base64.RawURLEncoding.DecodeString(tokenStr)
	if err != nil {
		return nil, &AuthError{Code: 401, Message: "invalid token"}
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return nil, &AuthError{Code: 401, Message: "invalid token format"}
	}
	sessionID := parts[0]

	getResp, err := c.grpc.SessionServiceV2().GetSession(ctx, &sessionv2.GetSessionRequest{
		SessionId: sessionID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restValidateSessionToken(ctx, tokenStr)
		}
		return nil, &AuthError{Code: 401, Message: "session expired or invalid"}
	}

	sess := getResp.GetSession()
	userFactor := sess.GetFactors().GetUser()

	return &TokenClaims{
		Subject:     userFactor.GetId(),
		Email:       userFactor.GetLoginName(),
		DisplayName: userFactor.GetDisplayName(),
		SessionID:   sessionID,
	}, nil
}

// --- User Operations (gRPC) ---

const userCacheTTL = 3 * time.Minute

// GetUser retrieves user info via gRPC (or REST), with in-memory caching.
func (c *ZitadelClient) GetUser(ctx context.Context, userID string) (*UserInfo, error) {
	// Check user cache
	if cached, ok := c.userCache.Load(userID); ok {
		entry := cached.(cachedUser)
		if time.Now().Before(entry.expiresAt) {
			// Return a copy to avoid mutation of cached data
			u := *entry.user
			return &u, nil
		}
		c.userCache.Delete(userID)
	}

	user, err := c.getUserUncached(ctx, userID)
	if err != nil {
		return nil, err
	}

	c.userCache.Store(userID, cachedUser{
		user:      user,
		expiresAt: time.Now().Add(userCacheTTL),
	})
	return user, nil
}

// getUserUncached fetches user info from Zitadel without caching.
func (c *ZitadelClient) getUserUncached(ctx context.Context, userID string) (*UserInfo, error) {
	if c.useREST.Load() {
		return c.restGetUser(ctx, userID)
	}
	resp, err := c.grpc.UserServiceV2().GetUserByID(ctx, &userv2.GetUserByIDRequest{
		UserId: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restGetUser(ctx, userID)
		}
		return nil, c.wrapGRPCError(err)
	}

	u := resp.GetUser()
	human := u.GetHuman()

	var (
		email       string
		phone       string
		confirmed   *string
		displayName string
		firstName   string
		lastName    string
	)

	if human != nil {
		if human.GetEmail() != nil {
			email = human.GetEmail().GetEmail()
			if human.GetEmail().GetIsVerified() {
				t := time.Now().Format(time.RFC3339)
				confirmed = &t
			}
		}
		if human.GetPhone() != nil {
			phone = human.GetPhone().GetPhone()
		}
		if human.GetProfile() != nil {
			displayName = human.GetProfile().GetDisplayName()
			firstName = human.GetProfile().GetGivenName()
			lastName = human.GetProfile().GetFamilyName()
		}
	}

	metadata := map[string]any{"name": displayName}
	if firstName != "" {
		metadata["given_name"] = firstName
	}
	if lastName != "" {
		metadata["family_name"] = lastName
	}

	// Query active auth factors to populate MFA status fields
	totpEnabled := false
	otpEmailEnabled := false
	otpSMSEnabled := false
	mfaEnabled := false

	factorsResp, factorsErr := c.grpc.UserServiceV2().ListAuthenticationFactors(ctx, &userv2.ListAuthenticationFactorsRequest{
		UserId: userID,
	})
	if factorsErr != nil && c.grpcFailed(factorsErr) {
		return c.restGetUser(ctx, userID)
	}
	if factorsErr == nil {
		for _, f := range factorsResp.GetResult() {
			if f.GetState() != userv2.AuthFactorState_AUTH_FACTOR_STATE_READY {
				continue
			}
			switch f.GetType().(type) {
			case *userv2.AuthFactor_Otp:
				totpEnabled = true
				mfaEnabled = true
			case *userv2.AuthFactor_OtpEmail:
				otpEmailEnabled = true
				mfaEnabled = true
			case *userv2.AuthFactor_OtpSms:
				otpSMSEnabled = true
				mfaEnabled = true
			}
		}
	}

	return &UserInfo{
		ID:               u.GetUserId(),
		Email:            email,
		EmailConfirmedAt: confirmed,
		Phone:            phone,
		UserMetadata:     metadata,
		AppMetadata:      map[string]any{},
		MFAEnabled:       mfaEnabled,
		TOTPEnabled:      totpEnabled,
		OTPEmailEnabled:  otpEmailEnabled,
		OTPSMSEnabled:    otpSMSEnabled,
	}, nil
}

// UpdateUserRequest holds parameters for updating a user's profile.
type UpdateUserRequest struct {
	Data  map[string]any `json:"data"`
	Phone string         `json:"phone"`
}

// UpdateUser updates a user's profile in Zitadel and returns fresh UserInfo.
func (c *ZitadelClient) UpdateUser(ctx context.Context, userID string, req UpdateUserRequest) (*UserInfo, error) {
	c.userCache.Delete(userID)
	if c.useREST.Load() {
		return c.restUpdateUser(ctx, userID, req)
	}
	updateReq := &userv2.UpdateHumanUserRequest{
		UserId: userID,
	}

	if req.Data != nil {
		name, _ := req.Data["name"].(string)
		if name != "" {
			firstName := name
			lastName := "-"
			if parts := strings.SplitN(name, " ", 2); len(parts) == 2 {
				firstName = parts[0]
				lastName = parts[1]
			}
			displayName := name
			updateReq.Profile = &userv2.SetHumanProfile{
				GivenName:   firstName,
				FamilyName:  lastName,
				DisplayName: &displayName,
			}
		}
	}

	if req.Phone != "" {
		updateReq.Phone = &userv2.SetHumanPhone{
			Phone:        req.Phone,
			Verification: &userv2.SetHumanPhone_IsVerified{IsVerified: true},
		}
	}

	if _, err := c.grpc.UserServiceV2().UpdateHumanUser(ctx, updateReq); err != nil {
		if c.grpcFailed(err) {
			return c.restUpdateUser(ctx, userID, req)
		}
		return nil, c.wrapGRPCError(err)
	}

	return c.GetUser(ctx, userID)
}

// ListAllUsers retrieves all human users from Zitadel (for backfill / cache warmup).
func (c *ZitadelClient) ListAllUsers(ctx context.Context) ([]*UserInfo, error) {
	if c.useREST.Load() {
		return c.restListAllUsers(ctx)
	}
	resp, err := c.grpc.UserServiceV2().ListUsers(ctx, &userv2.ListUsersRequest{
		Query: &objectv2.ListQuery{Limit: 2000},
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restListAllUsers(ctx)
		}
		return nil, c.wrapGRPCError(err)
	}
	var result []*UserInfo
	for _, u := range resp.GetResult() {
		human := u.GetHuman()
		if human == nil {
			continue
		}
		email := ""
		phone := ""
		displayName := ""
		if human.GetEmail() != nil {
			email = human.GetEmail().GetEmail()
		}
		if human.GetPhone() != nil {
			phone = human.GetPhone().GetPhone()
		}
		if human.GetProfile() != nil {
			displayName = human.GetProfile().GetDisplayName()
		}
		result = append(result, &UserInfo{
			ID:           u.GetUserId(),
			Email:        email,
			Phone:        phone,
			UserMetadata: map[string]any{"name": displayName},
		})
	}
	return result, nil
}

// --- Logout / Revoke ---

// Logout deletes a session or revokes a token.
func (c *ZitadelClient) Logout(ctx context.Context, claims *TokenClaims, rawToken string) error {
	// Invalidate session token cache entry
	c.sessionCache.Delete(rawToken)

	if c.useREST.Load() {
		return c.restLogout(ctx, claims, rawToken)
	}
	if claims != nil && claims.SessionID != "" {
		_, err := c.grpc.SessionServiceV2().DeleteSession(ctx, &sessionv2.DeleteSessionRequest{
			SessionId: claims.SessionID,
		})
		if err != nil {
			if c.grpcFailed(err) {
				return c.restLogout(ctx, claims, rawToken)
			}
			return c.wrapGRPCError(err)
		}
		return nil
	}

	// Revoke OIDC token
	return c.revokeToken(ctx, rawToken)
}

// revokeToken revokes an OIDC token.
func (c *ZitadelClient) revokeToken(ctx context.Context, token string) error {
	revokeURL := c.internalURL + "/oauth/v2/revoke"

	data := url.Values{
		"token":     {token},
		"client_id": {c.clientID},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, revokeURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("create revoke request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if c.externalHost != "" {
		req.Host = c.externalHost
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("revoke request: %w", err)
	}
	resp.Body.Close()
	return nil
}

// --- MFA Operations (gRPC) ---

// RegisterTOTP starts TOTP registration for a user.
func (c *ZitadelClient) RegisterTOTP(ctx context.Context, userID string) (*TOTPRegistration, error) {
	if c.useREST.Load() {
		uri, secret, err := c.restRegisterTOTP(ctx, userID)
		if err != nil {
			return nil, err
		}
		return &TOTPRegistration{URI: uri, Secret: secret}, nil
	}
	resp, err := c.grpc.UserServiceV2().RegisterTOTP(ctx, &userv2.RegisterTOTPRequest{
		UserId: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			uri, secret, restErr := c.restRegisterTOTP(ctx, userID)
			if restErr != nil {
				return nil, restErr
			}
			return &TOTPRegistration{URI: uri, Secret: secret}, nil
		}
		return nil, c.wrapGRPCError(err)
	}
	return &TOTPRegistration{
		URI:    resp.GetUri(),
		Secret: resp.GetSecret(),
	}, nil
}

// VerifyTOTP verifies a TOTP code to complete registration.
func (c *ZitadelClient) VerifyTOTP(ctx context.Context, userID, code string) error {
	if c.useREST.Load() {
		return c.restVerifyTOTP(ctx, userID, code)
	}
	_, err := c.grpc.UserServiceV2().VerifyTOTPRegistration(ctx, &userv2.VerifyTOTPRegistrationRequest{
		UserId: userID,
		Code:   code,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restVerifyTOTP(ctx, userID, code)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// RemoveTOTP removes TOTP from a user.
func (c *ZitadelClient) RemoveTOTP(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restRemoveTOTP(ctx, userID)
	}
	_, err := c.grpc.UserServiceV2().RemoveTOTP(ctx, &userv2.RemoveTOTPRequest{
		UserId: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restRemoveTOTP(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// AddOTPEmail enables email OTP for a user.
func (c *ZitadelClient) AddOTPEmail(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restAddOTPEmail(ctx, userID)
	}
	_, err := c.grpc.UserServiceV2().AddOTPEmail(ctx, &userv2.AddOTPEmailRequest{
		UserId: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restAddOTPEmail(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// RemoveOTPEmail disables email OTP for a user.
func (c *ZitadelClient) RemoveOTPEmail(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restRemoveOTPEmail(ctx, userID)
	}
	_, err := c.grpc.UserServiceV2().RemoveOTPEmail(ctx, &userv2.RemoveOTPEmailRequest{
		UserId: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restRemoveOTPEmail(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// AddOTPSMS enables SMS OTP for a user.
func (c *ZitadelClient) AddOTPSMS(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restAddOTPSMS(ctx, userID)
	}
	_, err := c.grpc.UserServiceV2().AddOTPSMS(ctx, &userv2.AddOTPSMSRequest{
		UserId: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restAddOTPSMS(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// RemoveOTPSMS disables SMS OTP for a user.
func (c *ZitadelClient) RemoveOTPSMS(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restRemoveOTPSMS(ctx, userID)
	}
	_, err := c.grpc.UserServiceV2().RemoveOTPSMS(ctx, &userv2.RemoveOTPSMSRequest{
		UserId: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restRemoveOTPSMS(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// VerifyMFASession verifies a TOTP code against an existing session.
func (c *ZitadelClient) VerifyMFASession(ctx context.Context, sessionID, sessionToken, totpCode string) error {
	if c.useREST.Load() {
		return c.restVerifyMFASession(ctx, sessionID, sessionToken, totpCode)
	}
	_, err := c.grpc.SessionServiceV2().SetSession(ctx, &sessionv2.SetSessionRequest{
		SessionId:    sessionID,
		SessionToken: sessionToken,
		Checks: &sessionv2.Checks{
			Totp: &sessionv2.CheckTOTP{
				Code: totpCode,
			},
		},
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restVerifyMFASession(ctx, sessionID, sessionToken, totpCode)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// --- IDP Operations ---

// ListIDPs lists configured identity providers.
func (c *ZitadelClient) ListIDPs(ctx context.Context) ([]*IDPInfo, error) {
	if c.useREST.Load() {
		return c.restListOrgIDPs(ctx)
	}
	resp, err := c.grpc.ManagementService().ListOrgIDPs(ctx, &management.ListOrgIDPsRequest{})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restListOrgIDPs(ctx)
		}
		return nil, c.wrapGRPCError(err)
	}

	idps := make([]*IDPInfo, 0)
	for _, idp := range resp.GetResult() {
		idpType := "unknown"
		if idp.GetOidcConfig() != nil {
			idpType = "oidc"
		} else if idp.GetJwtConfig() != nil {
			idpType = "jwt"
		}
		idps = append(idps, &IDPInfo{
			ID:   idp.GetId(),
			Name: idp.GetName(),
			Type: idpType,
		})
	}
	return idps, nil
}

// StartIDPIntent starts an IDP intent for social login.
func (c *ZitadelClient) StartIDPIntent(ctx context.Context, idpID, successURL, failureURL string) (string, error) {
	if c.useREST.Load() {
		return c.restStartIDPIntent(ctx, idpID, successURL, failureURL)
	}
	resp, err := c.grpc.UserServiceV2().StartIdentityProviderIntent(ctx, &userv2.StartIdentityProviderIntentRequest{
		IdpId: idpID,
		Content: &userv2.StartIdentityProviderIntentRequest_Urls{
			Urls: &userv2.RedirectURLs{
				SuccessUrl: successURL,
				FailureUrl: failureURL,
			},
		},
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restStartIDPIntent(ctx, idpID, successURL, failureURL)
		}
		return "", c.wrapGRPCError(err)
	}
	return resp.GetAuthUrl(), nil
}

// --- Health ---

// HealthCheck checks Zitadel health.
func (c *ZitadelClient) HealthCheck(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.internalURL+"/debug/healthz", nil)
	if err != nil {
		return err
	}
	if c.externalHost != "" {
		req.Host = c.externalHost
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("zitadel health: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("zitadel unhealthy: status %d", resp.StatusCode)
	}
	return nil
}

// --- Password Management ---

// ChangePassword changes a user's password (requires old password verification).
func (c *ZitadelClient) ChangePassword(ctx context.Context, userID, oldPassword, newPassword string) error {
	if c.useREST.Load() {
		return c.restChangePassword(ctx, userID, oldPassword, newPassword)
	}
	req := &userv2.SetPasswordRequest{
		UserId: userID,
		NewPassword: &userv2.Password{
			Password:       newPassword,
			ChangeRequired: false,
		},
		Verification: &userv2.SetPasswordRequest_CurrentPassword{
			CurrentPassword: oldPassword,
		},
	}
	_, err := c.grpc.UserServiceV2().SetPassword(ctx, req)
	if err != nil {
		if c.grpcFailed(err) {
			return c.restChangePassword(ctx, userID, oldPassword, newPassword)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// AdminResetPassword sets a user's password without requiring the old one (admin action).
func (c *ZitadelClient) AdminResetPassword(ctx context.Context, userID, newPassword string) error {
	if c.useREST.Load() {
		return c.restAdminResetPassword(ctx, userID, newPassword)
	}
	req := &userv2.SetPasswordRequest{
		UserId: userID,
		NewPassword: &userv2.Password{
			Password:       newPassword,
			ChangeRequired: true,
		},
	}
	_, err := c.grpc.UserServiceV2().SetPassword(ctx, req)
	if err != nil {
		if c.grpcFailed(err) {
			return c.restAdminResetPassword(ctx, userID, newPassword)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// RequestPasswordReset initiates a password reset flow via Zitadel.
// Returns a verification code that should be sent to the user's email.
func (c *ZitadelClient) RequestPasswordReset(ctx context.Context, userID string) (string, error) {
	if c.useREST.Load() {
		return c.restRequestPasswordReset(ctx, userID)
	}
	req := &userv2.PasswordResetRequest{
		UserId: userID,
		Medium: &userv2.PasswordResetRequest_ReturnCode{
			ReturnCode: &userv2.ReturnPasswordResetCode{},
		},
	}
	resp, err := c.grpc.UserServiceV2().PasswordReset(ctx, req)
	if err != nil {
		if c.grpcFailed(err) {
			return c.restRequestPasswordReset(ctx, userID)
		}
		return "", c.wrapGRPCError(err)
	}
	code := ""
	if resp.GetVerificationCode() != "" {
		code = resp.GetVerificationCode()
	}
	return code, nil
}

// ResetPasswordWithCode completes a password reset using a verification code.
func (c *ZitadelClient) ResetPasswordWithCode(ctx context.Context, userID, code, newPassword string) error {
	if c.useREST.Load() {
		return c.restResetPasswordWithCode(ctx, userID, code, newPassword)
	}
	req := &userv2.SetPasswordRequest{
		UserId: userID,
		NewPassword: &userv2.Password{
			Password:       newPassword,
			ChangeRequired: false,
		},
		Verification: &userv2.SetPasswordRequest_VerificationCode{
			VerificationCode: code,
		},
	}
	_, err := c.grpc.UserServiceV2().SetPassword(ctx, req)
	if err != nil {
		if c.grpcFailed(err) {
			return c.restResetPasswordWithCode(ctx, userID, code, newPassword)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// FindUserByEmail searches for a user by email and returns their Zitadel user ID.
func (c *ZitadelClient) FindUserByEmail(ctx context.Context, email string) (string, error) {
	if c.useREST.Load() {
		return c.restFindUserByEmail(ctx, email)
	}
	resp, err := c.grpc.UserServiceV2().ListUsers(ctx, &userv2.ListUsersRequest{
		Query: &objectv2.ListQuery{Limit: 1},
		Queries: []*userv2.SearchQuery{
			{
				Query: &userv2.SearchQuery_EmailQuery{
					EmailQuery: &userv2.EmailQuery{
						EmailAddress: email,
					},
				},
			},
		},
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restFindUserByEmail(ctx, email)
		}
		return "", c.wrapGRPCError(err)
	}
	if len(resp.GetResult()) == 0 {
		return "", fmt.Errorf("user not found")
	}
	return resp.GetResult()[0].GetUserId(), nil
}

// DeactivateUser deactivates a Zitadel user account.
func (c *ZitadelClient) DeactivateUser(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restDeactivateUser(ctx, userID)
	}
	_, err := c.grpc.ManagementService().DeactivateUser(ctx, &management.DeactivateUserRequest{
		Id: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restDeactivateUser(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// ReactivateUser reactivates a previously deactivated Zitadel user account.
func (c *ZitadelClient) ReactivateUser(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restReactivateUser(ctx, userID)
	}
	_, err := c.grpc.ManagementService().ReactivateUser(ctx, &management.ReactivateUserRequest{
		Id: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restReactivateUser(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// UpdateUserEmail updates a user's email address in Zitadel.
func (c *ZitadelClient) UpdateUserEmail(ctx context.Context, userID, newEmail string) error {
	if c.useREST.Load() {
		return c.restSetEmail(ctx, userID, newEmail)
	}
	_, err := c.grpc.UserServiceV2().SetEmail(ctx, &userv2.SetEmailRequest{
		UserId: userID,
		Email:  newEmail,
		Verification: &userv2.SetEmailRequest_IsVerified{
			IsVerified: true,
		},
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restSetEmail(ctx, userID, newEmail)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// DeleteUser permanently deletes a Zitadel user account.
func (c *ZitadelClient) DeleteUser(ctx context.Context, userID string) error {
	if c.useREST.Load() {
		return c.restRemoveUser(ctx, userID)
	}
	_, err := c.grpc.ManagementService().RemoveUser(ctx, &management.RemoveUserRequest{
		Id: userID,
	})
	if err != nil {
		if c.grpcFailed(err) {
			return c.restRemoveUser(ctx, userID)
		}
		return c.wrapGRPCError(err)
	}
	return nil
}

// --- Getters ---

// Issuer returns the external Zitadel issuer URL.
func (c *ZitadelClient) Issuer() string { return c.issuer }

// ClientID returns the OIDC client ID.
func (c *ZitadelClient) ClientID() string { return c.clientID }

// GRPCClient returns the underlying zitadel-go gRPC client.
func (c *ZitadelClient) GRPCClient() *zclient.Client { return c.grpc }

// --- Internal Helpers ---

func (c *ZitadelClient) extractUserInfoFromIDToken(tokenStr string) (*UserInfo, error) {
	parser := jwtgo.NewParser(jwtgo.WithoutClaimsValidation())
	token, _, err := parser.ParseUnverified(tokenStr, jwtgo.MapClaims{})
	if err != nil {
		return nil, fmt.Errorf("parse id token: %w", err)
	}

	claims, ok := token.Claims.(jwtgo.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}

	sub, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	name, _ := claims["name"].(string)
	givenName, _ := claims["given_name"].(string)
	familyName, _ := claims["family_name"].(string)
	emailVerified, _ := claims["email_verified"].(bool)

	var confirmed *string
	if emailVerified {
		t := time.Now().Format(time.RFC3339)
		confirmed = &t
	}

	metadata := map[string]any{"name": name}
	if givenName != "" {
		metadata["given_name"] = givenName
	}
	if familyName != "" {
		metadata["family_name"] = familyName
	}

	return &UserInfo{
		ID:               sub,
		Email:            email,
		EmailConfirmedAt: confirmed,
		UserMetadata:     metadata,
		AppMetadata:      map[string]any{},
	}, nil
}

func (c *ZitadelClient) parseHTTPError(resp *http.Response) error {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return &AuthError{Code: resp.StatusCode, Message: fmt.Sprintf("status %d", resp.StatusCode)}
	}

	var oauthErr struct {
		Error       string `json:"error"`
		Description string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &oauthErr); err == nil && oauthErr.Error != "" {
		msg := oauthErr.Description
		if msg == "" {
			msg = oauthErr.Error
		}
		return &AuthError{Code: resp.StatusCode, Message: msg}
	}

	var grpcErr struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &grpcErr); err == nil && grpcErr.Message != "" {
		return &AuthError{Code: resp.StatusCode, Message: grpcErr.Message}
	}

	log.Debug().Str("body", string(body)).Int("status", resp.StatusCode).Msg("zitadel raw error")
	return &AuthError{Code: resp.StatusCode, Message: fmt.Sprintf("auth error: status %d", resp.StatusCode)}
}

func (c *ZitadelClient) wrapGRPCError(err error) error {
	if err == nil {
		return nil
	}
	// Use the gRPC status code directly instead of string matching.
	code := http.StatusInternalServerError
	if st, ok := status.FromError(err); ok {
		switch st.Code() {
		case codes.NotFound:
			code = http.StatusNotFound
		case codes.AlreadyExists:
			code = http.StatusConflict
		case codes.PermissionDenied, codes.Unauthenticated:
			code = http.StatusUnauthorized
		case codes.InvalidArgument, codes.OutOfRange:
			code = http.StatusBadRequest
		case codes.FailedPrecondition:
			code = http.StatusUnprocessableEntity
		case codes.Unavailable, codes.Internal, codes.DataLoss, codes.Unknown:
			// Upstream Zitadel error — map to 502 Bad Gateway so the client
			// can distinguish an auth service outage from an app-level error.
			code = http.StatusBadGateway
		case codes.ResourceExhausted:
			code = http.StatusTooManyRequests
		case codes.DeadlineExceeded, codes.Canceled:
			code = http.StatusGatewayTimeout
		case codes.Unimplemented:
			code = http.StatusNotImplemented
		}
	}
	return &AuthError{Code: code, Message: err.Error()}
}

// --- PKCE Helpers ---

func generateCodeVerifier() (string, error) {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
	b := make([]byte, 64)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		b[i] = charset[n.Int64()]
	}
	return string(b), nil
}

func generateCodeChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// --- JWKS Cache for RS256 Token Validation ---

// JWKSCache caches JWKS keys for RS256 token validation.
type JWKSCache struct {
	url          string
	httpClient   *http.Client
	externalHost string
	keys         map[string]*jwkKey
	mu           sync.RWMutex
	lastFetch    time.Time
	cacheTTL     time.Duration
}

type jwkKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// NewJWKSCache creates a new JWKS cache.
func NewJWKSCache(jwksURL string, httpClient *http.Client, externalHost string) *JWKSCache {
	return &JWKSCache{
		url:          jwksURL,
		httpClient:   httpClient,
		externalHost: externalHost,
		keys:         make(map[string]*jwkKey),
		cacheTTL:     5 * time.Minute,
	}
}

// ValidateToken validates a JWT using cached JWKS keys.
func (j *JWKSCache) ValidateToken(tokenStr string) (*TokenClaims, error) {
	token, err := jwtgo.Parse(tokenStr, func(t *jwtgo.Token) (any, error) {
		if t.Method.Alg() != "RS256" {
			return nil, fmt.Errorf("unexpected signing method: %s", t.Method.Alg())
		}
		kid, ok := t.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("missing kid in token header")
		}
		return j.getKey(kid)
	}, jwtgo.WithExpirationRequired())

	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(jwtgo.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}

	sub, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	name, _ := claims["name"].(string)

	return &TokenClaims{
		Subject:     sub,
		Email:       email,
		DisplayName: name,
	}, nil
}

func (j *JWKSCache) getKey(kid string) (any, error) {
	j.mu.RLock()
	if key, ok := j.keys[kid]; ok && time.Since(j.lastFetch) < j.cacheTTL {
		j.mu.RUnlock()
		return parseRSAPublicKey(key)
	}
	j.mu.RUnlock()

	if err := j.refresh(); err != nil {
		return nil, fmt.Errorf("refresh JWKS: %w", err)
	}

	j.mu.RLock()
	defer j.mu.RUnlock()
	key, ok := j.keys[kid]
	if !ok {
		return nil, fmt.Errorf("key %s not found in JWKS", kid)
	}
	return parseRSAPublicKey(key)
}

func (j *JWKSCache) refresh() error {
	j.mu.Lock()
	defer j.mu.Unlock()

	req, err := http.NewRequest(http.MethodGet, j.url, nil)
	if err != nil {
		return fmt.Errorf("create JWKS request: %w", err)
	}
	if j.externalHost != "" {
		req.Host = j.externalHost
	}

	resp, err := j.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Keys []jwkKey `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode JWKS: %w", err)
	}

	j.keys = make(map[string]*jwkKey, len(result.Keys))
	for i := range result.Keys {
		j.keys[result.Keys[i].Kid] = &result.Keys[i]
	}
	j.lastFetch = time.Now()

	log.Debug().Int("keys", len(result.Keys)).Msg("JWKS cache refreshed")
	return nil
}

func parseRSAPublicKey(key *jwkKey) (any, error) {
	if key.Kty != "RSA" {
		return nil, fmt.Errorf("unsupported key type: %s", key.Kty)
	}

	nBytes, err := base64.RawURLEncoding.DecodeString(key.N)
	if err != nil {
		return nil, fmt.Errorf("decode N: %w", err)
	}

	eBytes, err := base64.RawURLEncoding.DecodeString(key.E)
	if err != nil {
		return nil, fmt.Errorf("decode E: %w", err)
	}

	var e int
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}

	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: e,
	}, nil
}
