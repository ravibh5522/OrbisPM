package notifier

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/orbispm/monitoring-alerting/internal/evaluator"
)

// Deduplicator prevents alert spam by tracking sent alerts
type Deduplicator struct {
	redis    *redis.Client
	cooldown time.Duration
}

// NewDeduplicator creates a new deduplicator
func NewDeduplicator(rdb *redis.Client, cooldown time.Duration) *Deduplicator {
	return &Deduplicator{
		redis:    rdb,
		cooldown: cooldown,
	}
}

// ShouldNotify checks if an alert should be sent
func (d *Deduplicator) ShouldNotify(ctx context.Context, alert evaluator.Alert) bool {
	key := fmt.Sprintf("alert:dedup:%s", alert.Fingerprint)

	// Check if alert was recently sent
	exists, err := d.redis.Exists(ctx, key).Result()
	if err != nil {
		// On error, allow the notification to avoid missing alerts
		log.Error().Err(err).Str("fingerprint", alert.Fingerprint).Msg("Redis error during dedup check")
		return true
	}

	if exists > 0 {
		log.Debug().Str("alert", alert.Name).Str("fingerprint", alert.Fingerprint).Msg("Alert suppressed (cooldown)")
		return false
	}

	// Mark alert as sent with TTL
	if err := d.redis.Set(ctx, key, time.Now().Unix(), d.cooldown).Err(); err != nil {
		log.Error().Err(err).Str("fingerprint", alert.Fingerprint).Msg("Failed to set dedup key")
	}

	return true
}