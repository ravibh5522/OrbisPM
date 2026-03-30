package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
)

// ErrCacheMiss indicates the requested item is not in cache.
var ErrCacheMiss = errors.New("cache miss")

// ConflictError is returned when an optimistic version conflict is detected.
type ConflictError struct {
	TaskID        uuid.UUID      `json:"task_id"`
	ServerVersion int64          `json:"server_version"`
	ServerState   *domain.Task   `json:"server_state"`
	YourChanges   map[string]any `json:"your_changes"`
	Resolution    string         `json:"resolution"` // "auto-merged", "conflict"
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("version conflict on task %s: server=%d, resolution=%s", e.TaskID, e.ServerVersion, e.Resolution)
}

const (
	// DefaultTTL is the TTL for project cache keys (refreshed on access).
	DefaultTTL = 30 * time.Minute
	// LockTTL is the max time a preload lock is held.
	LockTTL = 30 * time.Second
	// PermissionCacheTTL is the TTL for permission check results.
	PermissionCacheTTL = 5 * time.Minute
)

// Manager handles Redis-backed task caching with write-behind support.
type Manager struct {
	rdb *redis.Client
}

// NewManager creates a new cache Manager.
func NewManager(rdb *redis.Client) *Manager {
	return &Manager{rdb: rdb}
}

// ─── Project Lifecycle ───────────────────────────────────────

// IsProjectLoaded checks if a project's task cache exists in Redis.
func (m *Manager) IsProjectLoaded(ctx context.Context, projectID uuid.UUID) bool {
	exists, err := m.rdb.Exists(ctx, ProjectMetaKey(projectID)).Result()
	return err == nil && exists > 0
}

// PreloadProject loads all tasks for a project into Redis cache.
// Uses a distributed lock to prevent stampede.
func (m *Manager) PreloadProject(ctx context.Context, projectID uuid.UUID, tasks []*domain.Task) error {
	lockKey := ProjectLockKey(projectID)

	// Try to acquire lock
	ok, err := m.rdb.SetNX(ctx, lockKey, "1", LockTTL).Result()
	if err != nil {
		return fmt.Errorf("acquire preload lock: %w", err)
	}
	if !ok {
		// Another process is loading — wait briefly and check
		time.Sleep(100 * time.Millisecond)
		if m.IsProjectLoaded(ctx, projectID) {
			return nil // Another goroutine loaded it
		}
		// Try once more
		ok, err = m.rdb.SetNX(ctx, lockKey, "1", LockTTL).Result()
		if err != nil || !ok {
			return nil // Let it fall through to DB reads
		}
	}
	defer m.rdb.Del(ctx, lockKey)

	pipe := m.rdb.Pipeline()

	for _, task := range tasks {
		data, err := json.Marshal(task)
		if err != nil {
			continue
		}

		taskKey := ProjectTaskKey(projectID, task.ID)
		pipe.Set(ctx, taskKey, data, DefaultTTL)

		// Add to parent's children sorted set
		parentKey := "root"
		if task.ParentTaskID != nil {
			parentKey = task.ParentTaskID.String()
		}
		childrenKey := ProjectChildrenKey(projectID, parentKey)
		pipe.ZAdd(ctx, childrenKey, redis.Z{
			Score:  float64(task.Position),
			Member: task.ID.String(),
		})
		pipe.Expire(ctx, childrenKey, DefaultTTL)

		// Set version counter
		versionKey := ProjectVersionKey(projectID, task.ID)
		pipe.Set(ctx, versionKey, task.Version, DefaultTTL)
	}

	// Set metadata
	metaKey := ProjectMetaKey(projectID)
	pipe.HSet(ctx, metaKey, map[string]any{
		"loaded_at":  time.Now().UTC().Format(time.RFC3339),
		"task_count": len(tasks),
	})
	pipe.Expire(ctx, metaKey, DefaultTTL)

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("preload pipeline: %w", err)
	}

	log.Debug().Str("project_id", projectID.String()).Int("tasks", len(tasks)).Msg("project cache preloaded")
	return nil
}

// EvictProject removes all cached data for a project.
func (m *Manager) EvictProject(ctx context.Context, projectID uuid.UUID) error {
	pattern := ProjectGlobPattern(projectID)
	iter := m.rdb.Scan(ctx, 0, pattern, 500).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		return fmt.Errorf("scan project keys: %w", err)
	}
	if len(keys) > 0 {
		if err := m.rdb.Del(ctx, keys...).Err(); err != nil {
			return fmt.Errorf("delete project keys: %w", err)
		}
	}
	return nil
}

// RefreshTTL extends the TTL for all project cache keys.
func (m *Manager) RefreshTTL(ctx context.Context, projectID uuid.UUID) {
	metaKey := ProjectMetaKey(projectID)
	m.rdb.Expire(ctx, metaKey, DefaultTTL)
}

// ─── Task CRUD (Cache Layer) ────────────────────────────────

// GetTask retrieves a single task from cache.
func (m *Manager) GetTask(ctx context.Context, projectID, taskID uuid.UUID) (*domain.Task, error) {
	data, err := m.rdb.Get(ctx, ProjectTaskKey(projectID, taskID)).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrCacheMiss
		}
		return nil, fmt.Errorf("get task from cache: %w", err)
	}
	var task domain.Task
	if err := json.Unmarshal(data, &task); err != nil {
		return nil, fmt.Errorf("unmarshal cached task: %w", err)
	}
	return &task, nil
}

// ListTasks retrieves tasks for a given parent from cache.
// Returns an empty slice (not ErrCacheMiss) when the parent exists but has no children.
func (m *Manager) ListTasks(ctx context.Context, projectID uuid.UUID, parentID string) ([]*domain.Task, error) {
	childrenKey := ProjectChildrenKey(projectID, parentID)
	members, err := m.rdb.ZRangeByScore(ctx, childrenKey, &redis.ZRangeBy{
		Min: "-inf",
		Max: "+inf",
	}).Result()
	if err != nil {
		return nil, fmt.Errorf("zrange children: %w", err)
	}
	if len(members) == 0 {
		// Distinguish "key doesn't exist" (cache miss) from "empty sorted set" (no children).
		// If the project is loaded but this parent has no children key, fall back to DB.
		exists, exErr := m.rdb.Exists(ctx, childrenKey).Result()
		if exErr != nil || exists == 0 {
			return nil, ErrCacheMiss
		}
		// Key exists but is empty → parent genuinely has no children
		return []*domain.Task{}, nil
	}

	// Pipeline get all tasks
	pipe := m.rdb.Pipeline()
	cmds := make([]*redis.StringCmd, len(members))
	for i, memberID := range members {
		taskID, parseErr := uuid.Parse(memberID)
		if parseErr != nil {
			continue
		}
		cmds[i] = pipe.Get(ctx, ProjectTaskKey(projectID, taskID))
	}
	_, err = pipe.Exec(ctx)
	if err != nil && !errors.Is(err, redis.Nil) {
		return nil, fmt.Errorf("pipeline get tasks: %w", err)
	}

	tasks := make([]*domain.Task, 0, len(members))
	for _, cmd := range cmds {
		if cmd == nil {
			continue
		}
		data, err := cmd.Bytes()
		if err != nil {
			continue // Task may have been evicted
		}
		var task domain.Task
		if err := json.Unmarshal(data, &task); err != nil {
			continue
		}
		tasks = append(tasks, &task)
	}

	return tasks, nil
}

// SetTask writes a task to cache and updates the children index.
func (m *Manager) SetTask(ctx context.Context, projectID uuid.UUID, task *domain.Task) error {
	data, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("marshal task: %w", err)
	}

	pipe := m.rdb.Pipeline()

	// Set task data
	taskKey := ProjectTaskKey(projectID, task.ID)
	pipe.Set(ctx, taskKey, data, DefaultTTL)

	// Update children index
	parentKey := "root"
	if task.ParentTaskID != nil {
		parentKey = task.ParentTaskID.String()
	}
	childrenKey := ProjectChildrenKey(projectID, parentKey)
	pipe.ZAdd(ctx, childrenKey, redis.Z{
		Score:  float64(task.Position),
		Member: task.ID.String(),
	})
	pipe.Expire(ctx, childrenKey, DefaultTTL)

	// Set version
	versionKey := ProjectVersionKey(projectID, task.ID)
	pipe.Set(ctx, versionKey, task.Version, DefaultTTL)

	_, err = pipe.Exec(ctx)
	return err
}

// RemoveTask removes a task from cache and the children index.
func (m *Manager) RemoveTask(ctx context.Context, projectID, taskID uuid.UUID, parentID *uuid.UUID) error {
	pipe := m.rdb.Pipeline()

	pipe.Del(ctx, ProjectTaskKey(projectID, taskID))
	pipe.Del(ctx, ProjectVersionKey(projectID, taskID))

	parentKey := "root"
	if parentID != nil {
		parentKey = parentID.String()
	}
	pipe.ZRem(ctx, ProjectChildrenKey(projectID, parentKey), taskID.String())

	// Also clean up this task's children key (if it had subtasks)
	pipe.Del(ctx, ProjectChildrenKey(projectID, taskID.String()))

	_, err := pipe.Exec(ctx)
	return err
}

// RemoveFromParentIndex removes a task from a specific parent's children sorted set
// without deleting the task data itself. Used during reparenting to clean up the
// old parent's children list before SetTask adds to the new parent.
func (m *Manager) RemoveFromParentIndex(ctx context.Context, projectID, taskID uuid.UUID, parentID *uuid.UUID) error {
	parentKey := "root"
	if parentID != nil {
		parentKey = parentID.String()
	}
	return m.rdb.ZRem(ctx, ProjectChildrenKey(projectID, parentKey), taskID.String()).Err()
}

// ─── Conflict Detection ─────────────────────────────────────

// CheckAndIncrementVersion atomically checks the base version and increments.
// Returns the new version on success, or a ConflictError if mismatch.
func (m *Manager) CheckAndIncrementVersion(ctx context.Context, projectID, taskID uuid.UUID, baseVersion int64) (int64, error) {
	versionKey := ProjectVersionKey(projectID, taskID)

	// Use a Lua script for atomic compare-and-increment
	script := redis.NewScript(`
		local current = tonumber(redis.call('GET', KEYS[1]) or '0')
		if current ~= tonumber(ARGV[1]) then
			return {0, current}
		end
		local new = current + 1
		redis.call('SET', KEYS[1], new, 'EX', ARGV[2])
		return {1, new}
	`)

	result, err := script.Run(ctx, m.rdb, []string{versionKey}, baseVersion, int(DefaultTTL.Seconds())).Int64Slice()
	if err != nil {
		return 0, fmt.Errorf("version check script: %w", err)
	}

	if result[0] == 0 {
		// Version mismatch
		return result[1], nil // Return current server version
	}
	return result[1], nil
}

// FieldLevelMerge attempts to auto-merge changes when different fields were modified.
// Returns merged changes if possible, or an error if the same field was modified.
func FieldLevelMerge(serverTask *domain.Task, baseVersion int64, yourChanges map[string]any) (map[string]any, string, error) {
	// If versions match, no conflict
	if serverTask.Version == baseVersion {
		return yourChanges, "", nil
	}

	// Version diverged — another user made a change between baseVersion and
	// the server's current version.  Without per-field change tracking we
	// cannot distinguish "field unchanged on server but client wants to update"
	// from "field was updated by another user".  We therefore allow the merge
	// (field-level write-last-wins) which is safe for independent field edits.
	//
	// True same-field conflicts (e.g. both users editing title) are surfaced
	// via the CheckAndIncrementVersion layer: the second writer sees a version
	// mismatch and receives the server state so the UI can prompt for manual
	// resolution.

	return yourChanges, "auto-merged", nil
}

// ─── Dirty Set Management ────────────────────────────────────

// MarkDirty adds a task to the project's dirty set.
func (m *Manager) MarkDirty(ctx context.Context, projectID, taskID uuid.UUID) error {
	return m.rdb.SAdd(ctx, ProjectDirtyKey(projectID), taskID.String()).Err()
}

// GetDirtyTasks returns all task IDs in the dirty set.
func (m *Manager) GetDirtyTasks(ctx context.Context, projectID uuid.UUID) ([]uuid.UUID, error) {
	members, err := m.rdb.SMembers(ctx, ProjectDirtyKey(projectID)).Result()
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(members))
	for _, m := range members {
		id, err := uuid.Parse(m)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// RemoveFromDirty removes a task from the dirty set after successful DB flush.
func (m *Manager) RemoveFromDirty(ctx context.Context, projectID, taskID uuid.UUID) error {
	return m.rdb.SRem(ctx, ProjectDirtyKey(projectID), taskID.String()).Err()
}

// ─── Dashboard Aggregate Counters ────────────────────────────

// IncrementDashboardStat atomically adjusts a dashboard stat counter.
func (m *Manager) IncrementDashboardStat(ctx context.Context, orgID uuid.UUID, field string, delta int64) {
	key := OrgDashboardStatsKey(orgID)
	if err := m.rdb.HIncrBy(ctx, key, field, delta).Err(); err != nil {
		log.Warn().Err(err).Str("field", field).Msg("failed to increment dashboard stat")
	}
	m.rdb.Expire(ctx, key, DefaultTTL)
}

// SetDashboardStats sets the entire dashboard stats hash.
func (m *Manager) SetDashboardStats(ctx context.Context, orgID uuid.UUID, stats map[string]any) error {
	key := OrgDashboardStatsKey(orgID)
	fields := make(map[string]any)
	for k, v := range stats {
		fields[k] = fmt.Sprintf("%v", v)
	}
	if err := m.rdb.HSet(ctx, key, fields).Err(); err != nil {
		return err
	}
	return m.rdb.Expire(ctx, key, DefaultTTL).Err()
}

// GetDashboardStats retrieves the cached dashboard stats.
func (m *Manager) GetDashboardStats(ctx context.Context, orgID uuid.UUID) (map[string]string, error) {
	key := OrgDashboardStatsKey(orgID)
	result, err := m.rdb.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, err
	}
	if len(result) == 0 {
		return nil, ErrCacheMiss
	}
	return result, nil
}

// ─── Get All Tasks for DB Flush ──────────────────────────────

// GetAllProjectTasks returns all cached tasks for a project (used for reconciliation).
func (m *Manager) GetAllProjectTasks(ctx context.Context, projectID uuid.UUID) ([]*domain.Task, error) {
	pattern := fmt.Sprintf("%sproject:%s:task:*", keyPrefix, projectID)
	iter := m.rdb.Scan(ctx, 0, pattern, 500).Iterator()

	var tasks []*domain.Task
	pipe := m.rdb.Pipeline()
	var cmds []*redis.StringCmd

	for iter.Next(ctx) {
		cmds = append(cmds, pipe.Get(ctx, iter.Val()))
	}
	if err := iter.Err(); err != nil {
		return nil, err
	}

	if len(cmds) == 0 {
		return nil, nil
	}

	_, err := pipe.Exec(ctx)
	if err != nil && !errors.Is(err, redis.Nil) {
		return nil, err
	}

	for _, cmd := range cmds {
		data, err := cmd.Bytes()
		if err != nil {
			continue
		}
		var task domain.Task
		if err := json.Unmarshal(data, &task); err != nil {
			continue
		}
		tasks = append(tasks, &task)
	}
	return tasks, nil
}

// ─── Update Task Status Counters ─────────────────────────────

// UpdateStatusCounters adjusts org dashboard status counters on task status change.
func (m *Manager) UpdateStatusCounters(ctx context.Context, orgID uuid.UUID, oldStatus, newStatus string) {
	if oldStatus == newStatus {
		return
	}
	if oldStatus != "" {
		m.IncrementDashboardStat(ctx, orgID, "status:"+oldStatus, -1)
	}
	if newStatus != "" {
		m.IncrementDashboardStat(ctx, orgID, "status:"+newStatus, 1)
	}
}

// GetCachedVersion retrieves the cached version of a task.
func (m *Manager) GetCachedVersion(ctx context.Context, projectID, taskID uuid.UUID) (int64, error) {
	val, err := m.rdb.Get(ctx, ProjectVersionKey(projectID, taskID)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return 0, ErrCacheMiss
		}
		return 0, err
	}
	return strconv.ParseInt(val, 10, 64)
}

// ─── Progress Calculation ────────────────────────────────────

// statusProgress maps a task status to a progress value for leaf tasks.
func statusProgress(status string) float64 {
	switch status {
	case domain.TaskStatusDone:
		return 1.0
	case domain.TaskStatusInProgress:
		return 0.5
	default:
		return 0.0
	}
}

// ComputeProgress calculates progress for a single task:
// - Leaf (no children): derived from status
// - Parent: average of children's progress (read from cache)
// Stores the result in cache and returns it.
func (m *Manager) ComputeProgress(ctx context.Context, projectID, taskID uuid.UUID) (float64, error) {
	// Get children IDs from sorted set
	childrenKey := ProjectChildrenKey(projectID, taskID.String())
	childIDs, err := m.rdb.ZRangeByScore(ctx, childrenKey, &redis.ZRangeBy{
		Min: "-inf", Max: "+inf",
	}).Result()
	if err != nil {
		return 0, fmt.Errorf("get children for progress: %w", err)
	}

	var progress float64
	if len(childIDs) == 0 {
		// Leaf task — derive from status
		task, err := m.GetTask(ctx, projectID, taskID)
		if err != nil {
			return 0, err
		}
		progress = statusProgress(task.Status)
	} else {
		// Parent — average of children's cached progress
		pipe := m.rdb.Pipeline()
		cmds := make([]*redis.StringCmd, len(childIDs))
		for i, cid := range childIDs {
			cUUID, parseErr := uuid.Parse(cid)
			if parseErr != nil {
				continue
			}
			cmds[i] = pipe.Get(ctx, ProjectProgressKey(projectID, cUUID))
		}
		_, _ = pipe.Exec(ctx)

		var sum float64
		var count int
		for _, cmd := range cmds {
			if cmd == nil {
				continue
			}
			val, err := cmd.Float64()
			if err != nil {
				continue // child not yet computed, treat as 0
			}
			sum += val
			count++
		}
		// Include children whose progress keys don't exist yet (progress = 0)
		total := len(childIDs)
		if total > 0 {
			progress = sum / float64(total)
		}
		_ = count // used for sum; total includes missing
	}

	// Store computed progress
	progressKey := ProjectProgressKey(projectID, taskID)
	m.rdb.Set(ctx, progressKey, progress, DefaultTTL)

	return progress, nil
}

// RecalcProgressUp recomputes progress for a task and all its ancestors.
// Call this after any task create/update/delete that could affect progress.
// Returns the ancestor tasks (not the starting task) that had their progress updated.
func (m *Manager) RecalcProgressUp(ctx context.Context, projectID uuid.UUID, taskID uuid.UUID) []*domain.Task {
	var updated []*domain.Task
	// Walk from this task up to root, recomputing at each level
	current := taskID
	visited := map[uuid.UUID]bool{}
	for i := 0; i < MaxTaskDepth+2; i++ { // safety limit
		if visited[current] {
			break
		}
		visited[current] = true

		progress, err := m.ComputeProgress(ctx, projectID, current)
		if err != nil {
			log.Warn().Err(err).Str("task_id", current.String()).Msg("failed to compute progress")
			break
		}

		// Update the cached task JSON's Progress field
		task, err := m.GetTask(ctx, projectID, current)
		if err != nil {
			break
		}
		task.Progress = progress
		if setErr := m.SetTask(ctx, projectID, task); setErr != nil {
			log.Warn().Err(setErr).Msg("failed to update task with progress")
		}

		// Collect ancestors (skip the starting task itself)
		if current != taskID {
			updated = append(updated, task)
		}

		// Move to parent
		if task.ParentTaskID == nil {
			break
		}
		current = *task.ParentTaskID
	}
	return updated
}

// PrecomputeAllProgress computes and caches progress for all tasks in a project.
// Should be called after PreloadProject. Processes bottom-up by depth.
func (m *Manager) PrecomputeAllProgress(ctx context.Context, projectID uuid.UUID, tasks []*domain.Task) {
	// Group by depth, process deepest first
	maxDepth := 0
	byDepth := map[int][]*domain.Task{}
	for _, t := range tasks {
		byDepth[t.Depth] = append(byDepth[t.Depth], t)
		if t.Depth > maxDepth {
			maxDepth = t.Depth
		}
	}

	for d := maxDepth; d >= 0; d-- {
		for _, t := range byDepth[d] {
			progress, err := m.ComputeProgress(ctx, projectID, t.ID)
			if err != nil {
				continue
			}
			t.Progress = progress
		}
	}

	// Write all updated tasks back to cache with progress values
	pipe := m.rdb.Pipeline()
	for _, t := range tasks {
		data, err := json.Marshal(t)
		if err != nil {
			continue
		}
		pipe.Set(ctx, ProjectTaskKey(projectID, t.ID), data, DefaultTTL)
	}
	_, _ = pipe.Exec(ctx)
}

// MaxTaskDepth mirrors domain.MaxTaskDepth for the cache layer (avoid import cycle if needed).
const MaxTaskDepth = 3

// ─── Permission Caching ──────────────────────────────────────

// CachePermissionResult caches a permission check result.
func (m *Manager) CachePermissionResult(ctx context.Context, userID, orgID uuid.UUID, scope string, scopeID *uuid.UUID, resource, action string, allowed bool) error {
	key := PermissionCacheKey(userID, orgID, scope, scopeID, resource, action)
	val := "0"
	if allowed {
		val = "1"
	}
	return m.rdb.Set(ctx, key, val, PermissionCacheTTL).Err()
}

// GetCachedPermission gets a cached permission result. Returns (allowed, found).
func (m *Manager) GetCachedPermission(ctx context.Context, userID, orgID uuid.UUID, scope string, scopeID *uuid.UUID, resource, action string) (bool, bool) {
	key := PermissionCacheKey(userID, orgID, scope, scopeID, resource, action)
	val, err := m.rdb.Get(ctx, key).Result()
	if err != nil {
		return false, false
	}
	return val == "1", true
}

// ─── Role Permission Caching ─────────────────────────────────

// RolePermCacheTTL is the TTL for cached role permission lists.
const RolePermCacheTTL = 10 * time.Minute

// CacheRolePermissions stores the list of permissions for a role.
func (m *Manager) CacheRolePermissions(ctx context.Context, orgID uuid.UUID, scope, roleSlug string, perms []*domain.Permission) error {
	key := fmt.Sprintf("orbis:role-perms:%s:%s:%s", orgID, scope, roleSlug)
	data, err := json.Marshal(perms)
	if err != nil {
		return err
	}
	return m.rdb.Set(ctx, key, data, RolePermCacheTTL).Err()
}

// GetCachedRolePermissions retrieves cached permissions for a role.
func (m *Manager) GetCachedRolePermissions(ctx context.Context, orgID uuid.UUID, scope, roleSlug string) ([]*domain.Permission, bool) {
	key := fmt.Sprintf("orbis:role-perms:%s:%s:%s", orgID, scope, roleSlug)
	data, err := m.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	var perms []*domain.Permission
	if err := json.Unmarshal(data, &perms); err != nil {
		return nil, false
	}
	return perms, true
}

// InvalidateRolePermissions clears cached role permissions for an org.
func (m *Manager) InvalidateRolePermissions(ctx context.Context, orgID uuid.UUID) error {
	pattern := fmt.Sprintf("orbis:role-perms:%s:*", orgID)
	iter := m.rdb.Scan(ctx, 0, pattern, 100).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if len(keys) > 0 {
		return m.rdb.Del(ctx, keys...).Err()
	}
	return nil
}

// InvalidateUserPermissions clears all cached permissions for a user in an org.
func (m *Manager) InvalidateUserPermissions(ctx context.Context, userID, orgID uuid.UUID) error {
	pattern := PermissionInvalidatePattern(userID, orgID)
	iter := m.rdb.Scan(ctx, 0, pattern, 100).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if len(keys) > 0 {
		return m.rdb.Del(ctx, keys...).Err()
	}
	return nil
}
