package cache

import (
	"fmt"

	"github.com/google/uuid"
)

// keyPrefix includes a version tag so schema changes automatically invalidate old keys.
// Bump the version (v2 → v3 etc.) when the cached data structure changes.
const keyPrefix = "cache:v2:"

// ProjectTaskKey returns the Redis key for a single task in a project cache.
func ProjectTaskKey(projectID, taskID uuid.UUID) string {
	return fmt.Sprintf("%sproject:%s:task:%s", keyPrefix, projectID, taskID)
}

// ProjectChildrenKey returns the Redis sorted-set key for children of a parent.
// Use "root" for top-level tasks.
func ProjectChildrenKey(projectID uuid.UUID, parentID string) string {
	return fmt.Sprintf("%sproject:%s:children:%s", keyPrefix, projectID, parentID)
}

// ProjectVersionKey returns the Redis key for a task's version counter.
func ProjectVersionKey(projectID, taskID uuid.UUID) string {
	return fmt.Sprintf("%sproject:%s:version:%s", keyPrefix, projectID, taskID)
}

// ProjectDirtyKey returns the Redis set key tracking modified tasks not yet flushed.
func ProjectDirtyKey(projectID uuid.UUID) string {
	return fmt.Sprintf("%sproject:%s:dirty", keyPrefix, projectID)
}

// ProjectMetaKey returns the Redis hash key for project cache metadata.
func ProjectMetaKey(projectID uuid.UUID) string {
	return fmt.Sprintf("%sproject:%s:meta", keyPrefix, projectID)
}

// ProjectLockKey returns the Redis key used for distributed locking during preload.
func ProjectLockKey(projectID uuid.UUID) string {
	return fmt.Sprintf("%sproject:%s:lock", keyPrefix, projectID)
}

// ProjectGlobPattern returns a glob pattern matching all keys for a project cache.
func ProjectGlobPattern(projectID uuid.UUID) string {
	return fmt.Sprintf("%sproject:%s:*", keyPrefix, projectID)
}

// OrgDashboardStatsKey returns the Redis hash key for org dashboard stat counters.
func OrgDashboardStatsKey(orgID uuid.UUID) string {
	return fmt.Sprintf("%sorg:%s:dashboard:stats", keyPrefix, orgID)
}

// UserMyTasksKey returns the Redis set key tracking task IDs assigned to a user.
func UserMyTasksKey(orgID, userID uuid.UUID) string {
	return fmt.Sprintf("%sorg:%s:user:%s:my-tasks", keyPrefix, orgID, userID)
}

// ProjectProgressKey returns the Redis key for a task's computed progress value.
func ProjectProgressKey(projectID, taskID uuid.UUID) string {
	return fmt.Sprintf("%sproject:%s:progress:%s", keyPrefix, projectID, taskID)
}

// PermissionCacheKey returns the Redis key for a cached permission check result.
func PermissionCacheKey(userID, orgID uuid.UUID, scope string, scopeID *uuid.UUID, resource, action string) string {
	sid := "nil"
	if scopeID != nil {
		sid = scopeID.String()
	}
	return fmt.Sprintf("orbis:perm:%s:%s:%s:%s:%s:%s", userID, orgID, scope, sid, resource, action)
}

// PermissionInvalidatePattern returns a glob pattern matching all permission keys for a user in an org.
func PermissionInvalidatePattern(userID, orgID uuid.UUID) string {
	return fmt.Sprintf("orbis:perm:%s:%s:*", userID, orgID)
}
