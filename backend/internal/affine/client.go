// Package affine talks to a self-hosted AFFiNE instance's GraphQL API to
// provision workspaces and docs for Simplify Projects's Canvas tab. See
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
	bridgeURL   string
	adminEmail  string
	adminPass   string
	httpClient  *http.Client

	mu           sync.Mutex
	sessionToken string
}

func NewClient(internalURL, bridgeURL, adminEmail, adminPassword string) *Client {
	return &Client{
		internalURL: internalURL,
		bridgeURL:   bridgeURL,
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

// SessionCookie is one cookie AFFiNE sets at sign-in. The browser needs all
// three for its web client to treat the visitor as signed in.
type SessionCookie struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Expires int64  `json:"expires,omitempty"` // unix seconds; 0 = session cookie
}

// signIn authenticates with AFFiNE's real login endpoint — there is no
// standing API-key/service-account mechanism for this (confirmed against
// the live GraphQL schema: createMcpCredential et al. are workspace-scoped
// tokens for AI/MCP tool access, not a general service credential, and
// nothing else in the schema serves this purpose). The resulting session
// cookie is valid for roughly two weeks per AFFiNE's own Set-Cookie Expires.
func (c *Client) signIn(ctx context.Context, email, password string) ([]SessionCookie, error) {
	body, err := json.Marshal(map[string]string{"email": email, "password": password})
	if err != nil {
		return nil, fmt.Errorf("marshal sign-in body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.internalURL+"/api/auth/sign-in", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build sign-in request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sign in: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sign in returned status %d", resp.StatusCode)
	}
	var cookies []SessionCookie
	for _, ck := range resp.Cookies() {
		sc := SessionCookie{Name: ck.Name, Value: ck.Value}
		if !ck.Expires.IsZero() {
			sc.Expires = ck.Expires.Unix()
		}
		cookies = append(cookies, sc)
	}
	return cookies, nil
}

func sessionToken(cookies []SessionCookie) string {
	for _, ck := range cookies {
		if ck.Name == "affine_session" {
			return ck.Value
		}
	}
	return ""
}

func (c *Client) currentSession(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sessionToken != "" {
		return c.sessionToken, nil
	}
	cookies, err := c.signIn(ctx, c.adminEmail, c.adminPass)
	if err != nil {
		return "", fmt.Errorf("%w (check AFFINE_ADMIN_EMAIL/PASSWORD)", err)
	}
	token := sessionToken(cookies)
	if token == "" {
		return "", fmt.Errorf("sign-in response had no affine_session cookie")
	}
	c.sessionToken = token
	return token, nil
}

func (c *Client) invalidateSession() {
	c.mu.Lock()
	c.sessionToken = ""
	c.mu.Unlock()
}

// postGraphQL sends one query/mutation with the given session token and
// returns the HTTP status alongside any error so callers can decide whether
// a 401 is worth a re-login.
func (c *Client) postGraphQL(ctx context.Context, token, query string, variables map[string]any, out any) (int, error) {
	reqBody, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return 0, fmt.Errorf("marshal graphql request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.internalURL+"/graphql", bytes.NewReader(reqBody))
	if err != nil {
		return 0, fmt.Errorf("build graphql request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "affine_session", Value: token})

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("graphql call: %w", err)
	}
	respBody, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return resp.StatusCode, fmt.Errorf("read graphql response: %w", err)
	}

	var envelope graphQLEnvelope
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return resp.StatusCode, fmt.Errorf("decode graphql response (status %d): %w", resp.StatusCode, err)
	}
	if len(envelope.Errors) > 0 {
		return resp.StatusCode, fmt.Errorf("graphql error: %s", envelope.Errors[0].Message)
	}
	if out != nil {
		if err := json.Unmarshal(envelope.Data, out); err != nil {
			return resp.StatusCode, fmt.Errorf("decode graphql data: %w", err)
		}
	}
	return resp.StatusCode, nil
}

// doGraphQL runs a query as the admin service account, transparently
// re-authenticating once if the cached session has expired.
func (c *Client) doGraphQL(ctx context.Context, query string, variables map[string]any, out any) error {
	for attempt := 0; attempt < 2; attempt++ {
		token, err := c.currentSession(ctx)
		if err != nil {
			return fmt.Errorf("get session: %w", err)
		}
		status, err := c.postGraphQL(ctx, token, query, variables, out)
		if status == http.StatusUnauthorized && attempt == 0 {
			c.invalidateSession()
			continue
		}
		return err
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

// UserSession signs the given Simplify Projects user into AFFiNE, creating their AFFiNE
// account on first use. The account exists only to carry the session — the
// password is derived by the caller and never shown to anyone — so there is
// no separate AFFiNE login for the user to manage.
func (c *Client) UserSession(ctx context.Context, email, name, password string) ([]SessionCookie, error) {
	cookies, signInErr := c.signIn(ctx, email, password)
	if signInErr == nil {
		return cookies, nil
	}
	err := c.doGraphQL(ctx,
		`mutation($i: CreateUserInput!) { createUser(input: $i) { id } }`,
		map[string]any{"i": map[string]string{"email": email, "name": name, "password": password}}, nil)
	if err != nil {
		// Account exists but the derived password doesn't match, e.g. the
		// user first signed in to AFFiNE some other way.
		return nil, fmt.Errorf("sign in as %s failed (%v) and account creation failed: %w", email, signInErr, err)
	}
	return c.signIn(ctx, email, password)
}

// EnsureMember makes the signed-in user a member of the workspace. AFFiNE
// only lets members open a workspace, and membership is invite-then-accept:
// the admin invites by email, the invitee accepts under their own session.
func (c *Client) EnsureMember(ctx context.Context, workspaceID, email string, userCookies []SessionCookie) error {
	token := sessionToken(userCookies)

	var memberOf struct {
		Workspaces []struct {
			ID string `json:"id"`
		} `json:"workspaces"`
	}
	if _, err := c.postGraphQL(ctx, token, `query { workspaces { id } }`, nil, &memberOf); err != nil {
		return fmt.Errorf("list workspaces: %w", err)
	}
	for _, w := range memberOf.Workspaces {
		if w.ID == workspaceID {
			return nil
		}
	}

	var invited struct {
		InviteMembers []struct {
			InviteID string  `json:"inviteId"`
			Error    *string `json:"error"`
		} `json:"inviteMembers"`
	}
	err := c.doGraphQL(ctx,
		`mutation($ws: String!, $emails: [String!]!) { inviteMembers(workspaceId: $ws, emails: $emails) { inviteId error } }`,
		map[string]any{"ws": workspaceID, "emails": []string{email}}, &invited)
	if err != nil {
		return fmt.Errorf("invite member: %w", err)
	}
	if len(invited.InviteMembers) != 1 || invited.InviteMembers[0].Error != nil || invited.InviteMembers[0].InviteID == "" {
		return fmt.Errorf("invite member: unexpected result %+v", invited.InviteMembers)
	}

	var accepted struct {
		AcceptInviteByID bool `json:"acceptInviteById"`
	}
	_, err = c.postGraphQL(ctx, token,
		`mutation($id: String!) { acceptInviteById(inviteId: $id) }`,
		map[string]any{"id": invited.InviteMembers[0].InviteID}, &accepted)
	if err != nil {
		return fmt.Errorf("accept invite: %w", err)
	}
	if !accepted.AcceptInviteByID {
		return fmt.Errorf("accept invite: AFFiNE declined the invitation")
	}
	return nil
}

// EnsureDoc makes sure the workspace has a root doc and that docID exists in
// it, via the affine-bridge sidecar — see affine-bridge/server.mjs for why
// this can't be done over GraphQL. Idempotent.
func (c *Client) EnsureDoc(ctx context.Context, workspaceID, docID, title, workspaceName string) error {
	body, err := json.Marshal(map[string]string{
		"workspaceId": workspaceID, "docId": docID, "title": title, "workspaceName": workspaceName,
	})
	if err != nil {
		return fmt.Errorf("marshal bridge request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.bridgeURL+"/docs", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build bridge request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("call affine-bridge: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("affine-bridge returned status %d: %s", resp.StatusCode, msg)
	}
	return nil
}
