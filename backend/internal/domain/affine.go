package domain

import (
	"time"

	"github.com/google/uuid"
)

// OrgAffineWorkspace maps an org to its single AFFiNE workspace.
type OrgAffineWorkspace struct {
	OrgID             uuid.UUID `json:"org_id"`
	AffineWorkspaceID string    `json:"affine_workspace_id"`
	CreatedAt         time.Time `json:"created_at"`
}

// ProjectAffineDoc maps a project to its AFFiNE doc, inside its org's workspace.
type ProjectAffineDoc struct {
	ProjectID   uuid.UUID `json:"project_id"`
	OrgID       uuid.UUID `json:"org_id"`
	AffineDocID string    `json:"affine_doc_id"`
	CreatedAt   time.Time `json:"created_at"`
}
