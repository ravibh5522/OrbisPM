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

// withEntityNames fills EntityName for the entity types that have a human
// name, one query per type. Best effort: it's a display field, so a failed
// lookup leaves it empty rather than failing the list.
func (r *activityRepo) withEntityNames(ctx context.Context, logs []*domain.ActivityLog) {
	byType := map[string][]uuid.UUID{}
	for _, l := range logs {
		byType[l.EntityType] = append(byType[l.EntityType], l.EntityID)
	}
	queries := map[string]string{
		"task":           `SELECT id, title FROM tasks WHERE id = ANY($1)`,
		"project":        `SELECT id, name FROM projects WHERE id = ANY($1)`,
		"team":           `SELECT id, name FROM teams WHERE id = ANY($1)`,
		"change_request": `SELECT cr.id, t.title FROM task_change_requests cr JOIN tasks t ON t.id = cr.task_id WHERE cr.id = ANY($1)`,
	}
	names := map[uuid.UUID]string{} // entity IDs are UUIDs, so one map serves every type
	for typ, query := range queries {
		ids := byType[typ]
		if len(ids) == 0 {
			continue
		}
		rows, err := r.pool.Query(ctx, query, ids)
		if err != nil {
			continue
		}
		for rows.Next() {
			var id uuid.UUID
			var name string
			if rows.Scan(&id, &name) == nil {
				names[id] = name
			}
		}
		rows.Close()
	}
	for _, l := range logs {
		l.EntityName = names[l.EntityID]
	}
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	r.withEntityNames(ctx, logs)
	return logs, nil
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
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	r.withEntityNames(ctx, logs)
	return logs, total, nil
}
