package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
)

type categoryRepo struct {
	pool *pgxpool.Pool
}

// NewCategoryRepository creates a new CategoryRepository.
func NewCategoryRepository(pool *pgxpool.Pool) CategoryRepository {
	return &categoryRepo{pool: pool}
}

func (r *categoryRepo) Create(ctx context.Context, tx pgx.Tx, cat *domain.ChannelCategory) error {
	db := conn(r.pool, tx)
	err := db.QueryRow(ctx, `
		INSERT INTO channel_categories (org_id, name, position, auto_source, auto_source_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at`,
		cat.OrgID, cat.Name, cat.Position, nullIfEmpty(cat.AutoSource), cat.AutoSourceID,
	).Scan(&cat.ID, &cat.CreatedAt, &cat.UpdatedAt)
	if err != nil {
		if isPgUniqueViolation(err) {
			return domain.ErrConflict.WithDetail("category already exists")
		}
		return fmt.Errorf("insert category: %w", err)
	}
	return nil
}

func (r *categoryRepo) GetByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*domain.ChannelCategory, error) {
	db := conn(r.pool, tx)
	cat := &domain.ChannelCategory{}
	err := db.QueryRow(ctx, `
		SELECT id, org_id, name, position, COALESCE(auto_source, ''), auto_source_id, created_at, updated_at
		FROM channel_categories WHERE id = $1`, id,
	).Scan(&cat.ID, &cat.OrgID, &cat.Name, &cat.Position, &cat.AutoSource, &cat.AutoSourceID, &cat.CreatedAt, &cat.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get category: %w", err)
	}
	return cat, nil
}

func (r *categoryRepo) ListByOrg(ctx context.Context, tx pgx.Tx) ([]domain.ChannelCategory, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT id, org_id, name, position, COALESCE(auto_source, ''), auto_source_id, created_at, updated_at
		FROM channel_categories ORDER BY position, name`)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()

	var categories []domain.ChannelCategory
	for rows.Next() {
		var cat domain.ChannelCategory
		if err := rows.Scan(&cat.ID, &cat.OrgID, &cat.Name, &cat.Position, &cat.AutoSource, &cat.AutoSourceID, &cat.CreatedAt, &cat.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		categories = append(categories, cat)
	}
	return categories, nil
}

func (r *categoryRepo) Update(ctx context.Context, tx pgx.Tx, cat *domain.ChannelCategory) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `
		UPDATE channel_categories SET name = $1, position = $2, updated_at = now()
		WHERE id = $3`,
		cat.Name, cat.Position, cat.ID,
	)
	if err != nil {
		return fmt.Errorf("update category: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *categoryRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	db := conn(r.pool, tx)
	// Unset category_id on channels first
	if _, err := db.Exec(ctx, `UPDATE channels SET category_id = NULL WHERE category_id = $1`, id); err != nil {
		return fmt.Errorf("unset channel categories: %w", err)
	}
	tag, err := db.Exec(ctx, `DELETE FROM channel_categories WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete category: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *categoryRepo) SetChannelCategory(ctx context.Context, tx pgx.Tx, channelID uuid.UUID, categoryID *uuid.UUID, position int) error {
	db := conn(r.pool, tx)
	tag, err := db.Exec(ctx, `
		UPDATE channels SET category_id = $1, position = $2, updated_at = now()
		WHERE id = $3`,
		categoryID, position, channelID,
	)
	if err != nil {
		return fmt.Errorf("set channel category: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *categoryRepo) GetUserCategoryStates(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (map[uuid.UUID]bool, error) {
	db := conn(r.pool, tx)
	rows, err := db.Query(ctx, `
		SELECT category_id, is_collapsed FROM user_category_states WHERE user_id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("get user category states: %w", err)
	}
	defer rows.Close()

	states := make(map[uuid.UUID]bool)
	for rows.Next() {
		var catID uuid.UUID
		var collapsed bool
		if err := rows.Scan(&catID, &collapsed); err != nil {
			return nil, fmt.Errorf("scan category state: %w", err)
		}
		states[catID] = collapsed
	}
	return states, nil
}

func (r *categoryRepo) SetUserCategoryCollapsed(ctx context.Context, tx pgx.Tx, userID, categoryID uuid.UUID, collapsed bool) error {
	db := conn(r.pool, tx)
	_, err := db.Exec(ctx, `
		INSERT INTO user_category_states (user_id, category_id, is_collapsed)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, category_id) DO UPDATE SET is_collapsed = $3`,
		userID, categoryID, collapsed,
	)
	if err != nil {
		return fmt.Errorf("set category collapsed: %w", err)
	}
	return nil
}
