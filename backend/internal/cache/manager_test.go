package cache

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/domain"
)

func setupTest(t *testing.T) (*Manager, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rdb.Close() })
	return NewManager(rdb), mr
}

func newTask(projectID uuid.UUID, parentID *uuid.UUID, position int, version int64) *domain.Task {
	return &domain.Task{
		ID:           uuid.New(),
		OrgID:        uuid.New(),
		ProjectID:    projectID,
		ParentTaskID: parentID,
		Title:        "Test Task",
		Status:       domain.TaskStatusTodo,
		Priority:     domain.PriorityMedium,
		Position:     position,
		Version:      version,
		Labels:       []string{},
		Metadata:     map[string]any{},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
}

// ═══════════════════════════════════════════════
// Project Lifecycle Tests
// ═══════════════════════════════════════════════

func TestIsProjectLoaded_Empty(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	assert.False(t, m.IsProjectLoaded(ctx, uuid.New()))
}

func TestPreloadProject_SetsMetaAndTasks(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := make([]*domain.Task, 5)
	for i := range tasks {
		tasks[i] = newTask(projectID, nil, i, 1)
	}

	err := m.PreloadProject(ctx, projectID, tasks)
	require.NoError(t, err)
	assert.True(t, m.IsProjectLoaded(ctx, projectID))
}

func TestPreloadProject_WithSubtasks(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	parent := newTask(projectID, nil, 0, 1)
	child1 := newTask(projectID, &parent.ID, 0, 1)
	child2 := newTask(projectID, &parent.ID, 1, 1)

	err := m.PreloadProject(ctx, projectID, []*domain.Task{parent, child1, child2})
	require.NoError(t, err)

	tasks, err := m.ListTasks(ctx, projectID, parent.ID.String())
	require.NoError(t, err)
	assert.Len(t, tasks, 2)
}

func TestPreloadProject_DistributedLock(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := []*domain.Task{newTask(projectID, nil, 0, 1)}

	err := m.PreloadProject(ctx, projectID, tasks)
	require.NoError(t, err)
	assert.True(t, m.IsProjectLoaded(ctx, projectID))

	err = m.PreloadProject(ctx, projectID, tasks)
	require.NoError(t, err)
}

func TestEvictProject(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := []*domain.Task{newTask(projectID, nil, 0, 1)}
	err := m.PreloadProject(ctx, projectID, tasks)
	require.NoError(t, err)
	assert.True(t, m.IsProjectLoaded(ctx, projectID))

	err = m.EvictProject(ctx, projectID)
	require.NoError(t, err)
	assert.False(t, m.IsProjectLoaded(ctx, projectID))
}

// ═══════════════════════════════════════════════
// Task CRUD Tests
// ═══════════════════════════════════════════════

func TestSetAndGetTask(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	task := newTask(projectID, nil, 0, 1)

	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	got, err := m.GetTask(ctx, projectID, task.ID)
	require.NoError(t, err)
	assert.Equal(t, task.ID, got.ID)
	assert.Equal(t, task.Title, got.Title)
	assert.Equal(t, task.Version, got.Version)
}

func TestGetTask_CacheMiss(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	_, err := m.GetTask(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, ErrCacheMiss)
}

func TestListTasks_Root(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := make([]*domain.Task, 3)
	for i := range tasks {
		tasks[i] = newTask(projectID, nil, i, 1)
	}

	err := m.PreloadProject(ctx, projectID, tasks)
	require.NoError(t, err)

	listed, err := m.ListTasks(ctx, projectID, "root")
	require.NoError(t, err)
	assert.Len(t, listed, 3)
}

func TestListTasks_CacheMiss(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	_, err := m.ListTasks(ctx, uuid.New(), "root")
	assert.ErrorIs(t, err, ErrCacheMiss)
}

func TestRemoveTask(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	task := newTask(projectID, nil, 0, 1)

	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	err = m.RemoveTask(ctx, projectID, task.ID, nil)
	require.NoError(t, err)

	_, err = m.GetTask(ctx, projectID, task.ID)
	assert.ErrorIs(t, err, ErrCacheMiss)
}

func TestRemoveTask_WithParent(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	parentID := uuid.New()
	task := newTask(projectID, &parentID, 0, 1)

	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	err = m.RemoveTask(ctx, projectID, task.ID, &parentID)
	require.NoError(t, err)

	_, err = m.GetTask(ctx, projectID, task.ID)
	assert.ErrorIs(t, err, ErrCacheMiss)
}

// ═══════════════════════════════════════════════
// Version / Conflict Detection Tests
// ═══════════════════════════════════════════════

func TestCheckAndIncrementVersion_Success(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	task := newTask(projectID, nil, 0, 1)

	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	newVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), newVer)
}

func TestCheckAndIncrementVersion_Conflict(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	task := newTask(projectID, nil, 0, 3)

	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	serverVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(3), serverVer)
}

func TestCheckAndIncrementVersion_SequentialIncrements(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	task := newTask(projectID, nil, 0, 1)

	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	v, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), v)

	v, err = m.CheckAndIncrementVersion(ctx, projectID, task.ID, 2)
	require.NoError(t, err)
	assert.Equal(t, int64(3), v)

	v, err = m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(3), v)
}

func TestGetCachedVersion(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	task := newTask(projectID, nil, 0, 5)

	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	ver, err := m.GetCachedVersion(ctx, projectID, task.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(5), ver)
}

func TestGetCachedVersion_CacheMiss(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	_, err := m.GetCachedVersion(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, ErrCacheMiss)
}

// ═══════════════════════════════════════════════
// Field-Level Merge Tests
// ═══════════════════════════════════════════════

func TestFieldLevelMerge_VersionsMatch(t *testing.T) {
	task := newTask(uuid.New(), nil, 0, 5)
	changes := map[string]any{"title": "new title"}

	merged, resolution, err := FieldLevelMerge(task, 5, changes)
	require.NoError(t, err)
	assert.Equal(t, "", resolution)
	assert.Equal(t, "new title", merged["title"])
}

func TestFieldLevelMerge_VersionsDiverge_AutoMerge(t *testing.T) {
	task := newTask(uuid.New(), nil, 0, 6)
	changes := map[string]any{"priority": "high"}

	merged, resolution, err := FieldLevelMerge(task, 5, changes)
	require.NoError(t, err)
	assert.Equal(t, "auto-merged", resolution)
	assert.Equal(t, "high", merged["priority"])
}

// ═══════════════════════════════════════════════
// Dirty Set Tests
// ═══════════════════════════════════════════════

func TestDirtySet_MarkAndGet(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	taskID1 := uuid.New()
	taskID2 := uuid.New()

	err := m.MarkDirty(ctx, projectID, taskID1)
	require.NoError(t, err)
	err = m.MarkDirty(ctx, projectID, taskID2)
	require.NoError(t, err)

	dirty, err := m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 2)
}

func TestDirtySet_RemoveFromDirty(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	taskID := uuid.New()

	err := m.MarkDirty(ctx, projectID, taskID)
	require.NoError(t, err)

	err = m.RemoveFromDirty(ctx, projectID, taskID)
	require.NoError(t, err)

	dirty, err := m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 0)
}

func TestDirtySet_Idempotent(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	taskID := uuid.New()

	for i := 0; i < 5; i++ {
		err := m.MarkDirty(ctx, projectID, taskID)
		require.NoError(t, err)
	}

	dirty, err := m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 1)
}

// ═══════════════════════════════════════════════
// Dashboard Aggregate Tests
// ═══════════════════════════════════════════════

func TestDashboardStats(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	orgID := uuid.New()

	err := m.SetDashboardStats(ctx, orgID, map[string]any{
		"total_tasks":        "100",
		"status:todo":        "50",
		"status:done":        "30",
		"status:in_progress": "20",
	})
	require.NoError(t, err)

	stats, err := m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "100", stats["total_tasks"])
	assert.Equal(t, "50", stats["status:todo"])
}

func TestDashboardStats_CacheMiss(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	_, err := m.GetDashboardStats(ctx, uuid.New())
	assert.ErrorIs(t, err, ErrCacheMiss)
}

func TestIncrementDashboardStat(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	orgID := uuid.New()

	err := m.SetDashboardStats(ctx, orgID, map[string]any{
		"status:todo": "10",
	})
	require.NoError(t, err)

	m.IncrementDashboardStat(ctx, orgID, "status:todo", 5)

	stats, err := m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "15", stats["status:todo"])
}

func TestUpdateStatusCounters(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	orgID := uuid.New()

	err := m.SetDashboardStats(ctx, orgID, map[string]any{
		"status:todo":        "10",
		"status:in_progress": "5",
	})
	require.NoError(t, err)

	m.UpdateStatusCounters(ctx, orgID, "todo", "in_progress")

	stats, err := m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "9", stats["status:todo"])
	assert.Equal(t, "6", stats["status:in_progress"])
}

func TestUpdateStatusCounters_SameStatus_NoOp(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	orgID := uuid.New()

	err := m.SetDashboardStats(ctx, orgID, map[string]any{
		"status:todo": "10",
	})
	require.NoError(t, err)

	m.UpdateStatusCounters(ctx, orgID, "todo", "todo")

	stats, err := m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "10", stats["status:todo"])
}

// ═══════════════════════════════════════════════
// GetAllProjectTasks Tests
// ═══════════════════════════════════════════════

func TestGetAllProjectTasks(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := make([]*domain.Task, 10)
	for i := range tasks {
		tasks[i] = newTask(projectID, nil, i, 1)
	}

	err := m.PreloadProject(ctx, projectID, tasks)
	require.NoError(t, err)

	all, err := m.GetAllProjectTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, all, 10)
}

func TestGetAllProjectTasks_Empty(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()

	all, err := m.GetAllProjectTasks(ctx, uuid.New())
	require.NoError(t, err)
	assert.Nil(t, all)
}

// ═══════════════════════════════════════════════
// Edge Cases / Concurrency Tests
// ═══════════════════════════════════════════════

func TestSetTask_UpdatesChildrenIndex(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	parentID := uuid.New()

	child1 := newTask(projectID, &parentID, 0, 1)
	child2 := newTask(projectID, &parentID, 1, 1)

	err := m.SetTask(ctx, projectID, child1)
	require.NoError(t, err)
	err = m.SetTask(ctx, projectID, child2)
	require.NoError(t, err)

	tasks, err := m.ListTasks(ctx, projectID, parentID.String())
	require.NoError(t, err)
	assert.Len(t, tasks, 2)
}

func TestSetTask_UpdatePosition(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	task := newTask(projectID, nil, 0, 1)
	err := m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	task.Position = 5
	task.Version = 2
	err = m.SetTask(ctx, projectID, task)
	require.NoError(t, err)

	got, err := m.GetTask(ctx, projectID, task.ID)
	require.NoError(t, err)
	assert.Equal(t, 5, got.Position)
	assert.Equal(t, int64(2), got.Version)
}

func TestRefreshTTL(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := []*domain.Task{newTask(projectID, nil, 0, 1)}
	err := m.PreloadProject(ctx, projectID, tasks)
	require.NoError(t, err)

	m.RefreshTTL(ctx, projectID)
	assert.True(t, m.IsProjectLoaded(ctx, projectID))
}

// ═══════════════════════════════════════════════
// Keys Tests
// ═══════════════════════════════════════════════

func TestKeyBuilders(t *testing.T) {
	pid := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	tid := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	assert.Equal(t, "cache:project:11111111-1111-1111-1111-111111111111:task:22222222-2222-2222-2222-222222222222", ProjectTaskKey(pid, tid))
	assert.Equal(t, "cache:project:11111111-1111-1111-1111-111111111111:children:root", ProjectChildrenKey(pid, "root"))
	assert.Contains(t, ProjectGlobPattern(pid), "cache:project:11111111-1111-1111-1111-111111111111:*")
}
