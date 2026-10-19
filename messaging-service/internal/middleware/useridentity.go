package middleware

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// resolveUserID maps a Zitadel identity to Simplify Projects's stable internal user ID.
// Mirrors backend/internal/auth.ResolveUserID exactly — this service can't
// import that package (separate Go module), but the two must agree on the
// same ID for the same Zitadel user, so keep this in lockstep with the
// backend's version rather than letting the two drift again. See
// research/orbispm-integration-plan.md in the Research_g repo.
func resolveUserID(ctx context.Context, pool *pgxpool.Pool, zitadelID, email string) (uuid.UUID, error) {
	if pool == nil {
		return legacyDeriveUUID(zitadelID), nil
	}

	if id, ok := userIDCache.get(zitadelID); ok {
		return id, nil
	}

	var id uuid.UUID
	err := pool.QueryRow(ctx,
		`SELECT id FROM users WHERE zitadel_user_id = $1`, zitadelID,
	).Scan(&id)
	if err == nil {
		userIDCache.set(zitadelID, id)
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, fmt.Errorf("resolve user id: lookup by zitadel_user_id: %w", err)
	}

	id = legacyDeriveUUID(zitadelID)
	_, err = pool.Exec(ctx,
		`INSERT INTO users (id, email, zitadel_user_id, updated_at) VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (id) DO UPDATE SET zitadel_user_id = EXCLUDED.zitadel_user_id`,
		id, email, zitadelID,
	)
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve user id: provision: %w", err)
	}
	userIDCache.set(zitadelID, id)
	return id, nil
}

func legacyDeriveUUID(zitadelID string) uuid.UUID {
	if u, err := uuid.Parse(zitadelID); err == nil {
		return u
	}
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(zitadelID))
}

var userIDCache = newResolveCache(5 * time.Minute)

type resolveCache struct {
	ttl   time.Duration
	mu    sync.Mutex
	items map[string]cachedID
}

type cachedID struct {
	id        uuid.UUID
	expiresAt time.Time
}

func newResolveCache(ttl time.Duration) *resolveCache {
	return &resolveCache{ttl: ttl, items: make(map[string]cachedID)}
}

func (c *resolveCache) get(zitadelID string) (uuid.UUID, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.items[zitadelID]
	if !ok || time.Now().After(entry.expiresAt) {
		return uuid.Nil, false
	}
	return entry.id, true
}

func (c *resolveCache) set(zitadelID string, id uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[zitadelID] = cachedID{id: id, expiresAt: time.Now().Add(c.ttl)}
}
