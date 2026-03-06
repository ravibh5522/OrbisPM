package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// GoTrueClient communicates with the GoTrue (Supabase Auth) service.
type GoTrueClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewGoTrueClient creates a new GoTrue HTTP client.
func NewGoTrueClient(baseURL string) *GoTrueClient {
	return &GoTrueClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SignUpRequest holds parameters for user signup.
type SignUpRequest struct {
	Email    string         `json:"email"`
	Password string         `json:"password"`
	Data     map[string]any `json:"data,omitempty"`
}

// SignUpResponse holds the GoTrue signup response.
type SignUpResponse struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	TokenType    string    `json:"token_type"`
	ExpiresIn    int       `json:"expires_in"`
}

// TokenResponse holds GoTrue token response.
type TokenResponse struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	TokenType    string    `json:"token_type"`
	ExpiresIn    int       `json:"expires_in"`
	User         *UserInfo `json:"user"`
}

// UserInfo holds GoTrue user information.
type UserInfo struct {
	ID               uuid.UUID      `json:"id"`
	Email            string         `json:"email"`
	EmailConfirmedAt *string        `json:"email_confirmed_at"`
	Phone            string         `json:"phone"`
	UserMetadata     map[string]any `json:"user_metadata"`
	AppMetadata      map[string]any `json:"app_metadata"`
	CreatedAt        string         `json:"created_at"`
	UpdatedAt        string         `json:"updated_at"`
}

// GoTrueError represents an error from GoTrue.
type GoTrueError struct {
	Code    int    `json:"code"`
	Message string `json:"msg"`
	Error_  string `json:"error"`
}

func (e *GoTrueError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("gotrue: %s (code=%d)", e.Message, e.Code)
	}
	return fmt.Sprintf("gotrue: %s (code=%d)", e.Error_, e.Code)
}

// SignUp registers a new user with GoTrue.
func (c *GoTrueClient) SignUp(ctx context.Context, req SignUpRequest) (*TokenResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal signup: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/signup", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("apikey", "")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("signup request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, c.parseError(resp)
	}

	var result TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode signup response: %w", err)
	}
	return &result, nil
}

// SignIn authenticates a user with email and password.
func (c *GoTrueClient) SignIn(ctx context.Context, email, password string) (*TokenResponse, error) {
	body, err := json.Marshal(map[string]string{
		"email":    email,
		"password": password,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal signin: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/token?grant_type=password", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("signin request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, c.parseError(resp)
	}

	var result TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode signin response: %w", err)
	}
	return &result, nil
}

// RefreshToken refreshes an access token.
func (c *GoTrueClient) RefreshToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	body, _ := json.Marshal(map[string]string{
		"refresh_token": refreshToken,
	})

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/token?grant_type=refresh_token", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, c.parseError(resp)
	}

	var result TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetUser retrieves the current user from GoTrue using an access token.
func (c *GoTrueClient) GetUser(ctx context.Context, accessToken string) (*UserInfo, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/user", nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, c.parseError(resp)
	}

	var user UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// AdminGetUser retrieves a user by ID using the service role key.
func (c *GoTrueClient) AdminGetUser(ctx context.Context, serviceRoleKey string, userID uuid.UUID) (*UserInfo, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/admin/users/%s", c.baseURL, userID), nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+serviceRoleKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, c.parseError(resp)
	}

	var user UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// Logout invalidates the user's session.
func (c *GoTrueClient) Logout(ctx context.Context, accessToken string) error {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/logout", nil)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return c.parseError(resp)
	}
	return nil
}

// HealthCheck checks GoTrue health.
func (c *GoTrueClient) HealthCheck(ctx context.Context) error {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("gotrue health: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gotrue unhealthy: status %d", resp.StatusCode)
	}
	return nil
}

func (c *GoTrueClient) parseError(resp *http.Response) error {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("gotrue error: status %d", resp.StatusCode)
	}

	var gotrueErr GoTrueError
	if err := json.Unmarshal(body, &gotrueErr); err != nil {
		log.Debug().Str("body", string(body)).Int("status", resp.StatusCode).Msg("gotrue raw error")
		return fmt.Errorf("gotrue error: status %d body=%s", resp.StatusCode, string(body))
	}
	gotrueErr.Code = resp.StatusCode
	return &gotrueErr
}
