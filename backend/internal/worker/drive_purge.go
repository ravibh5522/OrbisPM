package worker

import (
	"context"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/rs/zerolog/log"
)

const drivePurgeBatch = 500

// HandleDrivePurge hard-deletes Drive items trashed more than 30 days ago (the
// delete trigger queues their objects and decrements usage), then removes the
// queued objects from storage. Runs across all orgs: it is system maintenance.
func (h *Handlers) HandleDrivePurge(ctx context.Context, _ *asynq.Task) error {
	purged := int64(0)
	for {
		tag, err := h.Pool.Exec(ctx,
			`DELETE FROM drive_items WHERE id IN (
			     SELECT id FROM drive_items
			     WHERE trashed_at < now() - interval '30 days'
			     LIMIT $1)`, drivePurgeBatch)
		if err != nil {
			return fmt.Errorf("purge trashed drive items: %w", err)
		}
		purged += tag.RowsAffected()
		if tag.RowsAffected() < drivePurgeBatch {
			break
		}
	}

	removed := 0
	for {
		keys, err := h.drivePurgeKeys(ctx)
		if err != nil {
			return err
		}
		var done []string
		for _, key := range keys {
			if err := h.DriveStorage.Delete(ctx, key); err != nil {
				log.Warn().Err(err).Str("key", key).Msg("drive purge: delete object failed; will retry next run")
				continue
			}
			done = append(done, key)
		}
		if len(done) > 0 {
			if _, err := h.Pool.Exec(ctx, `DELETE FROM drive_purge_queue WHERE storage_key = ANY($1)`, done); err != nil {
				return fmt.Errorf("dequeue purged drive objects: %w", err)
			}
		}
		removed += len(done)
		// Stop on any failure so a storage outage cannot spin this loop.
		if len(keys) < drivePurgeBatch || len(done) < len(keys) {
			break
		}
	}

	log.Info().Int64("items", purged).Int("objects", removed).Msg("drive purge finished")
	return nil
}

func (h *Handlers) drivePurgeKeys(ctx context.Context) ([]string, error) {
	rows, err := h.Pool.Query(ctx,
		`SELECT storage_key FROM drive_purge_queue ORDER BY queued_at LIMIT $1`, drivePurgeBatch)
	if err != nil {
		return nil, fmt.Errorf("list drive purge queue: %w", err)
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}
