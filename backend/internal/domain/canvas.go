package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// CanvasEntityLink binds a specific Excalidraw element to a live app entity
// (task today; other entity types are additive later) via an inline trigger
// character typed into the element's text (e.g. "@" for tasks). The backend
// treats entity_type/entity_id opaquely — resolving what an entity_type
// means and rendering its live state (status, color, progress, ...) is a
// frontend concern, so new link types never require a backend change.
type CanvasEntityLink struct {
	ElementID  string `json:"element_id"`
	Trigger    string `json:"trigger"`
	EntityType string `json:"entity_type"`
	EntityID   string `json:"entity_id"`
}

// CanvasState is the full serialisable drawing state stored as JSONB.
// Scene holds the embedded Excalidraw editor's own scene (elements,
// appState, files) verbatim — the backend never inspects or validates its
// shape, only persists it. Links is the one part the backend does touch.
type CanvasState struct {
	Version int                `json:"version"`
	Scene   json.RawMessage    `json:"scene,omitempty"`
	Links   []CanvasEntityLink `json:"links,omitempty"`
}

// ProjectCanvas is a whiteboard/canvas scoped to a project.
type ProjectCanvas struct {
	ID          uuid.UUID   `json:"id"`
	OrgID       uuid.UUID   `json:"org_id"`
	ProjectID   uuid.UUID   `json:"project_id"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	State       CanvasState `json:"state"`
	Version     int         `json:"version"`
	CreatedBy   *uuid.UUID  `json:"created_by,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}
