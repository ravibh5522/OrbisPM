package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// OrgThemeConfig holds the organisation-wide theme configuration set by admins.
type OrgThemeConfig struct {
	OrgID        uuid.UUID       `json:"org_id"`
	BaseTheme    string          `json:"base_theme"`
	CustomColors json.RawMessage `json:"custom_colors"`
	Locked       bool            `json:"locked"`
	UpdatedAt    time.Time       `json:"updated_at"`
	UpdatedBy    *uuid.UUID      `json:"updated_by,omitempty"`
}
