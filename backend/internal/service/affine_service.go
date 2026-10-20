package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/affine"
	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// affineCacheTTL bounds how stale a cached provisioning result can get if
// AFFiNE is reset underneath a running API. Sign-in is rate-limited by
// AFFiNE, so repeated Canvas opens must not each re-authenticate.
const affineCacheTTL = 30 * time.Minute

// AffineService lazily provisions one AFFiNE workspace per org and one doc
// per project inside it, signs the viewing user into AFFiNE, and hands back
// what the frontend needs to embed it.
type AffineService struct {
	repo       repository.AffineRepository
	client     *affine.Client
	projects   repository.ProjectRepository
	orgs       repository.OrgRepository
	publicURL  string
	userSecret []byte
	// emailLookup fetches a user's email from the identity provider when the
	// local row has none (token without an email claim).
	emailLookup func(ctx context.Context, zitadelID string) (string, error)

	mu    sync.Mutex
	cache map[string]cachedProjectDoc // key: userID/projectID
}

type cachedProjectDoc struct {
	result  *ProjectDocResult
	expires time.Time
}

func NewAffineService(repo repository.AffineRepository, client *affine.Client, projects repository.ProjectRepository, orgs repository.OrgRepository, publicURL, userSecret string) *AffineService {
	return &AffineService{
		repo: repo, client: client, projects: projects, orgs: orgs,
		publicURL: publicURL, userSecret: []byte(userSecret),
		cache: make(map[string]cachedProjectDoc),
	}
}

// SetEmailLookup wires the identity-provider fallback used to heal users whose
// local email is empty.
func (s *AffineService) SetEmailLookup(f func(ctx context.Context, zitadelID string) (string, error)) {
	s.emailLookup = f
}

// resolveEmail returns the user's email, healing an empty local value from the
// identity provider. AFFiNE accounts must never be created with an empty email.
func (s *AffineService) resolveEmail(ctx context.Context, userID uuid.UUID, email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email != "" {
		return email, nil
	}
	if s.emailLookup != nil {
		if zid, err := s.repo.GetZitadelUserID(ctx, userID); err == nil && zid != "" {
			if e, err := s.emailLookup(ctx, zid); err == nil && strings.TrimSpace(e) != "" {
				e = strings.ToLower(strings.TrimSpace(e))
				_ = s.repo.SetUserEmail(ctx, userID, e)
				return e, nil
			}
		}
	}
	return "", errors.New("user has no email on record; cannot create canvas account")
}

// ProjectDocResult is what the frontend needs to render the embed.
type ProjectDocResult struct {
	WorkspaceID string `json:"workspace_id"`
	DocID       string `json:"doc_id"`
	EmbedURL    string `json:"embed_url"`
	// Cookies sign the viewer into AFFiNE. Zitadel's login pages forbid
	// framing (frame-ancestors 'none'), so OIDC can't run inside the iframe;
	// the backend vouches for the user instead and the frontend sets these
	// before mounting it.
	Cookies []affine.SessionCookie `json:"cookies"`
}

// EnsureProjectDoc returns the project's AFFiNE doc, provisioning the org's
// workspace and/or the project's doc on first access, and a signed-in
// AFFiNE session for userID.
//
// AFFiNE's GraphQL schema has no createDoc mutation (docs are Yjs CRDTs
// only its sync gateway accepts), and it renders "content does not exist"
// for a doc ID it has never seen — so the doc is created through the
// affine-bridge sidecar, which speaks that sync protocol.
func (s *AffineService) EnsureProjectDoc(ctx context.Context, orgID, projectID, userID uuid.UUID) (*ProjectDocResult, error) {
	// An empty HMAC key would make every user's AFFiNE password predictable.
	if len(s.userSecret) == 0 {
		return nil, errors.New("AFFINE_USER_SECRET is not configured")
	}
	key := userID.String() + "/" + projectID.String()
	s.mu.Lock()
	hit, ok := s.cache[key]
	s.mu.Unlock()
	if ok && time.Now().Before(hit.expires) {
		return hit.result, nil
	}

	ws, err := s.repo.GetOrgWorkspace(ctx, nil, orgID)
	if err != nil {
		if !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("get org workspace: %w", err)
		}
		workspaceID, createErr := s.client.EnsureWorkspace(ctx)
		if createErr != nil {
			return nil, fmt.Errorf("create affine workspace: %w", createErr)
		}
		ws, err = s.repo.CreateOrgWorkspace(ctx, nil, orgID, workspaceID)
		if err != nil {
			return nil, fmt.Errorf("save org workspace: %w", err)
		}
	}

	doc, err := s.repo.GetProjectDoc(ctx, nil, projectID)
	if err != nil {
		if !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("get project doc: %w", err)
		}
		doc, err = s.repo.CreateProjectDoc(ctx, nil, orgID, projectID, newAffineDocID())
		if err != nil {
			return nil, fmt.Errorf("save project doc: %w", err)
		}
	}

	project, err := s.projects.GetByID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}
	org, err := s.orgs.GetByID(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("get org: %w", err)
	}
	if err := s.client.EnsureDoc(ctx, ws.AffineWorkspaceID, doc.AffineDocID, project.Name, org.Name); err != nil {
		return nil, fmt.Errorf("ensure affine doc: %w", err)
	}

	email, name, err := s.repo.GetUserIdentity(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user identity: %w", err)
	}
	email, err = s.resolveEmail(ctx, userID, email)
	if err != nil {
		return nil, err
	}
	cookies, err := s.client.UserSession(ctx, email, name, s.userPassword(userID))
	if err != nil {
		return nil, fmt.Errorf("affine session: %w", err)
	}
	if err := s.client.EnsureMember(ctx, ws.AffineWorkspaceID, email, cookies); err != nil {
		return nil, fmt.Errorf("affine membership: %w", err)
	}

	result := &ProjectDocResult{
		WorkspaceID: ws.AffineWorkspaceID,
		DocID:       doc.AffineDocID,
		EmbedURL:    fmt.Sprintf("%s/workspace/%s/%s", s.publicURL, ws.AffineWorkspaceID, doc.AffineDocID),
		Cookies:     cookies,
	}
	s.mu.Lock()
	s.cache[key] = cachedProjectDoc{result: result, expires: time.Now().Add(affineCacheTTL)}
	s.mu.Unlock()
	return result, nil
}

// userPassword derives the user's AFFiNE password. AFFiNE caps passwords at
// 32 characters; 32 base64url characters of HMAC-SHA256 is 192 bits.
func (s *AffineService) userPassword(userID uuid.UUID) string {
	mac := hmac.New(sha256.New, s.userSecret)
	mac.Write([]byte(userID.String()))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))[:32]
}

// newAffineDocID mints an ID in AFFiNE's own style (10 URL-safe characters).
func newAffineDocID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)[:10]
}
