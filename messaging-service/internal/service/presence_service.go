package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// PresenceService tracks user online/offline/away status in Redis.
type PresenceService struct {
	rdb *redis.Client
	ttl time.Duration
}

// NewPresenceService creates a new PresenceService.
func NewPresenceService(rdb *redis.Client, ttl time.Duration) *PresenceService {
	return &PresenceService{rdb: rdb, ttl: ttl}
}

func presenceKey(orgID, userID uuid.UUID) string {
	return fmt.Sprintf("presence:%s:%s", orgID, userID)
}

func presenceSetKey(orgID uuid.UUID) string {
	return fmt.Sprintf("presence:%s", orgID)
}

func lastSeenKey(orgID, userID uuid.UUID) string {
	return fmt.Sprintf("lastseen:%s:%s", orgID, userID)
}

func lastSeenSetKey(orgID uuid.UUID) string {
	return fmt.Sprintf("lastseen:%s", orgID)
}

// SetOnline marks a user as online in an org and updates last_seen.
func (p *PresenceService) SetOnline(ctx context.Context, orgID, userID uuid.UUID) error {
	now := time.Now().UTC().Format(time.RFC3339)
	pipe := p.rdb.Pipeline()
	pipe.SAdd(ctx, presenceSetKey(orgID), userID.String())
	pipe.Set(ctx, presenceKey(orgID, userID), "online", p.ttl)
	// Track last_seen — persists beyond TTL so we can show "last seen X ago"
	pipe.SAdd(ctx, lastSeenSetKey(orgID), userID.String())
	pipe.Set(ctx, lastSeenKey(orgID, userID), now, 0) // no expiry
	_, err := pipe.Exec(ctx)
	return err
}

// Heartbeat refreshes the TTL for an online user and updates last_seen.
func (p *PresenceService) Heartbeat(ctx context.Context, orgID, userID uuid.UUID) error {
	now := time.Now().UTC().Format(time.RFC3339)
	pipe := p.rdb.Pipeline()
	pipe.Expire(ctx, presenceKey(orgID, userID), p.ttl)
	pipe.Set(ctx, lastSeenKey(orgID, userID), now, 0)
	_, err := pipe.Exec(ctx)
	return err
}

// SetOffline marks a user as offline and records final last_seen timestamp.
func (p *PresenceService) SetOffline(ctx context.Context, orgID, userID uuid.UUID) error {
	now := time.Now().UTC().Format(time.RFC3339)
	pipe := p.rdb.Pipeline()
	pipe.SRem(ctx, presenceSetKey(orgID), userID.String())
	pipe.Del(ctx, presenceKey(orgID, userID))
	// Update last_seen to the disconnect time
	pipe.SAdd(ctx, lastSeenSetKey(orgID), userID.String())
	pipe.Set(ctx, lastSeenKey(orgID, userID), now, 0)
	_, err := pipe.Exec(ctx)
	return err
}

// PresenceInfo holds a user's online status and last seen timestamp.
type PresenceInfo struct {
	UserID   uuid.UUID `json:"user_id"`
	Online   bool      `json:"online"`
	LastSeen string    `json:"last_seen,omitempty"` // RFC3339
}

// GetOnlineUsers returns all online user IDs in an org.
func (p *PresenceService) GetOnlineUsers(ctx context.Context, orgID uuid.UUID) ([]uuid.UUID, error) {
	members, err := p.rdb.SMembers(ctx, presenceSetKey(orgID)).Result()
	if err != nil {
		return nil, err
	}

	// Verify each member still has a valid presence key (TTL check)
	var online []uuid.UUID
	for _, m := range members {
		uid, err := uuid.Parse(m)
		if err != nil {
			continue
		}
		exists, err := p.rdb.Exists(ctx, presenceKey(orgID, uid)).Result()
		if err != nil {
			continue
		}
		if exists > 0 {
			online = append(online, uid)
		} else {
			// Stale entry — clean up
			p.rdb.SRem(ctx, presenceSetKey(orgID), m)
		}
	}
	return online, nil
}

// GetPresenceDetails returns online status + last_seen for all tracked users in an org.
func (p *PresenceService) GetPresenceDetails(ctx context.Context, orgID uuid.UUID) ([]PresenceInfo, error) {
	// Get online users
	onlineSet := make(map[uuid.UUID]bool)
	onlineUsers, err := p.GetOnlineUsers(ctx, orgID)
	if err != nil {
		return nil, err
	}
	for _, uid := range onlineUsers {
		onlineSet[uid] = true
	}

	// Get all users with last_seen data
	members, err := p.rdb.SMembers(ctx, lastSeenSetKey(orgID)).Result()
	if err != nil {
		return nil, err
	}

	var result []PresenceInfo
	for _, m := range members {
		uid, err := uuid.Parse(m)
		if err != nil {
			continue
		}
		info := PresenceInfo{
			UserID: uid,
			Online: onlineSet[uid],
		}
		// Fetch last_seen timestamp
		lastSeen, err := p.rdb.Get(ctx, lastSeenKey(orgID, uid)).Result()
		if err == nil {
			info.LastSeen = lastSeen
		}
		result = append(result, info)
	}
	return result, nil
}

// IsOnline checks if a specific user is online.
func (p *PresenceService) IsOnline(ctx context.Context, orgID, userID uuid.UUID) (bool, error) {
	exists, err := p.rdb.Exists(ctx, presenceKey(orgID, userID)).Result()
	if err != nil {
		return false, err
	}
	return exists > 0, nil
}
