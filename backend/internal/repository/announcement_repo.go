package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type announcementRepo struct {
	pool *pgxpool.Pool
}

// NewAnnouncementRepo creates a new AnnouncementRepository backed by pgxpool.
func NewAnnouncementRepo(pool *pgxpool.Pool) AnnouncementRepository {
	return &announcementRepo{pool: pool}
}

func (r *announcementRepo) Create(ctx context.Context, tx pgx.Tx, a *domain.Announcement) (*domain.Announcement, error) {
	q := conn(r.pool, tx)
	var created domain.Announcement
	err := q.QueryRow(ctx,
		`INSERT INTO announcements
		    (org_id, project_id, author_id, title, body, priority, pinned, published_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, org_id, project_id, author_id, title, body, priority, pinned,
		           published_at, expires_at, created_at, updated_at`,
		a.OrgID, a.ProjectID, a.AuthorID, a.Title, a.Body, a.Priority, a.Pinned,
		a.PublishedAt, a.ExpiresAt,
	).Scan(
		&created.ID, &created.OrgID, &created.ProjectID, &created.AuthorID,
		&created.Title, &created.Body, &created.Priority, &created.Pinned,
		&created.PublishedAt, &created.ExpiresAt, &created.CreatedAt, &created.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create announcement: %w", err)
	}
	return &created, nil
}

func (r *announcementRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Announcement, error) {
	var a domain.Announcement
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, project_id, author_id, title, body, priority, pinned,
		        published_at, expires_at, created_at, updated_at
		 FROM announcements WHERE id = $1`, id,
	).Scan(
		&a.ID, &a.OrgID, &a.ProjectID, &a.AuthorID,
		&a.Title, &a.Body, &a.Priority, &a.Pinned,
		&a.PublishedAt, &a.ExpiresAt, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get announcement: %w", err)
	}
	return &a, nil
}

func (r *announcementRepo) Update(ctx context.Context, tx pgx.Tx, a *domain.Announcement) (*domain.Announcement, error) {
	q := conn(r.pool, tx)
	var updated domain.Announcement
	err := q.QueryRow(ctx,
		`UPDATE announcements
		 SET title=$1, body=$2, priority=$3, pinned=$4, published_at=$5, expires_at=$6,
		     updated_at=now()
		 WHERE id=$7
		 RETURNING id, org_id, project_id, author_id, title, body, priority, pinned,
		           published_at, expires_at, created_at, updated_at`,
		a.Title, a.Body, a.Priority, a.Pinned, a.PublishedAt, a.ExpiresAt, a.ID,
	).Scan(
		&updated.ID, &updated.OrgID, &updated.ProjectID, &updated.AuthorID,
		&updated.Title, &updated.Body, &updated.Priority, &updated.Pinned,
		&updated.PublishedAt, &updated.ExpiresAt, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("update announcement: %w", err)
	}
	return &updated, nil
}

func (r *announcementRepo) Delete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx, `DELETE FROM announcements WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete announcement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// List returns announcements for an org (and optionally a project), annotated
// with per-user unread status and total read count.
// Results are ordered pinned DESC, created_at DESC.
func (r *announcementRepo) List(
	ctx context.Context,
	orgID uuid.UUID,
	projectID *uuid.UUID,
	userID uuid.UUID,
	limit, offset int,
) ([]*domain.Announcement, int, error) {
	// Build WHERE clause depending on whether a project filter was provided.
	var (
		rows pgx.Rows
		err  error
		total int
	)

	if projectID != nil {
		err = r.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM announcements
			 WHERE org_id = $1 AND project_id = $2`,
			orgID, *projectID,
		).Scan(&total)
	} else {
		err = r.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM announcements
			 WHERE org_id = $1`,
			orgID,
		).Scan(&total)
	}
	if err != nil {
		return nil, 0, fmt.Errorf("count announcements: %w", err)
	}

	const selectCols = `
		a.id, a.org_id, a.project_id, a.author_id, a.title, a.body, a.priority, a.pinned,
		a.published_at, a.expires_at, a.created_at, a.updated_at,
		COUNT(ar.announcement_id)                         AS read_count,
		(MAX(CASE WHEN ar.user_id = $2 THEN 1 ELSE 0 END) = 0) AS unread`

	if projectID != nil {
		rows, err = r.pool.Query(ctx,
			`SELECT `+selectCols+`
			 FROM announcements a
			 LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id
			 WHERE a.org_id = $1 AND a.project_id = $3
			 GROUP BY a.id
			 ORDER BY a.pinned DESC, a.created_at DESC
			 LIMIT $4 OFFSET $5`,
			orgID, userID, *projectID, limit, offset,
		)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT `+selectCols+`
			 FROM announcements a
			 LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id
			 WHERE a.org_id = $1
			 GROUP BY a.id
			 ORDER BY a.pinned DESC, a.created_at DESC
			 LIMIT $3 OFFSET $4`,
			orgID, userID, limit, offset,
		)
	}
	if err != nil {
		return nil, 0, fmt.Errorf("list announcements: %w", err)
	}
	defer rows.Close()

	var results []*domain.Announcement
	for rows.Next() {
		var a domain.Announcement
		if err := rows.Scan(
			&a.ID, &a.OrgID, &a.ProjectID, &a.AuthorID,
			&a.Title, &a.Body, &a.Priority, &a.Pinned,
			&a.PublishedAt, &a.ExpiresAt, &a.CreatedAt, &a.UpdatedAt,
			&a.ReadCount, &a.Unread,
		); err != nil {
			return nil, 0, fmt.Errorf("scan announcement: %w", err)
		}
		results = append(results, &a)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return results, total, nil
}

// MarkRead records that a user has read an announcement (upsert — idempotent).
func (r *announcementRepo) MarkRead(ctx context.Context, announcementID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO announcement_reads (announcement_id, user_id)
		 VALUES ($1, $2)
		 ON CONFLICT (announcement_id, user_id) DO NOTHING`,
		announcementID, userID,
	)
	if err != nil {
		return fmt.Errorf("mark announcement read: %w", err)
	}
	return nil
}

// CountUnread counts announcements in an org that the given user has not read yet.
func (r *announcementRepo) CountUnread(ctx context.Context, orgID, userID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM announcements a
		 WHERE a.org_id = $1
		   AND NOT EXISTS (
		       SELECT 1 FROM announcement_reads ar
		       WHERE ar.announcement_id = a.id AND ar.user_id = $2
		   )`,
		orgID, userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count unread announcements: %w", err)
	}
	return count, nil
}
