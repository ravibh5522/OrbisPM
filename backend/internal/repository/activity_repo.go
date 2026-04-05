package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type activityRepo struct {
	pool *pgxpool.Pool
}

func NewActivityRepo(pool *pgxpool.Pool) ActivityRepository {
	return &activityRepo{pool: pool}
}

func (r *activityRepo) Create(ctx context.Context, tx pgx.Tx, log *domain.ActivityLog) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO activity_log (org_id, entity_type, entity_id, action, actor_id, changes, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		log.OrgID, log.EntityType, log.EntityID, log.Action, log.ActorID, log.Changes, log.Metadata)
	if err != nil {
		return fmt.Errorf("create activity: %w", err)
	}
	return nil
}

func (r *activityRepo) ListByEntity(ctx context.Context, entityType string, entityID uuid.UUID, filter ListFilter) ([]*domain.ActivityLog, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, entity_type, entity_id, action, actor_id, changes, metadata, created_at
		 FROM activity_log WHERE entity_type = $1 AND entity_id = $2
		 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
		entityType, entityID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*domain.ActivityLog
	for rows.Next() {
		var a domain.ActivityLog
		if err := rows.Scan(&a.ID, &a.OrgID, &a.EntityType, &a.EntityID, &a.Action, &a.ActorID, &a.Changes, &a.Metadata, &a.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, &a)
	}
	return logs, rows.Err()
}

func (r *activityRepo) ListByOrg(ctx context.Context, orgID uuid.UUID, filter ActivityFilter) ([]*domain.ActivityLog, int, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	args := []any{orgID}
	where := ""

	if filter.Search != nil && *filter.Search != "" {
		args = append(args, "%"+strings.ToLower(*filter.Search)+"%")
		where += fmt.Sprintf(" AND (LOWER(action) LIKE $%d OR LOWER(entity_type) LIKE $%d)", len(args), len(args))
	}
	if filter.Action != nil && *filter.Action != "" {
		args = append(args, *filter.Action)
		where += fmt.Sprintf(" AND action = $%d", len(args))
	}
	if filter.EntityType != nil && *filter.EntityType != "" {
		args = append(args, *filter.EntityType)
		where += fmt.Sprintf(" AND entity_type = $%d", len(args))
	}

	var total int
	countSQL := `SELECT COUNT(*) FROM activity_log WHERE org_id = $1` + where
	if err := r.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count activity: %w", err)
	}

	sortDir := "DESC"
	if strings.EqualFold(filter.SortOrder, "asc") {
		sortDir = "ASC"
	}

	args = append(args, limit, offset)
	querySQL := fmt.Sprintf(
		`SELECT id, org_id, entity_type, entity_id, action, actor_id, changes, metadata, created_at
		 FROM activity_log WHERE org_id = $1%s
		 ORDER BY created_at %s
		 LIMIT $%d OFFSET $%d`,
		where, sortDir, len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, querySQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []*domain.ActivityLog
	for rows.Next() {
		var a domain.ActivityLog
		if err := rows.Scan(&a.ID, &a.OrgID, &a.EntityType, &a.EntityID, &a.Action, &a.ActorID, &a.Changes, &a.Metadata, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		logs = append(logs, &a)
	}
	return logs, total, rows.Err()
}
