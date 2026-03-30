package auth

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// --- gRPC transport error detection & REST fallback ---

// isGRPCTransportError returns true if the gRPC error indicates a transport/connectivity
// issue that should trigger a REST API fallback.
func isGRPCTransportError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := err.Error()
	transportPatterns := []string{
		"connection refused",
		"no route to host",
		"transport closing",
		"i/o timeout",
		"unexpected HTTP status code",
		"HTTP Version Not Supported",
		"TLS handshake",
		"connection reset",
	}
	for _, p := range transportPatterns {
		if strings.Contains(errMsg, p) {
			return true
		}
	}
	st, ok := status.FromError(err)
	if !ok {
		return true // non-gRPC error is likely transport
	}
	return st.Code() == codes.Unavailable
}

// switchToREST atomically marks the client to use REST API.
func (c *ZitadelClient) switchToREST() {
	if c.useREST.CompareAndSwap(false, true) {
		log.Warn().Msg("gRPC unavailable — switched to Zitadel REST API fallback")
	}
}

// grpcFailed checks if err is a transport error. If so, switches to REST and returns true.
func (c *ZitadelClient) grpcFailed(err error) bool {
	if err != nil && isGRPCTransportError(err) {
		c.switchToREST()
		return true
	}
	return false
}

// --- REST API helpers ---

// doRESTCall makes an authenticated HTTP call to Zitadel's REST API.
func (c *ZitadelClient) doRESTCall(ctx context.Context, method, path string, body any) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	reqURL := c.internalURL + path
	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.serviceToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	if c.externalHost != "" {
		req.Host = c.externalHost
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("REST %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, c.parseRESTError(resp.StatusCode, respBody)
	}

	return respBody, nil
}

// parseRESTError parses a Zitadel REST error response into an AuthError.
func (c *ZitadelClient) parseRESTError(statusCode int, body []byte) error {
	var errResp struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &errResp); err == nil && errResp.Message != "" {
		return &AuthError{Code: statusCode, Message: errResp.Message}
	}
	return &AuthError{Code: statusCode, Message: fmt.Sprintf("REST error: status %d", statusCode)}
}

// --- REST response types ---

type restUser struct {
	UserID string `json:"userId"`
	Human  *struct {
		Profile struct {
			GivenName   string `json:"givenName"`
			FamilyName  string `json:"familyName"`
			DisplayName string `json:"displayName"`
		} `json:"profile"`
		Email struct {
			Email      string `json:"email"`
			IsVerified bool   `json:"isVerified"`
		} `json:"email"`
		Phone struct {
			Phone string `json:"phone"`
		} `json:"phone"`
	} `json:"human"`
}

type restSessionResponse struct {
	Session struct {
		ID      string `json:"id"`
		Factors struct {
			User struct {
				ID          string `json:"id"`
				LoginName   string `json:"loginName"`
				DisplayName string `json:"displayName"`
			} `json:"user"`
		} `json:"factors"`
	} `json:"session"`
}

type restAuthFactor struct {
	State    string          `json:"state"`
	OTP      json.RawMessage `json:"otp,omitempty"`
	OTPEmail json.RawMessage `json:"otpEmail,omitempty"`
	OTPSMS   json.RawMessage `json:"otpSms,omitempty"`
}

func (f *restAuthFactor) isReady() bool {
	return f.State == "AUTH_FACTOR_STATE_READY"
}

func (f *restAuthFactor) factorType() string {
	if f.OTP != nil && string(f.OTP) != "null" {
		return "totp"
	}
	if f.OTPEmail != nil && string(f.OTPEmail) != "null" {
		return "otp_email"
	}
	if f.OTPSMS != nil && string(f.OTPSMS) != "null" {
		return "otp_sms"
	}
	return ""
}

// --- Session REST methods ---

func (c *ZitadelClient) restCreateSession(ctx context.Context, loginName, password string) (string, string, error) {
	body := map[string]any{
		"checks": map[string]any{
			"user": map[string]any{
				"loginName": loginName,
			},
			"password": map[string]any{
				"password": password,
			},
		},
	}
	respBody, err := c.doRESTCall(ctx, "POST", "/v2/sessions", body)
	if err != nil {
		return "", "", err
	}
	var resp struct {
		SessionID    string `json:"sessionId"`
		SessionToken string `json:"sessionToken"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return "", "", fmt.Errorf("unmarshal session: %w", err)
	}
	return resp.SessionID, resp.SessionToken, nil
}

func (c *ZitadelClient) restGetSession(ctx context.Context, sessionID string) (*restSessionResponse, error) {
	respBody, err := c.doRESTCall(ctx, "GET", "/v2/sessions/"+sessionID, nil)
	if err != nil {
		return nil, err
	}
	var resp restSessionResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal session: %w", err)
	}
	return &resp, nil
}

func (c *ZitadelClient) restSetSession(ctx context.Context, sessionID, sessionToken string, checks, challenges map[string]any) error {
	body := map[string]any{
		"sessionToken": sessionToken,
	}
	if checks != nil {
		body["checks"] = checks
	}
	if challenges != nil {
		body["challenges"] = challenges
	}
	_, err := c.doRESTCall(ctx, "PATCH", "/v2/sessions/"+sessionID, body)
	return err
}

func (c *ZitadelClient) restDeleteSession(ctx context.Context, sessionID string) error {
	_, err := c.doRESTCall(ctx, "DELETE", "/v2/sessions/"+sessionID, nil)
	return err
}

// --- User REST methods ---

func (c *ZitadelClient) restAddHumanUser(ctx context.Context, email, password, firstName, lastName, displayName string) (string, error) {
	body := map[string]any{
		"username": email,
		"profile": map[string]any{
			"givenName":   firstName,
			"familyName":  lastName,
			"displayName": displayName,
		},
		"email": map[string]any{
			"email":      email,
			"isVerified": true,
		},
		"password": map[string]any{
			"password":       password,
			"changeRequired": false,
		},
	}
	respBody, err := c.doRESTCall(ctx, "POST", "/v2/users/human", body)
	if err != nil {
		return "", err
	}
	var resp struct {
		UserID string `json:"userId"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return "", fmt.Errorf("unmarshal add user: %w", err)
	}
	return resp.UserID, nil
}

func (c *ZitadelClient) restGetUserByID(ctx context.Context, userID string) (*restUser, error) {
	respBody, err := c.doRESTCall(ctx, "GET", "/v2/users/"+userID, nil)
	if err != nil {
		return nil, err
	}
	var resp struct {
		User restUser `json:"user"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal user: %w", err)
	}
	return &resp.User, nil
}

func (c *ZitadelClient) restUpdateHumanUser(ctx context.Context, userID string, profile map[string]any, phone *string) error {
	body := map[string]any{}
	if profile != nil {
		body["profile"] = profile
	}
	if phone != nil {
		body["phone"] = map[string]any{
			"phone":      *phone,
			"isVerified": true,
		}
	}
	_, err := c.doRESTCall(ctx, "PUT", "/v2/users/human/"+userID, body)
	return err
}

func (c *ZitadelClient) restListUsers(ctx context.Context, limit int, queries []map[string]any) ([]restUser, error) {
	body := map[string]any{
		"query": map[string]any{
			"limit": limit,
		},
	}
	if queries != nil {
		body["queries"] = queries
	}
	respBody, err := c.doRESTCall(ctx, "POST", "/v2/users", body)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Result []restUser `json:"result"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal list users: %w", err)
	}
	return resp.Result, nil
}

func (c *ZitadelClient) restListAuthFactors(ctx context.Context, userID string) ([]restAuthFactor, error) {
	// Try v2 search endpoint first, then fall back to alternative paths.
	respBody, err := c.doRESTCall(ctx, "POST", "/v2/users/"+userID+"/authentication_factors/_search", map[string]any{})
	if err != nil {
		respBody, err = c.doRESTCall(ctx, "GET", "/v2/users/"+userID+"/authentication_factors", nil)
		if err != nil {
			return nil, err
		}
	}
	var resp struct {
		Result []restAuthFactor `json:"result"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal auth factors: %w", err)
	}
	return resp.Result, nil
}

// --- MFA REST methods ---

func (c *ZitadelClient) restRegisterTOTP(ctx context.Context, userID string) (string, string, error) {
	respBody, err := c.doRESTCall(ctx, "POST", "/v2/users/"+userID+"/totp", map[string]any{})
	if err != nil {
		return "", "", err
	}
	var resp struct {
		URI    string `json:"uri"`
		Secret string `json:"secret"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return "", "", fmt.Errorf("unmarshal totp: %w", err)
	}
	return resp.URI, resp.Secret, nil
}

func (c *ZitadelClient) restVerifyTOTP(ctx context.Context, userID, code string) error {
	_, err := c.doRESTCall(ctx, "POST", "/v2/users/"+userID+"/totp/verify", map[string]any{
		"code": code,
	})
	return err
}

func (c *ZitadelClient) restRemoveTOTP(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "DELETE", "/v2/users/"+userID+"/totp", nil)
	return err
}

func (c *ZitadelClient) restAddOTPEmail(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "POST", "/v2/users/"+userID+"/otp_email", map[string]any{})
	return err
}

func (c *ZitadelClient) restRemoveOTPEmail(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "DELETE", "/v2/users/"+userID+"/otp_email", nil)
	return err
}

func (c *ZitadelClient) restAddOTPSMS(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "POST", "/v2/users/"+userID+"/otp_sms", map[string]any{})
	return err
}

func (c *ZitadelClient) restRemoveOTPSMS(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "DELETE", "/v2/users/"+userID+"/otp_sms", nil)
	return err
}

// --- Password REST methods ---

func (c *ZitadelClient) restSetPassword(ctx context.Context, userID, newPassword string, changeRequired bool, currentPassword, verificationCode *string) error {
	body := map[string]any{
		"newPassword": map[string]any{
			"password":       newPassword,
			"changeRequired": changeRequired,
		},
	}
	if currentPassword != nil {
		body["currentPassword"] = *currentPassword
	}
	if verificationCode != nil {
		body["verificationCode"] = *verificationCode
	}
	_, err := c.doRESTCall(ctx, "PUT", "/v2/users/"+userID+"/password", body)
	return err
}

func (c *ZitadelClient) restPasswordReset(ctx context.Context, userID string) (string, error) {
	body := map[string]any{
		"returnCode": map[string]any{},
	}
	respBody, err := c.doRESTCall(ctx, "POST", "/v2/users/"+userID+"/password_reset", body)
	if err != nil {
		return "", err
	}
	var resp struct {
		VerificationCode string `json:"verificationCode"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return "", fmt.Errorf("unmarshal password reset: %w", err)
	}
	return resp.VerificationCode, nil
}

func (c *ZitadelClient) restSetEmail(ctx context.Context, userID, email string) error {
	body := map[string]any{
		"email":      email,
		"isVerified": true,
	}
	_, err := c.doRESTCall(ctx, "PUT", "/v2/users/"+userID+"/email", body)
	return err
}

// --- IDP REST methods ---

func (c *ZitadelClient) restListOrgIDPs(ctx context.Context) ([]*IDPInfo, error) {
	respBody, err := c.doRESTCall(ctx, "POST", "/management/v1/idps/_search", map[string]any{})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Result []struct {
			ID         string          `json:"id"`
			Name       string          `json:"name"`
			OIDCConfig json.RawMessage `json:"oidcConfig,omitempty"`
			JWTConfig  json.RawMessage `json:"jwtConfig,omitempty"`
		} `json:"result"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal idps: %w", err)
	}
	idps := make([]*IDPInfo, 0, len(resp.Result))
	for _, r := range resp.Result {
		idpType := "unknown"
		if r.OIDCConfig != nil && string(r.OIDCConfig) != "null" {
			idpType = "oidc"
		} else if r.JWTConfig != nil && string(r.JWTConfig) != "null" {
			idpType = "jwt"
		}
		idps = append(idps, &IDPInfo{ID: r.ID, Name: r.Name, Type: idpType})
	}
	return idps, nil
}

func (c *ZitadelClient) restStartIDPIntent(ctx context.Context, idpID, successURL, failureURL string) (string, error) {
	body := map[string]any{
		"idpId": idpID,
		"urls": map[string]any{
			"successUrl": successURL,
			"failureUrl": failureURL,
		},
	}
	respBody, err := c.doRESTCall(ctx, "POST", "/v2/users/idp_intents", body)
	if err != nil {
		return "", err
	}
	var resp struct {
		AuthURL string `json:"authUrl"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return "", fmt.Errorf("unmarshal idp intent: %w", err)
	}
	return resp.AuthURL, nil
}

// --- Management REST methods ---

func (c *ZitadelClient) restDeactivateUser(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "POST", "/management/v1/users/"+userID+"/_deactivate", map[string]any{})
	return err
}

func (c *ZitadelClient) restReactivateUser(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "POST", "/management/v1/users/"+userID+"/_reactivate", map[string]any{})
	return err
}

func (c *ZitadelClient) restRemoveUser(ctx context.Context, userID string) error {
	_, err := c.doRESTCall(ctx, "DELETE", "/management/v1/users/"+userID, nil)
	return err
}

// --- High-level REST methods (multi-step flows) ---

func (c *ZitadelClient) restSignIn(ctx context.Context, email, password string) (*TokenResponse, error) {
	sessionID, sessionToken, err := c.restCreateSession(ctx, email, password)
	if err != nil {
		return nil, err
	}

	sessResp, err := c.restGetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	userID := sessResp.Session.Factors.User.ID

	// Check for MFA factors
	var availableMethods []string
	factors, factorsErr := c.restListAuthFactors(ctx, userID)
	if factorsErr == nil {
		for _, f := range factors {
			if !f.isReady() {
				continue
			}
			if ft := f.factorType(); ft != "" {
				availableMethods = append(availableMethods, ft)
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
		sessResp.Session.Factors.User.LoginName,
		sessResp.Session.Factors.User.DisplayName,
	)
}

func (c *ZitadelClient) restSignUp(ctx context.Context, req SignUpRequest) (*TokenResponse, error) {
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

	userID, err := c.restAddHumanUser(ctx, req.Email, req.Password, firstName, lastName, name)
	if err != nil {
		return nil, err
	}
	log.Info().Str("userId", userID).Str("email", req.Email).Msg("user created via REST API")

	return c.restSignIn(ctx, req.Email, req.Password)
}

func (c *ZitadelClient) restGetUser(ctx context.Context, userID string) (*UserInfo, error) {
	u, err := c.restGetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	var (
		email       string
		phone       string
		confirmed   *string
		displayName string
		firstName   string
		lastName    string
	)

	if u.Human != nil {
		email = u.Human.Email.Email
		if u.Human.Email.IsVerified {
			t := time.Now().Format(time.RFC3339)
			confirmed = &t
		}
		phone = u.Human.Phone.Phone
		displayName = u.Human.Profile.DisplayName
		firstName = u.Human.Profile.GivenName
		lastName = u.Human.Profile.FamilyName
	}

	metadata := map[string]any{"name": displayName}
	if firstName != "" {
		metadata["given_name"] = firstName
	}
	if lastName != "" {
		metadata["family_name"] = lastName
	}

	totpEnabled, otpEmailEnabled, otpSMSEnabled, mfaEnabled := false, false, false, false
	factors, factorsErr := c.restListAuthFactors(ctx, userID)
	if factorsErr == nil {
		for _, f := range factors {
			if !f.isReady() {
				continue
			}
			switch f.factorType() {
			case "totp":
				totpEnabled = true
				mfaEnabled = true
			case "otp_email":
				otpEmailEnabled = true
				mfaEnabled = true
			case "otp_sms":
				otpSMSEnabled = true
				mfaEnabled = true
			}
		}
	}

	return &UserInfo{
		ID:               u.UserID,
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

func (c *ZitadelClient) restVerifyLoginMFA(ctx context.Context, sessionID, sessionToken, method, code string) (*TokenResponse, error) {
	checks := map[string]any{}
	switch method {
	case "totp":
		checks["totp"] = map[string]any{"code": code}
	case "otp_email":
		checks["otpEmail"] = map[string]any{"code": code}
	case "otp_sms":
		checks["otpSms"] = map[string]any{"code": code}
	case "recovery_code":
		checks["recoveryCode"] = map[string]any{"code": code}
	default:
		return nil, &AuthError{Code: 400, Message: "invalid MFA method"}
	}

	if err := c.restSetSession(ctx, sessionID, sessionToken, checks, nil); err != nil {
		return nil, err
	}

	sessResp, err := c.restGetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	return c.buildSessionTokenResponse(
		sessionID, sessionToken,
		sessResp.Session.Factors.User.ID,
		sessResp.Session.Factors.User.LoginName,
		sessResp.Session.Factors.User.DisplayName,
	)
}

func (c *ZitadelClient) restSendOTPChallenge(ctx context.Context, sessionID, sessionToken, method string) error {
	var challenges map[string]any
	switch method {
	case "otp_email":
		challenges = map[string]any{
			"otpEmail": map[string]any{
				"sendCode": map[string]any{},
			},
		}
	case "otp_sms":
		challenges = map[string]any{
			"otpSms": map[string]any{},
		}
	default:
		return nil
	}
	return c.restSetSession(ctx, sessionID, sessionToken, nil, challenges)
}

func (c *ZitadelClient) restListAllUsers(ctx context.Context) ([]*UserInfo, error) {
	users, err := c.restListUsers(ctx, 2000, nil)
	if err != nil {
		return nil, err
	}
	var result []*UserInfo
	for _, u := range users {
		if u.Human == nil {
			continue
		}
		result = append(result, &UserInfo{
			ID:           u.UserID,
			Email:        u.Human.Email.Email,
			Phone:        u.Human.Phone.Phone,
			UserMetadata: map[string]any{"name": u.Human.Profile.DisplayName},
		})
	}
	return result, nil
}

func (c *ZitadelClient) restFindUserByEmail(ctx context.Context, email string) (string, error) {
	queries := []map[string]any{
		{
			"emailQuery": map[string]any{
				"emailAddress": email,
			},
		},
	}
	users, err := c.restListUsers(ctx, 1, queries)
	if err != nil {
		return "", err
	}
	if len(users) == 0 {
		return "", fmt.Errorf("user not found")
	}
	return users[0].UserID, nil
}

func (c *ZitadelClient) restUpdateUser(ctx context.Context, userID string, req UpdateUserRequest) (*UserInfo, error) {
	var profile map[string]any
	if req.Data != nil {
		name, _ := req.Data["name"].(string)
		if name != "" {
			firstName := name
			lastName := "-"
			if parts := strings.SplitN(name, " ", 2); len(parts) == 2 {
				firstName = parts[0]
				lastName = parts[1]
			}
			profile = map[string]any{
				"givenName":   firstName,
				"familyName":  lastName,
				"displayName": name,
			}
		}
	}
	var phone *string
	if req.Phone != "" {
		phone = &req.Phone
	}
	if err := c.restUpdateHumanUser(ctx, userID, profile, phone); err != nil {
		return nil, err
	}
	return c.restGetUser(ctx, userID)
}

func (c *ZitadelClient) restLogout(ctx context.Context, claims *TokenClaims, rawToken string) error {
	if claims != nil && claims.SessionID != "" {
		return c.restDeleteSession(ctx, claims.SessionID)
	}
	return c.revokeToken(ctx, rawToken)
}

func (c *ZitadelClient) restRefreshSessionToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(refreshToken)
	if err != nil {
		return nil, &AuthError{Code: 401, Message: "invalid refresh token"}
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return nil, &AuthError{Code: 401, Message: "invalid refresh token format"}
	}
	sessionID := parts[0]
	sessResp, err := c.restGetSession(ctx, sessionID)
	if err != nil {
		return nil, &AuthError{Code: 401, Message: "session expired or invalid"}
	}
	return c.buildSessionTokenResponse(
		sessionID, parts[1],
		sessResp.Session.Factors.User.ID,
		sessResp.Session.Factors.User.LoginName,
		sessResp.Session.Factors.User.DisplayName,
	)
}

func (c *ZitadelClient) restValidateSessionToken(ctx context.Context, tokenStr string) (*TokenClaims, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(tokenStr)
	if err != nil {
		return nil, &AuthError{Code: 401, Message: "invalid token"}
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return nil, &AuthError{Code: 401, Message: "invalid token format"}
	}
	sessionID := parts[0]
	sessResp, err := c.restGetSession(ctx, sessionID)
	if err != nil {
		return nil, &AuthError{Code: 401, Message: "session expired or invalid"}
	}
	return &TokenClaims{
		Subject:     sessResp.Session.Factors.User.ID,
		Email:       sessResp.Session.Factors.User.LoginName,
		DisplayName: sessResp.Session.Factors.User.DisplayName,
		SessionID:   sessionID,
	}, nil
}

func (c *ZitadelClient) restGetSessionUserDetails(ctx context.Context, sessionID string) (string, string, string, error) {
	sessResp, err := c.restGetSession(ctx, sessionID)
	if err != nil {
		return "", "", "", err
	}
	f := sessResp.Session.Factors.User
	return f.ID, f.LoginName, f.DisplayName, nil
}

func (c *ZitadelClient) restVerifyMFASession(ctx context.Context, sessionID, sessionToken, totpCode string) error {
	checks := map[string]any{
		"totp": map[string]any{
			"code": totpCode,
		},
	}
	return c.restSetSession(ctx, sessionID, sessionToken, checks, nil)
}

func (c *ZitadelClient) restChangePassword(ctx context.Context, userID, oldPwd, newPwd string) error {
	return c.restSetPassword(ctx, userID, newPwd, false, &oldPwd, nil)
}

func (c *ZitadelClient) restAdminResetPassword(ctx context.Context, userID, newPwd string) error {
	return c.restSetPassword(ctx, userID, newPwd, true, nil, nil)
}

func (c *ZitadelClient) restResetPasswordWithCode(ctx context.Context, userID, code, newPwd string) error {
	return c.restSetPassword(ctx, userID, newPwd, false, nil, &code)
}

func (c *ZitadelClient) restRequestPasswordReset(ctx context.Context, userID string) (string, error) {
	return c.restPasswordReset(ctx, userID)
}
