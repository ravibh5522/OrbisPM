package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type notifPrefRepo struct {
	pool *pgxpool.Pool
}

func NewNotificationPrefRepo(pool *pgxpool.Pool) NotificationPrefRepository {
	return &notifPrefRepo{pool: pool}
}

func (r *notifPrefRepo) Upsert(ctx context.Context, tx pgx.Tx, pref *domain.NotificationPreference) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO notification_preferences (user_id, org_id, event_type, channel, enabled)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, org_id, event_type, channel)
		 DO UPDATE SET enabled = EXCLUDED.enabled`,
		pref.UserID, pref.OrgID, pref.EventType, pref.Channel, pref.Enabled)
	if err != nil {
		return fmt.Errorf("upsert notification preference: %w", err)
	}
	return nil
}

func (r *notifPrefRepo) ListByUser(ctx context.Context, userID, orgID uuid.UUID) ([]*domain.NotificationPreference, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, org_id, event_type, channel, enabled
		 FROM notification_preferences WHERE user_id = $1 AND org_id = $2
		 ORDER BY event_type, channel`, userID, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prefs []*domain.NotificationPreference
	for rows.Next() {
		var p domain.NotificationPreference
		if err := rows.Scan(&p.ID, &p.UserID, &p.OrgID, &p.EventType, &p.Channel, &p.Enabled); err != nil {
			return nil, err
		}
		prefs = append(prefs, &p)
	}
	return prefs, rows.Err()
}

func (r *notifPrefRepo) IsEnabled(ctx context.Context, userID, orgID uuid.UUID, eventType, channel string) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(
			(SELECT enabled FROM notification_preferences
			 WHERE user_id = $1 AND org_id = $2 AND event_type = $3 AND channel = $4),
			true
		)`, userID, orgID, eventType, channel).Scan(&enabled)
	return enabled, err
}
