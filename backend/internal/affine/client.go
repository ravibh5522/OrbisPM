// Package affine talks to a self-hosted AFFiNE instance's GraphQL API to
// provision workspaces and docs for OrbisPM's Canvas tab. See
// backend/db/migrations/000031_affine_workspaces.up.sql for the mapping
// tables this backs, and internal/service/affine_service.go for the
// ensure-or-create logic built on top of this client.
package affine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// Client is not safe to construct more than once per process — it caches a
// single admin session in memory, shared across all callers.
type Client struct {
	internalURL string
	adminEmail  string
	adminPass   string
	httpClient  *http.Client

	mu           sync.Mutex
	sessionToken string
}

func NewClient(internalURL, adminEmail, adminPassword string) *Client {
	return &Client{
		internalURL: internalURL,
		adminEmail:  adminEmail,
		adminPass:   adminPassword,
		httpClient:  &http.Client{Timeout: 15 * time.Second},
	}
}

type graphQLError struct {
	Message string `json:"message"`
}

type graphQLEnvelope struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphQLError  `json:"errors"`
}

// signIn authenticates with AFFiNE's real login endpoint — there is no
// standing API-key/service-account mechanism for this (confirmed against
// the live GraphQL schema: createMcpCredential et al. are workspace-scoped
// tokens for AI/MCP tool access, not a general service credential, and
// nothing else in the schema serves this purpose). The resulting session
// cookie is valid for roughly two weeks per AFFiNE's own Set-Cookie Expires.
func (c *Client) signIn(ctx context.Context) (string, error) {
	body, err := json.Marshal(map[string]string{"email": c.adminEmail, "password": c.adminPass})
	if err != nil {
		return "", fmt.Errorf("marshal sign-in body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.internalURL+"/api/auth/sign-in", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build sign-in request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("sign in: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("sign in returned status %d (check AFFINE_ADMIN_EMAIL/PASSWORD)", resp.StatusCode)
	}
	for _, cookie := range resp.Cookies() {
		if cookie.Name == "affine_session" {
			return cookie.Value, nil
		}
	}
	return "", fmt.Errorf("sign-in response had no affine_session cookie")
}

func (c *Client) currentSession(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sessionToken != "" {
		return c.sessionToken, nil
	}
	token, err := c.signIn(ctx)
	if err != nil {
		return "", err
	}
	c.sessionToken = token
	return token, nil
}

func (c *Client) invalidateSession() {
	c.mu.Lock()
	c.sessionToken = ""
	c.mu.Unlock()
}

// doGraphQL sends one query/mutation, transparently re-authenticating once
// if the cached session has expired.
func (c *Client) doGraphQL(ctx context.Context, query string, variables map[string]any, out any) error {
	for attempt := 0; attempt < 2; attempt++ {
		token, err := c.currentSession(ctx)
		if err != nil {
			return fmt.Errorf("get session: %w", err)
		}

		reqBody, err := json.Marshal(map[string]any{"query": query, "variables": variables})
		if err != nil {
			return fmt.Errorf("marshal graphql request: %w", err)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.internalURL+"/graphql", bytes.NewReader(reqBody))
		if err != nil {
			return fmt.Errorf("build graphql request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "affine_session", Value: token})

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("graphql call: %w", err)
		}
		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return fmt.Errorf("read graphql response: %w", err)
		}

		if resp.StatusCode == http.StatusUnauthorized && attempt == 0 {
			c.invalidateSession()
			continue
		}

		var envelope graphQLEnvelope
		if err := json.Unmarshal(respBody, &envelope); err != nil {
			return fmt.Errorf("decode graphql response (status %d): %w", resp.StatusCode, err)
		}
		if len(envelope.Errors) > 0 {
			return fmt.Errorf("graphql error: %s", envelope.Errors[0].Message)
		}
		if out != nil {
			if err := json.Unmarshal(envelope.Data, out); err != nil {
				return fmt.Errorf("decode graphql data: %w", err)
			}
		}
		return nil
	}
	return fmt.Errorf("graphql call unauthorized after re-authenticating")
}

// EnsureWorkspace creates a new AFFiNE workspace and returns its ID.
// AFFiNE has no "get or create by name" lookup, so the caller (the service
// layer, via org_affine_workspaces) is the source of truth for idempotency —
// this is only ever called once per org, the first time it's needed.
func (c *Client) EnsureWorkspace(ctx context.Context) (string, error) {
	var result struct {
		CreateWorkspace struct {
			ID string `json:"id"`
		} `json:"createWorkspace"`
	}
	// init: null — confirmed via live introspection that `init` (an Upload
	// scalar, i.e. a Yjs binary snapshot) is nullable; omitting it lets
	// AFFiNE create the workspace with its own default empty state instead
	// of us needing to construct valid Yjs CRDT binary data ourselves.
	err := c.doGraphQL(ctx, `mutation { createWorkspace(init: null) { id } }`, nil, &result)
	if err != nil {
		return "", err
	}
	if result.CreateWorkspace.ID == "" {
		return "", fmt.Errorf("createWorkspace returned an empty id")
	}
	return result.CreateWorkspace.ID, nil
}
