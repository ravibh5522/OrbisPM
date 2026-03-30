package cache

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/domain"
)

// ═══════════════════════════════════════════════
// End-to-End Cache Flow Tests
// ═══════════════════════════════════════════════

// TestE2E_PreloadMutateFlush simulates the full lifecycle:
// preload project → create tasks → update tasks → mark dirty → flush → verify.
func TestE2E_PreloadMutateFlush(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	// 1. Preload project with initial tasks
	initialTasks := make([]*domain.Task, 5)
	for i := range initialTasks {
		initialTasks[i] = newTask(projectID, nil, i, 1)
	}
	require.NoError(t, m.PreloadProject(ctx, projectID, initialTasks))
	assert.True(t, m.IsProjectLoaded(ctx, projectID))

	// 2. Add a new task to cache
	newT := newTask(projectID, nil, 5, 1)
	require.NoError(t, m.SetTask(ctx, projectID, newT))

	// 3. Update an existing task's version
	updatedTask := initialTasks[0]
	updatedTask.Title = "Updated Title"
	updatedTask.Version = 2
	require.NoError(t, m.SetTask(ctx, projectID, updatedTask))

	// 4. Mark as dirty
	require.NoError(t, m.MarkDirty(ctx, projectID, updatedTask.ID))
	require.NoError(t, m.MarkDirty(ctx, projectID, newT.ID))

	// 5. Get dirty set
	dirty, err := m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 2)

	// 6. Simulate flush — read from cache, "write to DB", remove from dirty
	for _, taskID := range dirty {
		cachedTask, getErr := m.GetTask(ctx, projectID, taskID)
		require.NoError(t, getErr)
		assert.NotNil(t, cachedTask)

		require.NoError(t, m.RemoveFromDirty(ctx, projectID, taskID))
	}

	// 7. Verify dirty set is empty
	dirty, err = m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 0)

	// 8. Verify all tasks still in cache (6 total: 5 original + 1 new)
	allTasks, err := m.GetAllProjectTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, allTasks, 6)
}

// TestE2E_ConcurrentVersionIncrements verifies that sequential version increments
// work correctly with atomic CAS — each increment succeeds only at the correct expected version.
func TestE2E_ConcurrentVersionIncrements(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	task := newTask(projectID, nil, 0, 1)

	require.NoError(t, m.SetTask(ctx, projectID, task))

	// Sequential increments: each pass must use the correct expected version
	for i := int64(1); i <= 10; i++ {
		newVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, i)
		require.NoError(t, err)
		assert.Equal(t, i+1, newVer, "increment from version %d should give %d", i, i+1)
	}

	// Now a stale request at version 1 should return current version (11), not increment
	staleVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(11), staleVer, "stale request should return current server version")
}

// TestE2E_SubtaskHierarchy tests parent-child relationships across preload → mutation → listing.
func TestE2E_SubtaskHierarchy(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	parent := newTask(projectID, nil, 0, 1)
	child1 := newTask(projectID, &parent.ID, 0, 1)
	child2 := newTask(projectID, &parent.ID, 1, 1)
	grandchild := newTask(projectID, &child1.ID, 0, 1)

	require.NoError(t, m.PreloadProject(ctx, projectID, []*domain.Task{parent, child1, child2, grandchild}))

	// List root tasks
	roots, err := m.ListTasks(ctx, projectID, "root")
	require.NoError(t, err)
	assert.Len(t, roots, 1)
	assert.Equal(t, parent.ID, roots[0].ID)

	// List parent's children
	children, err := m.ListTasks(ctx, projectID, parent.ID.String())
	require.NoError(t, err)
	assert.Len(t, children, 2)

	// List child1's children
	grandchildren, err := m.ListTasks(ctx, projectID, child1.ID.String())
	require.NoError(t, err)
	assert.Len(t, grandchildren, 1)
	assert.Equal(t, grandchild.ID, grandchildren[0].ID)

	// Add another child to parent via SetTask
	child3 := newTask(projectID, &parent.ID, 2, 1)
	require.NoError(t, m.SetTask(ctx, projectID, child3))

	children, err = m.ListTasks(ctx, projectID, parent.ID.String())
	require.NoError(t, err)
	assert.Len(t, children, 3)

	// Remove a child
	require.NoError(t, m.RemoveTask(ctx, projectID, child2.ID, &parent.ID))
	children, err = m.ListTasks(ctx, projectID, parent.ID.String())
	require.NoError(t, err)
	assert.Len(t, children, 2)
}

// TestE2E_ConflictResolution_FieldLevelMerge tests the full conflict detection + merge path.
func TestE2E_ConflictResolution_FieldLevelMerge(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	task := newTask(projectID, nil, 0, 1)
	task.Title = "Original Title"
	task.Status = domain.TaskStatusTodo
	task.Priority = domain.PriorityLow
	require.NoError(t, m.SetTask(ctx, projectID, task))

	// User A reads task at version 1, starts editing title
	// User B reads task at version 1, changes priority to "high"
	// User B submits first → version becomes 2
	newVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), newVer)

	// Update server state
	task.Priority = domain.PriorityHigh
	task.Version = 2
	require.NoError(t, m.SetTask(ctx, projectID, task))

	// User A now submits title change at base_version=1 (stale)
	serverVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), serverVer) // conflict — server is at 2

	// Get server state for merge
	serverTask, err := m.GetTask(ctx, projectID, task.ID)
	require.NoError(t, err)

	// User A only changed title (non-overlapping with B's priority change)
	userAChanges := map[string]any{"title": "User A Title"}
	merged, resolution, err := FieldLevelMerge(serverTask, 1, userAChanges)
	require.NoError(t, err)
	assert.Equal(t, "auto-merged", resolution)
	assert.Equal(t, "User A Title", merged["title"])
}

// TestE2E_ConflictResolution_TrueConflict tests when two users modify the same field.
func TestE2E_ConflictResolution_TrueConflict(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	task := newTask(projectID, nil, 0, 1)
	task.Title = "Original"
	require.NoError(t, m.SetTask(ctx, projectID, task))

	// User B updates title, version → 2
	newVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), newVer)

	task.Title = "User B Title"
	task.Version = 2
	require.NoError(t, m.SetTask(ctx, projectID, task))

	// User A also tries to update title at base v1
	serverVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), serverVer)

	serverTask, err := m.GetTask(ctx, projectID, task.ID)
	require.NoError(t, err)

	// FieldLevelMerge uses auto-merge (last-write-wins) since we don't track per-field versions
	userAChanges := map[string]any{"title": "User A Title"}
	merged, resolution, err := FieldLevelMerge(serverTask, 1, userAChanges)
	require.NoError(t, err)
	assert.Equal(t, "auto-merged", resolution)
	assert.Equal(t, "User A Title", merged["title"])
}

// TestE2E_EvictAndReload tests evicting a project cache and reloading it.
func TestE2E_EvictAndReload(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := make([]*domain.Task, 3)
	for i := range tasks {
		tasks[i] = newTask(projectID, nil, i, 1)
	}
	require.NoError(t, m.PreloadProject(ctx, projectID, tasks))
	assert.True(t, m.IsProjectLoaded(ctx, projectID))

	// Modify a task
	tasks[0].Title = "Modified"
	tasks[0].Version = 2
	require.NoError(t, m.SetTask(ctx, projectID, tasks[0]))

	// Evict
	require.NoError(t, m.EvictProject(ctx, projectID))
	assert.False(t, m.IsProjectLoaded(ctx, projectID))

	// All tasks should be gone
	_, err := m.GetTask(ctx, projectID, tasks[0].ID)
	assert.ErrorIs(t, err, ErrCacheMiss)

	// Reload fresh data (simulating DB reload)
	reloadedTasks := make([]*domain.Task, 3)
	for i := range reloadedTasks {
		reloadedTasks[i] = newTask(projectID, nil, i, 1)
	}
	require.NoError(t, m.PreloadProject(ctx, projectID, reloadedTasks))
	assert.True(t, m.IsProjectLoaded(ctx, projectID))

	all, err := m.GetAllProjectTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, all, 3)
}

// TestE2E_DashboardCountersWithTaskMutations tests dashboard aggregate updates
// during task status transitions.
func TestE2E_DashboardCountersWithTaskMutations(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	orgID := uuid.New()

	// Initialize dashboard stats
	require.NoError(t, m.SetDashboardStats(ctx, orgID, map[string]any{
		"total_tasks":        "10",
		"status:todo":        "5",
		"status:in_progress": "3",
		"status:done":        "2",
	}))

	// Task moves from todo → in_progress
	m.UpdateStatusCounters(ctx, orgID, "todo", "in_progress")
	stats, err := m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "4", stats["status:todo"])
	assert.Equal(t, "4", stats["status:in_progress"])
	assert.Equal(t, "2", stats["status:done"])

	// Task moves from in_progress → done
	m.UpdateStatusCounters(ctx, orgID, "in_progress", "done")
	stats, err = m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "4", stats["status:todo"])
	assert.Equal(t, "3", stats["status:in_progress"])
	assert.Equal(t, "3", stats["status:done"])

	// New task created (increment total + todo)
	m.IncrementDashboardStat(ctx, orgID, "total_tasks", 1)
	m.IncrementDashboardStat(ctx, orgID, "status:todo", 1)
	stats, err = m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "11", stats["total_tasks"])
	assert.Equal(t, "5", stats["status:todo"])
}

// TestE2E_MultiProjectIsolation verifies that operations on one project cache
// don't affect another project's cache.
func TestE2E_MultiProjectIsolation(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()

	proj1 := uuid.New()
	proj2 := uuid.New()

	tasks1 := make([]*domain.Task, 3)
	for i := range tasks1 {
		tasks1[i] = newTask(proj1, nil, i, 1)
	}
	require.NoError(t, m.PreloadProject(ctx, proj1, tasks1))

	tasks2 := make([]*domain.Task, 5)
	for i := range tasks2 {
		tasks2[i] = newTask(proj2, nil, i, 1)
	}
	require.NoError(t, m.PreloadProject(ctx, proj2, tasks2))

	// Verify isolation
	all1, err := m.GetAllProjectTasks(ctx, proj1)
	require.NoError(t, err)
	assert.Len(t, all1, 3)

	all2, err := m.GetAllProjectTasks(ctx, proj2)
	require.NoError(t, err)
	assert.Len(t, all2, 5)

	// Evict proj1 — proj2 should be unaffected
	require.NoError(t, m.EvictProject(ctx, proj1))
	assert.False(t, m.IsProjectLoaded(ctx, proj1))
	assert.True(t, m.IsProjectLoaded(ctx, proj2))

	all2, err = m.GetAllProjectTasks(ctx, proj2)
	require.NoError(t, err)
	assert.Len(t, all2, 5)
}

// TestE2E_TaskSerializationRoundTrip verifies that all task fields survive
// the JSON serialization through Redis.
func TestE2E_TaskSerializationRoundTrip(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	parentID := uuid.New()
	assigneeID := uuid.New()
	reporterID := uuid.New()

	now := time.Now().UTC().Truncate(time.Millisecond)
	dueDate := now.Add(24 * time.Hour)
	startDate := now.Add(-24 * time.Hour)

	task := &domain.Task{
		ID:             uuid.New(),
		OrgID:          uuid.New(),
		ProjectID:      projectID,
		ParentTaskID:   &parentID,
		Title:          "Full Task",
		Description:    "Description with special chars: <>&\"'",
		Status:         domain.TaskStatusInProgress,
		Priority:       domain.PriorityHigh,
		AssigneeID:     &assigneeID,
		ReporterID:     &reporterID,
		DueDate:        &dueDate,
		StartDate:      &startDate,
		EstimatedHours: floatPtr(8.5),
		ActualHours:    floatPtr(3.25),
		Position:       42,
		Depth:          2,
		Version:        7,
		Labels:         []string{"bug", "urgent", "v2.0"},
		Metadata:       map[string]any{"custom_field": "value", "nested": map[string]any{"a": float64(1)}},
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	require.NoError(t, m.SetTask(ctx, projectID, task))

	got, err := m.GetTask(ctx, projectID, task.ID)
	require.NoError(t, err)

	assert.Equal(t, task.ID, got.ID)
	assert.Equal(t, task.OrgID, got.OrgID)
	assert.Equal(t, task.ProjectID, got.ProjectID)
	assert.Equal(t, task.ParentTaskID, got.ParentTaskID)
	assert.Equal(t, task.Title, got.Title)
	assert.Equal(t, task.Description, got.Description)
	assert.Equal(t, task.Status, got.Status)
	assert.Equal(t, task.Priority, got.Priority)
	assert.Equal(t, task.AssigneeID, got.AssigneeID)
	assert.Equal(t, task.ReporterID, got.ReporterID)
	assert.Equal(t, task.Position, got.Position)
	assert.Equal(t, task.Depth, got.Depth)
	assert.Equal(t, task.Version, got.Version)
	assert.Equal(t, task.Labels, got.Labels)
	assert.InDelta(t, *task.EstimatedHours, *got.EstimatedHours, 0.001)
	assert.InDelta(t, *task.ActualHours, *got.ActualHours, 0.001)

	// Metadata round-trip check
	gotMeta, _ := json.Marshal(got.Metadata)
	expMeta, _ := json.Marshal(task.Metadata)
	assert.JSONEq(t, string(expMeta), string(gotMeta))
}

func floatPtr(f float64) *float64 {
	return &f
}

// TestE2E_ConcurrentPreloads verifies that multiple goroutines trying to preload
// the same project don't corrupt the cache.
func TestE2E_ConcurrentPreloads(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rdb.Close() })
	m := NewManager(rdb)
	ctx := context.Background()
	projectID := uuid.New()

	tasks := make([]*domain.Task, 20)
	for i := range tasks {
		tasks[i] = newTask(projectID, nil, i, 1)
	}

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = m.PreloadProject(ctx, projectID, tasks)
		}()
	}
	wg.Wait()

	assert.True(t, m.IsProjectLoaded(ctx, projectID))
	all, err := m.GetAllProjectTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, all, 20)
}

// TestE2E_DirtySetPersistsThroughFlush ensures ordered flush works correctly.
func TestE2E_DirtySetPersistsThroughFlush(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()

	// Create 10 dirty tasks
	taskIDs := make([]uuid.UUID, 10)
	for i := range taskIDs {
		taskIDs[i] = uuid.New()
		require.NoError(t, m.MarkDirty(ctx, projectID, taskIDs[i]))
	}

	dirty, err := m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 10)

	// Flush first 5
	for i := 0; i < 5; i++ {
		require.NoError(t, m.RemoveFromDirty(ctx, projectID, taskIDs[i]))
	}

	dirty, err = m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 5)

	// Flush remaining
	for i := 5; i < 10; i++ {
		require.NoError(t, m.RemoveFromDirty(ctx, projectID, taskIDs[i]))
	}

	dirty, err = m.GetDirtyTasks(ctx, projectID)
	require.NoError(t, err)
	assert.Len(t, dirty, 0)
}

// TestE2E_RapidStatusTransitions tests multiple status changes to the same task
// with version tracking at each step.
func TestE2E_RapidStatusTransitions(t *testing.T) {
	m, _ := setupTest(t)
	ctx := context.Background()
	projectID := uuid.New()
	orgID := uuid.New()

	task := newTask(projectID, nil, 0, 1)
	task.OrgID = orgID
	task.Status = domain.TaskStatusTodo
	require.NoError(t, m.SetTask(ctx, projectID, task))

	require.NoError(t, m.SetDashboardStats(ctx, orgID, map[string]any{
		"status:todo":        "1",
		"status:in_progress": "0",
		"status:done":        "0",
		"status:blocked":     "0",
	}))

	transitions := []struct {
		from    string
		to      string
		version int64
	}{
		{"todo", "in_progress", 1},
		{"in_progress", "blocked", 2},
		{"blocked", "in_progress", 3},
		{"in_progress", "done", 4},
	}

	for _, tr := range transitions {
		newVer, err := m.CheckAndIncrementVersion(ctx, projectID, task.ID, tr.version)
		require.NoError(t, err)
		assert.Equal(t, tr.version+1, newVer)

		task.Status = tr.to
		task.Version = newVer
		require.NoError(t, m.SetTask(ctx, projectID, task))
		m.UpdateStatusCounters(ctx, orgID, tr.from, tr.to)
	}

	stats, err := m.GetDashboardStats(ctx, orgID)
	require.NoError(t, err)
	assert.Equal(t, "0", stats["status:todo"])
	assert.Equal(t, "0", stats["status:in_progress"])
	assert.Equal(t, "1", stats["status:done"])
	assert.Equal(t, "0", stats["status:blocked"])
}
