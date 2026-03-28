package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

// OrgThemeRepository handles persistence for org_theme_configs.
type OrgThemeRepository interface {
	Get(ctx context.Context, orgID uuid.UUID) (*domain.OrgThemeConfig, error)
	Upsert(ctx context.Context, cfg *domain.OrgThemeConfig) (*domain.OrgThemeConfig, error)
}

type orgThemeRepo struct {
	pool *pgxpool.Pool
}

// NewOrgThemeRepo creates a new OrgThemeRepository.
func NewOrgThemeRepo(pool *pgxpool.Pool) OrgThemeRepository {
	return &orgThemeRepo{pool: pool}
}

func (r *orgThemeRepo) Get(ctx context.Context, orgID uuid.UUID) (*domain.OrgThemeConfig, error) {
	var cfg domain.OrgThemeConfig
	var colorsRaw []byte
	err := r.pool.QueryRow(ctx,
		`SELECT org_id, base_theme, custom_colors, locked, updated_at, updated_by
		 FROM org_theme_configs WHERE org_id = $1`, orgID,
	).Scan(&cfg.OrgID, &cfg.BaseTheme, &colorsRaw, &cfg.Locked, &cfg.UpdatedAt, &cfg.UpdatedBy)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Return defaults — no row means org hasn't configured a theme yet
			return &domain.OrgThemeConfig{
				OrgID:        orgID,
				BaseTheme:    "orbis-light",
				CustomColors: json.RawMessage(`{}`),
				Locked:       false,
			}, nil
		}
		return nil, err
	}
	if len(colorsRaw) == 0 {
		colorsRaw = []byte(`{}`)
	}
	cfg.CustomColors = json.RawMessage(colorsRaw)
	return &cfg, nil
}

func (r *orgThemeRepo) Upsert(ctx context.Context, cfg *domain.OrgThemeConfig) (*domain.OrgThemeConfig, error) {
	colors := cfg.CustomColors
	if len(colors) == 0 {
		colors = json.RawMessage(`{}`)
	}
	var out domain.OrgThemeConfig
	var colorsRaw []byte
	err := r.pool.QueryRow(ctx,
		`INSERT INTO org_theme_configs (org_id, base_theme, custom_colors, locked, updated_at, updated_by)
		 VALUES ($1, $2, $3, $4, now(), $5)
		 ON CONFLICT (org_id) DO UPDATE
		   SET base_theme    = EXCLUDED.base_theme,
		       custom_colors = EXCLUDED.custom_colors,
		       locked        = EXCLUDED.locked,
		       updated_at    = now(),
		       updated_by    = EXCLUDED.updated_by
		 RETURNING org_id, base_theme, custom_colors, locked, updated_at, updated_by`,
		cfg.OrgID, cfg.BaseTheme, []byte(colors), cfg.Locked, cfg.UpdatedBy,
	).Scan(&out.OrgID, &out.BaseTheme, &colorsRaw, &out.Locked, &out.UpdatedAt, &out.UpdatedBy)
	if err != nil {
		return nil, err
	}
	if len(colorsRaw) == 0 {
		colorsRaw = []byte(`{}`)
	}
	out.CustomColors = json.RawMessage(colorsRaw)
	return &out, nil
}
