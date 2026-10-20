package service_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/service"
)

/* ═══════════════════════════════════════════════════════
   Exported test wrappers — these call service-internal
   helpers via a thin wrapper in helpers_export_test.go
   ═══════════════════════════════════════════════════════ */

// --- extractReviewableFields ---

func TestExtractReviewableFields_Nil(t *testing.T) {
	fields := service.ExportExtractReviewableFields(nil)
	assert.Empty(t, fields)
}

func TestExtractReviewableFields_NoKey(t *testing.T) {
	s := map[string]any{"foo": "bar"}
	fields := service.ExportExtractReviewableFields(s)
	assert.Empty(t, fields)
}

func TestExtractReviewableFields_Valid(t *testing.T) {
	s := map[string]any{
		"reviewable_fields": []any{"status", "priority", "due_date"},
	}
	fields := service.ExportExtractReviewableFields(s)
	require.Len(t, fields, 3)
	assert.Equal(t, []string{"status", "priority", "due_date"}, fields)
}

func TestExtractReviewableFields_WrongType(t *testing.T) {
	s := map[string]any{"reviewable_fields": "not-an-array"}
	fields := service.ExportExtractReviewableFields(s)
	assert.Empty(t, fields)
}

func TestExtractReviewableFields_MixedTypes(t *testing.T) {
	s := map[string]any{
		"reviewable_fields": []any{"status", 42, "priority"},
	}
	fields := service.ExportExtractReviewableFields(s)
	// Skips non-string elements
	require.Len(t, fields, 2)
	assert.Equal(t, []string{"status", "priority"}, fields)
}

// --- partitionChanges ---

func TestPartitionChanges_NoReviewable(t *testing.T) {
	changes := map[string]any{"title": "new title", "description": "desc"}
	direct, review := service.ExportPartitionChanges(changes, nil)
	assert.Len(t, direct, 2)
	assert.Empty(t, review)
}

func TestPartitionChanges_AllReviewable(t *testing.T) {
	changes := map[string]any{"status": "in_progress", "priority": "high"}
	direct, review := service.ExportPartitionChanges(changes, []string{"status", "priority"})
	assert.Empty(t, direct)
	assert.Len(t, review, 2)
}

func TestPartitionChanges_Mixed(t *testing.T) {
	changes := map[string]any{
		"title":    "new title",
		"status":   "done",
		"priority": "low",
		"labels":   []string{"bug"},
	}
	direct, review := service.ExportPartitionChanges(changes, []string{"status", "priority"})
	assert.Len(t, direct, 2) // title, labels
	assert.Len(t, review, 2) // status, priority
	assert.Contains(t, direct, "title")
	assert.Contains(t, direct, "labels")
	assert.Contains(t, review, "status")
	assert.Contains(t, review, "priority")
}

func TestPartitionChanges_Empty(t *testing.T) {
	direct, review := service.ExportPartitionChanges(map[string]any{}, []string{"status"})
	assert.Empty(t, direct)
	assert.Empty(t, review)
}

// --- applyParamsToTask ---

func TestApplyParamsToTask_Title(t *testing.T) {
	task := &domain.Task{Title: "old"}
	service.ExportApplyParamsToTask(task, map[string]any{"title": "  new title  "})
	assert.Equal(t, "new title", task.Title) // trimmed
}

func TestApplyParamsToTask_Status(t *testing.T) {
	task := &domain.Task{Status: "todo"}
	service.ExportApplyParamsToTask(task, map[string]any{"status": "in_progress"})
	assert.Equal(t, "in_progress", task.Status)
}

func TestApplyParamsToTask_Priority(t *testing.T) {
	task := &domain.Task{Priority: "low"}
	service.ExportApplyParamsToTask(task, map[string]any{"priority": "high"})
	assert.Equal(t, "high", task.Priority)
}

func TestApplyParamsToTask_AssigneeID(t *testing.T) {
	task := &domain.Task{}
	uid := uuid.New()
	service.ExportApplyParamsToTask(task, map[string]any{"assignee_id": uid.String()})
	require.NotNil(t, task.AssigneeID)
	assert.Equal(t, uid, *task.AssigneeID)
}

func TestApplyParamsToTask_AssigneeID_Invalid(t *testing.T) {
	task := &domain.Task{}
	service.ExportApplyParamsToTask(task, map[string]any{"assignee_id": "not-a-uuid"})
	assert.Nil(t, task.AssigneeID) // unchanged
}

func TestApplyParamsToTask_DueDate(t *testing.T) {
	task := &domain.Task{}
	dt := time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC)
	service.ExportApplyParamsToTask(task, map[string]any{"due_date": dt.Format(time.RFC3339)})
	require.NotNil(t, task.DueDate)
	assert.Equal(t, dt, *task.DueDate)
}

func TestApplyParamsToTask_DueDate_Invalid(t *testing.T) {
	task := &domain.Task{}
	service.ExportApplyParamsToTask(task, map[string]any{"due_date": "yesterday"})
	assert.Nil(t, task.DueDate)
}

func TestApplyParamsToTask_EstimatedHours(t *testing.T) {
	task := &domain.Task{}
	service.ExportApplyParamsToTask(task, map[string]any{"estimated_hours": float64(4.5)})
	require.NotNil(t, task.EstimatedHours)
	assert.Equal(t, 4.5, *task.EstimatedHours)
}

func TestApplyParamsToTask_Labels_StringSlice(t *testing.T) {
	task := &domain.Task{}
	service.ExportApplyParamsToTask(task, map[string]any{"labels": []string{"bug", "feature"}})
	assert.Equal(t, []string{"bug", "feature"}, task.Labels)
}

func TestApplyParamsToTask_Labels_AnySlice(t *testing.T) {
	task := &domain.Task{}
	service.ExportApplyParamsToTask(task, map[string]any{"labels": []any{"bug", "feature"}})
	assert.Equal(t, []string{"bug", "feature"}, task.Labels)
}

func TestApplyParamsToTask_MultipleFields(t *testing.T) {
	task := &domain.Task{Title: "old", Status: "todo", Priority: "low"}
	service.ExportApplyParamsToTask(task, map[string]any{
		"title":    "updated",
		"status":   "done",
		"priority": "critical",
	})
	assert.Equal(t, "updated", task.Title)
	assert.Equal(t, "done", task.Status)
	assert.Equal(t, "critical", task.Priority)
}

func TestApplyParamsToTask_IgnoresUnknownField(t *testing.T) {
	task := &domain.Task{Title: "unchanged"}
	service.ExportApplyParamsToTask(task, map[string]any{"unknown_field": "value"})
	assert.Equal(t, "unchanged", task.Title)
}

func TestApplyParamsToTask_WrongType(t *testing.T) {
	task := &domain.Task{Status: "original"}
	service.ExportApplyParamsToTask(task, map[string]any{"status": 42})
	assert.Equal(t, "original", task.Status) // not changed
}

// --- applyChangesToTask (from change_request_service) ---

func TestApplyChangesToTask_Status(t *testing.T) {
	task := &domain.Task{Status: "todo"}
	service.ExportApplyChangesToTask(task, map[string]any{"status": "in_progress"})
	assert.Equal(t, "in_progress", task.Status)
}

func TestApplyChangesToTask_Priority(t *testing.T) {
	task := &domain.Task{Priority: "low"}
	service.ExportApplyChangesToTask(task, map[string]any{"priority": "high"})
	assert.Equal(t, "high", task.Priority)
}

func TestApplyChangesToTask_AssigneeID(t *testing.T) {
	task := &domain.Task{}
	uid := uuid.New()
	service.ExportApplyChangesToTask(task, map[string]any{"assignee_id": uid.String()})
	require.NotNil(t, task.AssigneeID)
	assert.Equal(t, uid, *task.AssigneeID)
}

func TestApplyChangesToTask_DueDate(t *testing.T) {
	task := &domain.Task{}
	dt := time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC)
	service.ExportApplyChangesToTask(task, map[string]any{"due_date": dt.Format(time.RFC3339)})
	require.NotNil(t, task.DueDate)
	assert.Equal(t, dt, *task.DueDate)
}

func TestApplyChangesToTask_Labels(t *testing.T) {
	task := &domain.Task{}
	service.ExportApplyChangesToTask(task, map[string]any{"labels": []any{"alpha", "beta"}})
	assert.Equal(t, []string{"alpha", "beta"}, task.Labels)
}

func TestApplyChangesToTask_MultipleFields(t *testing.T) {
	task := &domain.Task{Title: "old", Description: "old desc"}
	service.ExportApplyChangesToTask(task, map[string]any{
		"title":       "new",
		"description": "new desc",
	})
	assert.Equal(t, "new", task.Title)
	assert.Equal(t, "new desc", task.Description)
}

func TestApplyChangesToTask_InvalidFieldIgnored(t *testing.T) {
	task := &domain.Task{Title: "unchanged"}
	service.ExportApplyChangesToTask(task, map[string]any{"nonexistent": "value"})
	assert.Equal(t, "unchanged", task.Title)
}

func TestApplyChangesToTask_WrongTypeIgnored(t *testing.T) {
	task := &domain.Task{Priority: "low"}
	service.ExportApplyChangesToTask(task, map[string]any{"priority": 999})
	assert.Equal(t, "low", task.Priority) // unchanged
}

// --- change-request apply: regression tests for silently-dropped changes ---

func TestApplyChangesToTask_DateOnlyAccepted(t *testing.T) {
	task := &domain.Task{}
	require.NoError(t, service.ExportApplyChangesToTask(task, map[string]any{"due_date": "2026-10-25"}))
	require.NotNil(t, task.DueDate)
	assert.Equal(t, time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC), *task.DueDate)
}

func TestApplyChangesToTask_ISOWithMillisAccepted(t *testing.T) {
	task := &domain.Task{}
	require.NoError(t, service.ExportApplyChangesToTask(task, map[string]any{"start_date": "2026-10-10T00:00:00.000Z"}))
	require.NotNil(t, task.StartDate)
}

func TestApplyChangesToTask_NullClearsDatesAndHours(t *testing.T) {
	d := time.Now()
	h := 5.0
	task := &domain.Task{DueDate: &d, StartDate: &d, EstimatedHours: &h, ActualHours: &h}
	require.NoError(t, service.ExportApplyChangesToTask(task, map[string]any{
		"due_date": nil, "start_date": nil, "estimated_hours": nil, "actual_hours": nil,
	}))
	assert.Nil(t, task.DueDate)
	assert.Nil(t, task.StartDate)
	assert.Nil(t, task.EstimatedHours)
	assert.Nil(t, task.ActualHours)
}

func TestApplyChangesToTask_AssigneeIDsListWithPrimary(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	task := &domain.Task{}
	require.NoError(t, service.ExportApplyChangesToTask(task, map[string]any{
		"assignee_ids": []any{a.String(), b.String(), a.String()}, // duplicate collapsed
		"assignee_id":  b.String(),                                // list wins; primary = first
	}))
	assert.Equal(t, []uuid.UUID{a, b}, task.AssigneeIDs)
	require.NotNil(t, task.AssigneeID)
	assert.Equal(t, a, *task.AssigneeID)
}

func TestApplyChangesToTask_UnassignAll(t *testing.T) {
	a := uuid.New()
	task := &domain.Task{AssigneeID: &a, AssigneeIDs: []uuid.UUID{a}}
	require.NoError(t, service.ExportApplyChangesToTask(task, map[string]any{"assignee_ids": []any{}, "assignee_id": nil}))
	assert.Empty(t, task.AssigneeIDs)
	assert.Nil(t, task.AssigneeID)
}

func TestApplyChangesToTask_SingleAssigneeKeepsListInSync(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	task := &domain.Task{AssigneeID: &a, AssigneeIDs: []uuid.UUID{a}}
	require.NoError(t, service.ExportApplyChangesToTask(task, map[string]any{"assignee_id": b.String()}))
	require.NotNil(t, task.AssigneeID)
	assert.Equal(t, b, *task.AssigneeID)
	assert.Equal(t, []uuid.UUID{b, a}, task.AssigneeIDs)
}

func TestApplyChangesToTask_EstimatedHoursNumericForms(t *testing.T) {
	for _, v := range []any{12.5, "12.5", json.Number("12.5")} {
		task := &domain.Task{}
		require.NoError(t, service.ExportApplyChangesToTask(task, map[string]any{"estimated_hours": v}))
		require.NotNil(t, task.EstimatedHours)
		assert.Equal(t, 12.5, *task.EstimatedHours)
	}
}

func TestApplyChangesToTask_RejectsInvalidValuesAtomically(t *testing.T) {
	cases := map[string]map[string]any{
		"bad date":         {"due_date": "not-a-date"},
		"bad priority":     {"priority": "urgent!!"},
		"unknown field":    {"nonexistent": "x"},
		"negative hours":   {"estimated_hours": -1.0},
		"bad assignee":     {"assignee_ids": []any{"nope"}},
		"empty title":      {"title": "  "},
		"due before start": {"start_date": "2026-11-10", "due_date": "2026-11-01"},
	}
	for name, ch := range cases {
		task := &domain.Task{Title: "keep", Priority: "low"}
		// include a valid field too, to prove nothing is partially applied
		ch["status"] = "done"
		err := service.ExportApplyChangesToTask(task, ch)
		assert.Error(t, err, name)
		assert.Equal(t, "keep", task.Title, name)
		assert.Equal(t, "", task.Status, name+": valid field must not be partially applied")
	}
}
