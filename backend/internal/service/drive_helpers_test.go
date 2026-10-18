package service_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/service"
)

func driveCode(t *testing.T, err error) int {
	t.Helper()
	appErr, ok := domain.IsAppError(err)
	require.True(t, ok, "expected AppError, got %v", err)
	return appErr.Code
}

// --- Roles ---

func TestDriveRole_RankAndMax(t *testing.T) {
	none, viewer, editor, manager := domain.DriveRoleNone, domain.DriveRoleViewer, domain.DriveRoleEditor, domain.DriveRoleManager
	assert.Less(t, none.Rank(), viewer.Rank())
	assert.Less(t, viewer.Rank(), editor.Rank())
	assert.Less(t, editor.Rank(), manager.Rank())

	assert.Equal(t, editor, domain.MaxDriveRole(viewer, editor))
	assert.Equal(t, manager, domain.MaxDriveRole(manager, editor))
	assert.Equal(t, viewer, domain.MaxDriveRole(none, viewer))
	assert.Equal(t, none, domain.MaxDriveRole(none, none))

	assert.True(t, editor.AtLeast(viewer))
	assert.True(t, editor.AtLeast(editor))
	assert.False(t, viewer.AtLeast(editor))
	assert.False(t, none.AtLeast(viewer))
}

func TestParseDriveRole(t *testing.T) {
	for _, s := range []string{"viewer", "editor", "manager"} {
		r, ok := domain.ParseDriveRole(s)
		assert.True(t, ok, s)
		assert.Equal(t, domain.DriveRole(s), r)
	}
	for _, s := range []string{"", "owner", "Viewer", "none"} {
		_, ok := domain.ParseDriveRole(s)
		assert.False(t, ok, s)
	}
}

func TestWithinDriveCap(t *testing.T) {
	assert.True(t, service.ExportWithinDriveCap(domain.DriveRoleEditor, domain.DriveRoleViewer))
	assert.True(t, service.ExportWithinDriveCap(domain.DriveRoleEditor, domain.DriveRoleEditor))
	assert.False(t, service.ExportWithinDriveCap(domain.DriveRoleEditor, domain.DriveRoleManager))
	assert.True(t, service.ExportWithinDriveCap(domain.DriveRoleManager, domain.DriveRoleManager))
	assert.False(t, service.ExportWithinDriveCap(domain.DriveRoleViewer, domain.DriveRoleEditor))
}

func TestCanTrashDrive(t *testing.T) {
	assert.True(t, service.ExportCanTrashDrive(domain.DriveRoleManager, false))
	assert.True(t, service.ExportCanTrashDrive(domain.DriveRoleViewer, true), "creator with viewer")
	assert.False(t, service.ExportCanTrashDrive(domain.DriveRoleEditor, false), "editor, not creator")
	assert.False(t, service.ExportCanTrashDrive(domain.DriveRoleNone, true), "creator who lost access")
}

func TestCheckDriveRole_404Not403(t *testing.T) {
	assert.Equal(t, http.StatusNotFound, driveCode(t, service.ExportCheckDriveRole(domain.DriveRoleNone, domain.DriveRoleViewer)))
	assert.Equal(t, http.StatusForbidden, driveCode(t, service.ExportCheckDriveRole(domain.DriveRoleViewer, domain.DriveRoleEditor)))
	assert.NoError(t, service.ExportCheckDriveRole(domain.DriveRoleManager, domain.DriveRoleEditor))
}

// --- Names ---

func TestUniqueDriveName(t *testing.T) {
	cases := []struct {
		name  string
		taken []string
		want  string
	}{
		{"a.pdf", nil, "a.pdf"},
		{"a.pdf", []string{"a.pdf"}, "a (1).pdf"},
		{"A.PDF", []string{"a.pdf"}, "A (1).PDF"},
		{"a.pdf", []string{"a.pdf", "a (1).pdf"}, "a (2).pdf"},
		{"a (1).pdf", []string{"a.pdf", "a (1).pdf"}, "a (2).pdf"},
		{"a (1).pdf", []string{"a.pdf"}, "a (1).pdf"},
		{"Notes", []string{"notes"}, "Notes (1)"},
		{"Notes (3)", []string{"notes (3)", "notes (1)"}, "Notes (2)"},
		{".env", []string{".env"}, ".env (1)"},
		{"archive.tar.gz", []string{"archive.tar.gz"}, "archive.tar (1).gz"},
		{"trailing.", []string{"trailing."}, "trailing. (1)"},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, service.ExportUniqueDriveName(c.name, c.taken), c.name)
	}
}

func TestUniqueDriveName_StaysWithinLimit(t *testing.T) {
	long := strings.Repeat("x", 251) + ".pdf"
	got := service.ExportUniqueDriveName(long, []string{long})
	assert.LessOrEqual(t, len([]rune(got)), 255)
	assert.True(t, strings.HasSuffix(got, " (1).pdf"))
}

func TestDriveNameBase(t *testing.T) {
	assert.Equal(t, "a", service.ExportDriveNameBase("a (12).pdf"))
	assert.Equal(t, "a", service.ExportDriveNameBase("a.pdf"))
	assert.Equal(t, ".env", service.ExportDriveNameBase(".env"))
	assert.Equal(t, "x(1)", service.ExportDriveNameBase("x(1)"), "counter needs a leading space")
}

func TestValidateDriveName(t *testing.T) {
	ok, err := service.ExportValidateDriveName("  Q3 roadmap.pdf ")
	require.NoError(t, err)
	assert.Equal(t, "Q3 roadmap.pdf", ok)

	_, err = service.ExportValidateDriveName(strings.Repeat("é", 255))
	assert.NoError(t, err, "255 runes is fine even when longer in bytes")

	for _, bad := range []string{"", "   ", strings.Repeat("a", 256), "a/b", `a\b`, ".", "..", "...", "a\x00b", "line\nbreak", "\xff"} {
		_, err := service.ExportValidateDriveName(bad)
		require.Error(t, err, "%q", bad)
		assert.Equal(t, http.StatusUnprocessableEntity, driveCode(t, err), "%q", bad)
	}
}

// --- Content safety ---

func TestDriveInlineType(t *testing.T) {
	inline := map[string]string{
		"image/png":                 "image/png",
		"image/jpeg":                "image/jpeg",
		"image/webp":                "image/webp",
		"image/gif":                 "image/gif",
		"application/pdf":           "application/pdf",
		"video/mp4":                 "video/mp4",
		"video/webm":                "video/webm",
		"audio/mpeg":                "audio/mpeg",
		"text/plain; charset=utf-8": "text/plain; charset=utf-8",
		"text/markdown":             "text/markdown",
		"text/csv":                  "text/csv",
		"application/json":          "text/plain; charset=utf-8",
		"application/xml":           "text/plain; charset=utf-8",
		"text/x-python":             "text/plain; charset=utf-8",
		"text/javascript":           "text/plain; charset=utf-8",
	}
	for in, want := range inline {
		got, ok := service.ExportDriveInlineType(in)
		assert.True(t, ok, in)
		assert.Equal(t, want, got, in)
	}
	for _, risky := range []string{"text/html", "image/svg+xml", "application/xhtml+xml", "application/octet-stream",
		"application/zip", "application/vnd.ms-excel", "", "not a mime"} {
		_, ok := service.ExportDriveInlineType(risky)
		assert.False(t, ok, risky)
	}
}

func TestDriveDownloadParams(t *testing.T) {
	html := "text/html"
	item := &domain.DriveItem{Name: "page.html", MimeType: &html}
	params, inline := service.ExportDriveDownloadParams(item, true)
	assert.False(t, inline, "html is never inline")
	assert.Equal(t, "text/html", params.Get("response-content-type"))
	assert.True(t, strings.HasPrefix(params.Get("response-content-disposition"), "attachment;"))

	pdf := "application/pdf"
	item = &domain.DriveItem{Name: "a.pdf", MimeType: &pdf}
	params, inline = service.ExportDriveDownloadParams(item, true)
	assert.True(t, inline)
	assert.True(t, strings.HasPrefix(params.Get("response-content-disposition"), "inline;"))
	_, inline = service.ExportDriveDownloadParams(item, false)
	assert.False(t, inline)
}

func TestContentDisposition(t *testing.T) {
	assert.Equal(t, `attachment; filename="a.pdf"; filename*=UTF-8''a.pdf`,
		service.ExportContentDisposition("attachment", "a.pdf"))
	assert.Equal(t, `inline; filename="Q3 plan.pdf"; filename*=UTF-8''Q3%20plan.pdf`,
		service.ExportContentDisposition("inline", "Q3 plan.pdf"))
	assert.Equal(t, `attachment; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`,
		service.ExportContentDisposition("attachment", "résumé.pdf"))

	// Quotes, CR/LF and ';' must not break out of the header value.
	got := service.ExportContentDisposition("attachment", "a\"b\r\nX-Evil: 1;.txt")
	assert.NotContains(t, got, "\r")
	assert.NotContains(t, got, "\n")
	assert.Equal(t, `attachment; filename="a_b__X-Evil: 1;.txt"; filename*=UTF-8''a%22b%0D%0AX-Evil%3A%201%3B.txt`, got)
}

// --- Tree ---

func TestValidateDriveMove(t *testing.T) {
	team := uuid.New()
	root := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFolder, Scope: domain.DriveScopeTeam, ScopeID: team}
	child := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFolder, Scope: domain.DriveScopeTeam, ScopeID: team,
		AncestorIDs: []uuid.UUID{root.ID}}
	grandchild := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFolder, Scope: domain.DriveScopeTeam, ScopeID: team,
		AncestorIDs: []uuid.UUID{root.ID, child.ID}}
	other := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFolder, Scope: domain.DriveScopeTeam, ScopeID: team}

	assert.NoError(t, service.ExportValidateDriveMove(child, nil), "to root")
	assert.NoError(t, service.ExportValidateDriveMove(child, other))
	assert.NoError(t, service.ExportValidateDriveMove(grandchild, root), "up the tree")

	assert.Error(t, service.ExportValidateDriveMove(root, root), "into itself")
	assert.Error(t, service.ExportValidateDriveMove(root, child), "into child")
	assert.Error(t, service.ExportValidateDriveMove(root, grandchild), "into grandchild")
	assert.Error(t, service.ExportValidateDriveMove(child, grandchild))

	file := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFile, Scope: domain.DriveScopeTeam, ScopeID: team}
	assert.Error(t, service.ExportValidateDriveMove(child, file), "target is a file")

	now := time.Now()
	trashed := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFolder, Scope: domain.DriveScopeTeam, ScopeID: team, TrashedAt: &now}
	assert.Error(t, service.ExportValidateDriveMove(child, trashed), "trashed target")

	elsewhere := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFolder, Scope: domain.DriveScopeTeam, ScopeID: uuid.New()}
	assert.Error(t, service.ExportValidateDriveMove(child, elsewhere), "other space")
	otherScope := &domain.DriveItem{ID: uuid.New(), Kind: domain.DriveKindFolder, Scope: domain.DriveScopeProject, ScopeID: team}
	assert.Error(t, service.ExportValidateDriveMove(child, otherScope), "same id, other scope type")

	err := service.ExportValidateDriveMove(root, child)
	assert.Equal(t, http.StatusUnprocessableEntity, driveCode(t, err))
}

func TestDriveChildAncestors(t *testing.T) {
	assert.Equal(t, []uuid.UUID{}, service.ExportDriveChildAncestors(nil))
	a, b := uuid.New(), uuid.New()
	parent := &domain.DriveItem{ID: b, AncestorIDs: []uuid.UUID{a}}
	got := service.ExportDriveChildAncestors(parent)
	assert.Equal(t, []uuid.UUID{a, b}, got)
	got[0] = uuid.Nil
	assert.Equal(t, a, parent.AncestorIDs[0], "parent path not aliased")
}

func TestVisibleDriveAncestors(t *testing.T) {
	a, b, c := uuid.New(), uuid.New(), uuid.New()
	path := []uuid.UUID{a, b, c}
	assert.Equal(t, []uuid.UUID{b, c}, service.ExportVisibleDriveAncestors(path, map[uuid.UUID]bool{b: true}))
	assert.Equal(t, []uuid.UUID{b, c}, service.ExportVisibleDriveAncestors(path, map[uuid.UUID]bool{c: true, b: true}))
	assert.Equal(t, path, service.ExportVisibleDriveAncestors(path, map[uuid.UUID]bool{a: true}))
	assert.Empty(t, service.ExportVisibleDriveAncestors(path, nil), "share is on the item itself")
}

func TestCapDriveAudience(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	assert.Equal(t, []uuid.UUID{a, b}, service.ExportCapDriveAudience([]uuid.UUID{a}, []uuid.UUID{b, a}))
	assert.Nil(t, service.ExportCapDriveAudience(nil, nil))

	big := make([]uuid.UUID, service.ExportMaxDriveAudience+1)
	for i := range big {
		big[i] = uuid.New()
	}
	assert.Nil(t, service.ExportCapDriveAudience(big), "over the cap delivers to nobody")
	assert.Len(t, service.ExportCapDriveAudience(big[:service.ExportMaxDriveAudience]), service.ExportMaxDriveAudience)
}
