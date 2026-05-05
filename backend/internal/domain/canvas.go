package domain

import (
	"time"

	"github.com/google/uuid"
)

// CanvasShapeType is the set of supported shape primitives on a canvas.
type CanvasShapeType string

const (
	CanvasShapeRect     CanvasShapeType = "rect"
	CanvasShapeEllipse  CanvasShapeType = "ellipse"
	CanvasShapeDiamond  CanvasShapeType = "diamond"
	CanvasShapeTriangle CanvasShapeType = "triangle"
	CanvasShapeSticky   CanvasShapeType = "sticky"
	CanvasShapeText     CanvasShapeType = "text"
	CanvasShapeTask     CanvasShapeType = "task"
)

// CanvasShape represents a single drawn shape on a canvas.
type CanvasShape struct {
	ID           string          `json:"id"`
	Type         CanvasShapeType `json:"type"`
	X            float64         `json:"x"`
	Y            float64         `json:"y"`
	Width        float64         `json:"width"`
	Height       float64         `json:"height"`
	Rotation     float64         `json:"rotation,omitempty"`
	FillColor    string          `json:"fill_color,omitempty"`
	StrokeColor  string          `json:"stroke_color,omitempty"`
	StrokeWidth  float64         `json:"stroke_width,omitempty"`
	Text         string          `json:"text,omitempty"`
	LinkedTaskID *uuid.UUID      `json:"linked_task_id,omitempty"`
	Extra        map[string]any  `json:"extra,omitempty"`
}

// CanvasConnectorMode controls how a connector is drawn.
type CanvasConnectorMode string

const (
	ConnectorStraight   CanvasConnectorMode = "straight"
	ConnectorOrthogonal CanvasConnectorMode = "orthogonal"
	ConnectorCurve      CanvasConnectorMode = "curve"
)

// CanvasConnector represents a directed edge between two shapes.
type CanvasConnector struct {
	ID          string              `json:"id"`
	SourceID    string              `json:"source_id"`
	TargetID    string              `json:"target_id"`
	Mode        CanvasConnectorMode `json:"mode,omitempty"`
	StrokeColor string              `json:"stroke_color,omitempty"`
	StrokeWidth float64             `json:"stroke_width,omitempty"`
	Label       string              `json:"label,omitempty"`
}

// CanvasState is the full serialisable drawing state stored as JSONB.
type CanvasState struct {
	Version    int               `json:"version"`
	Background string            `json:"background,omitempty"`
	Shapes     []CanvasShape     `json:"shapes"`
	Connectors []CanvasConnector `json:"connectors"`
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
