package service

import (
	"fmt"
	"mime"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
)

const (
	maxDriveNameLen  = 255
	maxDriveDepth    = 20    // max ancestors of any item (§9.3)
	maxDriveSubtree  = 10000 // folders larger than this cannot be moved in Phase 1 (§13)
	maxDriveAudience = 500   // WS fan-out cap (§8)
)

// validateDriveName trims and checks a user-supplied item name.
func validateDriveName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	switch {
	case name == "":
		return "", domain.ErrDriveInvalid.WithDetail("name is required")
	case !utf8.ValidString(name):
		return "", domain.ErrDriveInvalid.WithDetail("name must be valid UTF-8")
	case utf8.RuneCountInString(name) > maxDriveNameLen:
		return "", domain.ErrDriveInvalid.WithDetail("name must be at most 255 characters")
	case strings.ContainsAny(name, `/\`):
		return "", domain.ErrDriveInvalid.WithDetail(`name cannot contain "/" or "\"`)
	case strings.Trim(name, ".") == "":
		return "", domain.ErrDriveInvalid.WithDetail("name cannot consist only of dots")
	case strings.IndexFunc(name, unicode.IsControl) >= 0:
		return "", domain.ErrDriveInvalid.WithDetail("name cannot contain control characters")
	}
	return name, nil
}

var driveNumberSuffix = regexp.MustCompile(` \(\d+\)$`)

// splitDriveName splits off the extension. Dotfiles (".env") and a trailing
// dot have none, so their counter goes at the very end.
func splitDriveName(name string) (stem, ext string) {
	i := strings.LastIndex(name, ".")
	if i <= 0 || i == len(name)-1 {
		return name, ""
	}
	return name[:i], name[i:]
}

// driveNameBase is the stem without any " (n)" counter; the auto-rename
// candidates all start with it, so it doubles as the DB lookup prefix.
func driveNameBase(name string) string {
	stem, _ := splitDriveName(name)
	return driveNumberSuffix.ReplaceAllString(stem, "")
}

// uniqueDriveName returns name if free, else "base (n)ext" for the smallest
// free n. taken holds lower-cased live names in the destination folder.
func uniqueDriveName(name string, taken []string) string {
	used := make(map[string]bool, len(taken))
	for _, t := range taken {
		used[strings.ToLower(t)] = true
	}
	if !used[strings.ToLower(name)] {
		return name
	}
	_, ext := splitDriveName(name)
	base := []rune(driveNameBase(name))
	for n := 1; ; n++ {
		suffix := fmt.Sprintf(" (%d)%s", n, ext)
		b := base
		if over := len(b) + utf8.RuneCountInString(suffix) - maxDriveNameLen; over > 0 {
			b = b[:max(len(b)-over, 1)]
		}
		cand := string(b) + suffix
		if !used[strings.ToLower(cand)] {
			return cand
		}
	}
}

// driveChildAncestors is the ancestor path for a new child of parent (nil = space root).
func driveChildAncestors(parent *domain.DriveItem) []uuid.UUID {
	if parent == nil {
		return []uuid.UUID{}
	}
	return append(slices.Clone(parent.AncestorIDs), parent.ID)
}

// validateDriveMove enforces §9.1.5: the target is a live folder in the same
// space and is neither the item nor one of its descendants. nil target = root.
func validateDriveMove(item, target *domain.DriveItem) error {
	if target == nil {
		return nil
	}
	switch {
	case target.Kind != domain.DriveKindFolder:
		return domain.ErrDriveInvalid.WithDetail("target is not a folder")
	case target.TrashedAt != nil:
		return domain.ErrDriveInvalid.WithDetail("target folder is in the trash")
	case target.Scope != item.Scope || target.ScopeID != item.ScopeID:
		return domain.ErrDriveInvalid.WithDetail("items can only be moved within their space")
	case target.ID == item.ID || slices.Contains(target.AncestorIDs, item.ID):
		return domain.ErrDriveInvalid.WithDetail("cannot move a folder into itself")
	}
	return nil
}

// visibleDriveAncestors cuts a root→parent path so it starts at the highest
// ancestor the user reaches through a share (shares apply downward).
func visibleDriveAncestors(ancestors []uuid.UUID, shared map[uuid.UUID]bool) []uuid.UUID {
	for i, id := range ancestors {
		if shared[id] {
			return ancestors[i:]
		}
	}
	return nil
}

// capDriveAudience merges and dedupes user lists. nil (= deliver to nobody)
// when empty or above the cap, so huge spaces never fan out per user.
func capDriveAudience(lists ...[]uuid.UUID) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	var out []uuid.UUID
	for _, l := range lists {
		for _, id := range l {
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
	}
	if len(out) > maxDriveAudience {
		return nil
	}
	return out
}

// driveInlineMedia may render inline under their own content type (§9.2).
var driveInlineMedia = map[string]bool{
	"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true,
	"application/pdf": true,
	"video/mp4":       true, "video/webm": true,
	"text/plain": true, "text/markdown": true, "text/csv": true,
}

// driveCodeTypes render inline, but only as text/plain: XML, JS and friends
// must never be interpreted by the browser.
var driveCodeTypes = map[string]bool{
	"application/json": true, "application/xml": true, "text/xml": true,
	"application/javascript": true, "text/javascript": true, "application/x-javascript": true,
	"text/css": true, "application/yaml": true, "application/x-yaml": true, "text/yaml": true,
	"application/toml": true, "application/sql": true, "application/x-sh": true,
	"text/tab-separated-values": true,
}

// driveInlineType returns the content type to serve inline, or false when the
// type must be downloaded as an attachment.
func driveInlineType(mimeType string) (string, bool) {
	mt, _, err := mime.ParseMediaType(mimeType)
	if err != nil {
		return "", false
	}
	switch {
	case driveInlineMedia[mt] || strings.HasPrefix(mt, "audio/"):
		return mimeType, true
	case driveCodeTypes[mt] || strings.HasPrefix(mt, "text/x-"):
		return "text/plain; charset=utf-8", true
	}
	return "", false
}

// driveDownloadParams builds the presigned-URL response overrides.
func driveDownloadParams(item *domain.DriveItem, wantInline bool) (url.Values, bool) {
	contentType := "application/octet-stream"
	if item.MimeType != nil {
		contentType = *item.MimeType
	}
	disposition := "attachment"
	inline := false
	if wantInline {
		if t, ok := driveInlineType(contentType); ok {
			contentType, disposition, inline = t, "inline", true
		}
	}
	params := url.Values{}
	params.Set("response-content-type", contentType)
	params.Set("response-content-disposition", contentDisposition(disposition, item.Name))
	return params, inline
}

// contentDisposition renders an RFC 6266 header with an ASCII fallback and an
// RFC 5987 filename* so any UTF-8 name survives without header injection.
func contentDisposition(disposition, filename string) string {
	var fallback, encoded strings.Builder
	for _, r := range filename {
		if r < 0x20 || r > 0x7e || r == '"' || r == '\\' {
			fallback.WriteByte('_')
		} else {
			fallback.WriteRune(r)
		}
	}
	for _, b := range []byte(filename) {
		if isRFC5987AttrChar(b) {
			encoded.WriteByte(b)
		} else {
			fmt.Fprintf(&encoded, "%%%02X", b)
		}
	}
	return fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, disposition, fallback.String(), encoded.String())
}

func isRFC5987AttrChar(b byte) bool {
	switch {
	case b >= 'a' && b <= 'z', b >= 'A' && b <= 'Z', b >= '0' && b <= '9':
		return true
	}
	return strings.IndexByte("!#$&+-.^_`|~", b) >= 0
}
