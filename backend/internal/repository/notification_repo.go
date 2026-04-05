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

type notificationRepo struct {
	pool *pgxpool.Pool
}

func NewNotificationRepo(pool *pgxpool.Pool) NotificationRepository {
	return &notificationRepo{pool: pool}
}

func (r *notificationRepo) Create(ctx context.Context, tx pgx.Tx, n *domain.Notification) (*domain.Notification, error) {
	q := conn(r.pool, tx)
	row := q.QueryRow(ctx,
		`INSERT INTO notifications (user_id, org_id, type, title, body, payload)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, user_id, org_id, type, title, body, payload, read_at, created_at`,
		n.UserID, n.OrgID, n.Type, n.Title, nilStr(n.Body), n.Payload)

	var notif domain.Notification
	var body *string
	err := row.Scan(&notif.ID, &notif.UserID, &notif.OrgID, &notif.Type, &notif.Title, &body, &notif.Payload, &notif.ReadAt, &notif.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create notification: %w", err)
	}
	if body != nil {
		notif.Body = *body
	}
	return &notif, nil
}

func (r *notificationRepo) ListByUser(ctx context.Context, userID uuid.UUID, filter NotificationFilter) ([]*domain.Notification, int, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	args := []any{userID}
	where := ""

	switch filter.Status {
	case "read":
		where += " AND read_at IS NOT NULL"
	case "unread":
		where += " AND read_at IS NULL"
	}

	var total int
	countSQL := `SELECT COUNT(*) FROM notifications WHERE user_id = $1` + where
	if err := r.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	orderBy := "read_at NULLS FIRST, created_at DESC"
	if filter.SortBy == "created_at" {
		dir := "DESC"
		if strings.EqualFold(filter.SortOrder, "asc") {
			dir = "ASC"
		}
		orderBy = "created_at " + dir
	}

	args = append(args, limit, offset)
	querySQL := fmt.Sprintf(
		`SELECT id, user_id, org_id, type, title, body, payload, read_at, created_at
		 FROM notifications WHERE user_id = $1%s
		 ORDER BY %s
		 LIMIT $%d OFFSET $%d`,
		where, orderBy, len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, querySQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var notifs []*domain.Notification
	for rows.Next() {
		var n domain.Notification
		var body *string
		if err := rows.Scan(&n.ID, &n.UserID, &n.OrgID, &n.Type, &n.Title, &body, &n.Payload, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, 0, err
		}
		if body != nil {
			n.Body = *body
		}
		notifs = append(notifs, &n)
	}
	return notifs, total, rows.Err()
}

func (r *notificationRepo) MarkRead(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `UPDATE notifications SET read_at = now() WHERE id = $1`, id)
	return err
}

func (r *notificationRepo) MarkAllRead(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, userID)
	return err
}

func (r *notificationRepo) CountUnread(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`, userID).Scan(&count)
	return count, err
}
