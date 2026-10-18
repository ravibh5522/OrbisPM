package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

// AffineRepository persists the org->workspace and project->doc mappings
// backing the AFFiNE integration. It never talks to AFFiNE itself — that's
// internal/affine.Client's job — this just stores the IDs it returns.
type AffineRepository interface {
	GetOrgWorkspace(ctx context.Context, tx pgx.Tx, orgID uuid.UUID) (*domain.OrgAffineWorkspace, error)
	CreateOrgWorkspace(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, workspaceID string) (*domain.OrgAffineWorkspace, error)
	GetProjectDoc(ctx context.Context, tx pgx.Tx, projectID uuid.UUID) (*domain.ProjectAffineDoc, error)
	CreateProjectDoc(ctx context.Context, tx pgx.Tx, orgID, projectID uuid.UUID, docID string) (*domain.ProjectAffineDoc, error)
	// GetUserIdentity returns the email and display name the user's AFFiNE
	// account is created under.
	GetUserIdentity(ctx context.Context, userID uuid.UUID) (email, name string, err error)
}

type affineRepo struct {
	pool *pgxpool.Pool
}

func NewAffineRepo(pool *pgxpool.Pool) AffineRepository {
	return &affineRepo{pool: pool}
}

func (r *affineRepo) GetOrgWorkspace(ctx context.Context, tx pgx.Tx, orgID uuid.UUID) (*domain.OrgAffineWorkspace, error) {
	q := conn(r.pool, tx)
	var w domain.OrgAffineWorkspace
	err := q.QueryRow(ctx,
		`SELECT org_id, affine_workspace_id, created_at FROM org_affine_workspaces WHERE org_id = $1`,
		orgID,
	).Scan(&w.OrgID, &w.AffineWorkspaceID, &w.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &w, nil
}

// CreateOrgWorkspace is idempotent under a concurrent-request race: if two
// requests both find no existing workspace and both create one in AFFiNE,
// only the first INSERT here wins — the ON CONFLICT no-op update makes the
// second call just return the already-stored row instead of erroring or
// creating a duplicate mapping. The orphaned second AFFiNE workspace (if
// this race happens) is an accepted, rare cost — not worth a distributed
// lock for a lazily-provisioned-once resource.
func (r *affineRepo) CreateOrgWorkspace(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, workspaceID string) (*domain.OrgAffineWorkspace, error) {
	q := conn(r.pool, tx)
	var w domain.OrgAffineWorkspace
	err := q.QueryRow(ctx,
		`INSERT INTO org_affine_workspaces (org_id, affine_workspace_id)
		 VALUES ($1, $2)
		 ON CONFLICT (org_id) DO UPDATE SET org_id = org_affine_workspaces.org_id
		 RETURNING org_id, affine_workspace_id, created_at`,
		orgID, workspaceID,
	).Scan(&w.OrgID, &w.AffineWorkspaceID, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *affineRepo) GetProjectDoc(ctx context.Context, tx pgx.Tx, projectID uuid.UUID) (*domain.ProjectAffineDoc, error) {
	q := conn(r.pool, tx)
	var d domain.ProjectAffineDoc
	err := q.QueryRow(ctx,
		`SELECT project_id, org_id, affine_doc_id, created_at FROM project_affine_docs WHERE project_id = $1`,
		projectID,
	).Scan(&d.ProjectID, &d.OrgID, &d.AffineDocID, &d.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

// CreateProjectDoc — see CreateOrgWorkspace's comment; same idempotent-under-race shape.
func (r *affineRepo) CreateProjectDoc(ctx context.Context, tx pgx.Tx, orgID, projectID uuid.UUID, docID string) (*domain.ProjectAffineDoc, error) {
	q := conn(r.pool, tx)
	var d domain.ProjectAffineDoc
	err := q.QueryRow(ctx,
		`INSERT INTO project_affine_docs (project_id, org_id, affine_doc_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (project_id) DO UPDATE SET project_id = project_affine_docs.project_id
		 RETURNING project_id, org_id, affine_doc_id, created_at`,
		projectID, orgID, docID,
	).Scan(&d.ProjectID, &d.OrgID, &d.AffineDocID, &d.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *affineRepo) GetUserIdentity(ctx context.Context, userID uuid.UUID) (string, string, error) {
	var email, name string
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(email, ''), COALESCE(NULLIF(display_name, ''), email, '') FROM users WHERE id = $1`,
		userID,
	).Scan(&email, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", domain.ErrNotFound
	}
	return email, name, err
}
