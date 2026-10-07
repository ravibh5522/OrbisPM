package auth

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

// ResolveUserID maps a Zitadel identity to OrbisPM's stable internal user ID.
//
// This used to be computed live on every request via
// uuid.NewSHA1(uuid.NameSpaceURL, zitadelID) and never stored. That formula
// is duplicated independently in messaging-service's own auth code too — if
// the two implementations ever drifted even slightly, services would
// disagree on a user's ID with no error, just silently wrong data. Storing
// the mapping once here and having every service look it up removes that
// whole class of bug, not just a one-time migration concern.
//
// Resolution: look up by zitadel_user_id; if not found, derive an ID (same
// formula as before, so any given Zitadel ID always maps to the same UUID)
// and store the mapping so every later login takes the fast lookup path.
func ResolveUserID(ctx context.Context, pool *pgxpool.Pool, zitadelID, email string) (uuid.UUID, error) {
	if pool == nil {
		return legacyDeriveUUID(zitadelID), nil
	}

	if id, ok := userIDCache.get(zitadelID); ok {
		return id, nil
	}

	id, err := resolveUserID(ctx, pool, zitadelID, email)
	if err != nil {
		return uuid.Nil, err
	}

	userIDCache.set(zitadelID, id)
	return id, nil
}

func resolveUserID(ctx context.Context, pool *pgxpool.Pool, zitadelID, email string) (uuid.UUID, error) {
	var id uuid.UUID

	err := pool.QueryRow(ctx,
		`SELECT id FROM users WHERE zitadel_user_id = $1`, zitadelID,
	).Scan(&id)
	if err == nil {
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
	return id, nil
}

func legacyDeriveUUID(zitadelID string) uuid.UUID {
	if u, err := uuid.Parse(zitadelID); err == nil {
		return u
	}
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(zitadelID))
}

// userIDCache avoids a DB round trip on every single authenticated request —
// same pattern already used for session tokens elsewhere in this package.
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
