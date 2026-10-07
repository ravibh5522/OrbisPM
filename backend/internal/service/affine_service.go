package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/affine"
	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// AffineService lazily provisions one AFFiNE workspace per org and one doc
// per project inside it, then hands back an embed URL for the frontend to
// point an iframe at.
type AffineService struct {
	repo      repository.AffineRepository
	client    *affine.Client
	publicURL string
}

func NewAffineService(repo repository.AffineRepository, client *affine.Client, publicURL string) *AffineService {
	return &AffineService{repo: repo, client: client, publicURL: publicURL}
}

// ProjectDocResult is what the frontend needs to render the embed.
type ProjectDocResult struct {
	WorkspaceID string `json:"workspace_id"`
	DocID       string `json:"doc_id"`
	EmbedURL    string `json:"embed_url"`
}

// EnsureProjectDoc returns the project's AFFiNE doc, provisioning the org's
// workspace and/or the project's doc on first access. Doc creation is
// local-only (a fresh UUID, stored in project_affine_docs) — AFFiNE's
// GraphQL schema has no createDoc mutation (docs are Yjs-CRDT content;
// confirmed via live introspection there's nothing but doc *permission*
// mutations like publishDoc/grantDocUserRoles). AFFiNE's own client
// initializes a blank doc the first time its editor opens an unseen doc ID
// inside a workspace it has access to — the same as a user clicking "New
// Doc" through its UI — so we only need a stable ID to route to, not to
// pre-populate content ourselves.
func (s *AffineService) EnsureProjectDoc(ctx context.Context, orgID, projectID uuid.UUID) (*ProjectDocResult, error) {
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
		doc, err = s.repo.CreateProjectDoc(ctx, nil, orgID, projectID, uuid.New().String())
		if err != nil {
			return nil, fmt.Errorf("save project doc: %w", err)
		}
	}

	return &ProjectDocResult{
		WorkspaceID: ws.AffineWorkspaceID,
		DocID:       doc.AffineDocID,
		EmbedURL:    fmt.Sprintf("%s/workspace/%s/%s", s.publicURL, ws.AffineWorkspaceID, doc.AffineDocID),
	}, nil
}
