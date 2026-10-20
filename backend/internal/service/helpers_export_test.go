package service

// helpers_export_test.go exposes unexported helpers to the _test package.
// This file is compiled ONLY during `go test`.

import "github.com/orbispm/orbispm/internal/domain"

// ExportExtractReviewableFields exposes extractReviewableFields for testing.
func ExportExtractReviewableFields(settings map[string]any) []string {
	return extractReviewableFields(settings)
}

// ExportPartitionChanges exposes partitionChanges for testing.
func ExportPartitionChanges(changes map[string]any, reviewableFields []string) (map[string]any, map[string]any) {
	return partitionChanges(changes, reviewableFields)
}

// ExportApplyParamsToTask exposes applyParamsToTask for testing.
func ExportApplyParamsToTask(task *domain.Task, changes map[string]any) {
	applyParamsToTask(task, changes)
}

// ExportApplyChangesToTask exposes applyChangesToTask for testing.
func ExportApplyChangesToTask(task *domain.Task, changes map[string]any) error {
	return applyChangesToTask(task, changes)
}

// --- Drive helpers ---

var (
	ExportValidateDriveName     = validateDriveName
	ExportUniqueDriveName       = uniqueDriveName
	ExportDriveNameBase         = driveNameBase
	ExportDriveInlineType       = driveInlineType
	ExportDriveDownloadParams   = driveDownloadParams
	ExportValidateDriveMove     = validateDriveMove
	ExportContentDisposition    = contentDisposition
	ExportVisibleDriveAncestors = visibleDriveAncestors
	ExportCapDriveAudience      = capDriveAudience
	ExportWithinDriveCap        = withinDriveCap
	ExportCanTrashDrive         = canTrashDrive
	ExportCheckDriveRole        = checkDriveRole
	ExportDriveChildAncestors   = driveChildAncestors
	ExportMaxDriveAudience      = maxDriveAudience
)
