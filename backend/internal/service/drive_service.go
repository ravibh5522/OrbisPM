package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/storage"
	"github.com/orbispm/orbispm/internal/worker"
)

const (
	driveURLTTL       = 5 * time.Minute
	driveNameAttempts = 3 // retries when a concurrent insert takes the chosen name
	driveTrashListMax = 500
)

// DriveService implements Orbis Drive (folders, files, trash, shares).
type DriveService struct {
	repo              repository.DriveRepository
	access            *DriveAccess
	orgMemberRepo     repository.OrgMemberRepository
	projectMemberRepo repository.ProjectMemberRepository
	storage           *storage.Client
	txm               *repository.TxManager
	workerSrv         *worker.Server
	publisher         EventPublisher
	maxFileBytes      int64
}

// NewDriveService creates a DriveService. storageClient must be the private Drive bucket.
func NewDriveService(
	repo repository.DriveRepository,
	access *DriveAccess,
	orgMemberRepo repository.OrgMemberRepository,
	projectMemberRepo repository.ProjectMemberRepository,
	storageClient *storage.Client,
	txm *repository.TxManager,
	workerSrv *worker.Server,
	publisher EventPublisher,
	maxFileBytes int64,
) *DriveService {
	return &DriveService{
		repo:              repo,
		access:            access,
		orgMemberRepo:     orgMemberRepo,
		projectMemberRepo: projectMemberRepo,
		storage:           storageClient,
		txm:               txm,
		workerSrv:         workerSrv,
		publisher:         publisher,
		maxFileBytes:      maxFileBytes,
	}
}

// MaxFileBytes is the per-file upload limit.
func (s *DriveService) MaxFileBytes() int64 { return s.maxFileBytes }

// ─── Spaces ───────────────────────────────────

// Spaces lists the spaces the caller can open: My files, Organization, then
// teams and projects by name. Owners/admins get every team and project.
func (s *DriveService) Spaces(ctx context.Context, orgID, userID uuid.UUID) ([]domain.DriveSpace, error) {
	spaces := []domain.DriveSpace{{Scope: domain.DriveScopeUser, ScopeID: userID, Name: "My files", MyRole: domain.DriveRoleManager}}

	orgRole, err := s.access.SpaceRole(ctx, userID, orgID, domain.DriveScopeOrg, orgID)
	if err != nil {
		return nil, err
	}
	if orgRole != domain.DriveRoleNone {
		spaces = append(spaces, domain.DriveSpace{Scope: domain.DriveScopeOrg, ScopeID: orgID, Name: "Organization", MyRole: orgRole})
	}

	member, err := s.orgMemberRepo.Get(ctx, orgID, userID)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	all := member.Role == domain.RoleOrgOwner || member.Role == domain.RoleOrgAdmin
	candidates, err := s.repo.ListSpaceCandidates(ctx, orgID, userID, all)
	if err != nil {
		return nil, err
	}
	for _, sp := range candidates {
		role, err := s.access.SpaceRole(ctx, userID, orgID, sp.Scope, sp.ScopeID)
		if err != nil {
			return nil, err
		}
		if role != domain.DriveRoleNone {
			sp.MyRole = role
			spaces = append(spaces, sp)
		}
	}
	return spaces, nil
}

// accessFilter turns the caller's readable spaces into a SQL filter.
func (s *DriveService) accessFilter(ctx context.Context, orgID, userID uuid.UUID) (repository.DriveAccessFilter, error) {
	spaces, err := s.Spaces(ctx, orgID, userID)
	if err != nil {
		return repository.DriveAccessFilter{}, err
	}
	f := repository.DriveAccessFilter{UserID: userID, TeamIDs: []uuid.UUID{}, ProjectIDs: []uuid.UUID{}}
	for _, sp := range spaces {
		switch sp.Scope {
		case domain.DriveScopeOrg:
			f.OrgReadable = true
		case domain.DriveScopeTeam:
			f.TeamIDs = append(f.TeamIDs, sp.ScopeID)
		case domain.DriveScopeProject:
			f.ProjectIDs = append(f.ProjectIDs, sp.ScopeID)
		}
	}
	return f, nil
}

// spaceName labels a space for the caller.
func (s *DriveService) spaceName(ctx context.Context, orgID, userID uuid.UUID, scope domain.DriveScope, scopeID uuid.UUID) (string, error) {
	if scope == domain.DriveScopeUser && scopeID == userID {
		return "My files", nil
	}
	return s.repo.SpaceName(ctx, orgID, scope, scopeID)
}

// ─── Browse ───────────────────────────────────

// DriveListing is one page of a folder.
type DriveListing struct {
	Items       []*domain.DriveItem
	NextOffset  *int
	MyRole      domain.DriveRole
	Breadcrumbs []domain.DriveBreadcrumb
}

// List returns a page of a folder (or space root) with folders first.
func (s *DriveService) List(ctx context.Context, orgID, userID uuid.UUID, scope domain.DriveScope, scopeID uuid.UUID, parentID *uuid.UUID, limit, offset int) (*DriveListing, error) {
	parent, role, err := s.resolveParent(ctx, orgID, userID, scope, scopeID, parentID)
	if err != nil {
		return nil, err
	}
	if role == domain.DriveRoleNone {
		return nil, domain.ErrNotFound
	}

	items, err := s.repo.ListChildren(ctx, orgID, scope, scopeID, parentID, limit+1, offset)
	if err != nil {
		return nil, err
	}
	out := &DriveListing{MyRole: role, Breadcrumbs: []domain.DriveBreadcrumb{}}
	if len(items) > limit {
		items = items[:limit]
		next := offset + limit
		out.NextOffset = &next
	}
	if err := s.fillRoles(ctx, orgID, userID, items); err != nil {
		return nil, err
	}
	out.Items = items

	if parent != nil {
		crumbs, err := s.breadcrumbs(ctx, orgID, userID, parent)
		if err != nil {
			return nil, err
		}
		out.Breadcrumbs = append(crumbs, domain.DriveBreadcrumb{ID: parent.ID, Name: parent.Name})
	}
	return out, nil
}

// Get returns an item with its breadcrumbs and space.
func (s *DriveService) Get(ctx context.Context, orgID, userID, id uuid.UUID) (*domain.DriveItem, []domain.DriveBreadcrumb, *domain.DriveSpace, error) {
	item, err := s.repo.GetItem(ctx, orgID, id)
	if err != nil {
		return nil, nil, nil, err
	}
	if item.MyRole, err = s.access.Require(ctx, userID, orgID, item, domain.DriveRoleViewer); err != nil {
		return nil, nil, nil, err
	}
	crumbs, err := s.breadcrumbs(ctx, orgID, userID, item)
	if err != nil {
		return nil, nil, nil, err
	}
	name, err := s.spaceName(ctx, orgID, userID, item.Scope, item.ScopeID)
	if errors.Is(err, domain.ErrNotFound) {
		name, err = "Personal files", nil // owner left the org; the item itself is still shared
	}
	if err != nil {
		return nil, nil, nil, err
	}
	return item, crumbs, &domain.DriveSpace{Scope: item.Scope, ScopeID: item.ScopeID, Name: name}, nil
}

// breadcrumbs returns item's ancestors (root → parent), cut to what the
// caller can see so names of unshared parent folders never leak.
func (s *DriveService) breadcrumbs(ctx context.Context, orgID, userID uuid.UUID, item *domain.DriveItem) ([]domain.DriveBreadcrumb, error) {
	crumbs := []domain.DriveBreadcrumb{}
	if len(item.AncestorIDs) == 0 {
		return crumbs, nil
	}
	visible := item.AncestorIDs
	spaceRole, err := s.access.SpaceRole(ctx, userID, orgID, item.Scope, item.ScopeID)
	if err != nil {
		return nil, err
	}
	if spaceRole == domain.DriveRoleNone {
		shared, err := s.repo.SharedItemIDs(ctx, orgID, userID, item.AncestorIDs)
		if err != nil {
			return nil, err
		}
		visible = visibleDriveAncestors(item.AncestorIDs, shared)
	}
	if len(visible) == 0 {
		return crumbs, nil
	}
	names, err := s.repo.ItemNames(ctx, orgID, visible)
	if err != nil {
		return nil, err
	}
	for _, id := range visible {
		crumbs = append(crumbs, domain.DriveBreadcrumb{ID: id, Name: names[id]})
	}
	return crumbs, nil
}

// fillRoles sets MyRole on each item in one batch.
func (s *DriveService) fillRoles(ctx context.Context, orgID, userID uuid.UUID, items []*domain.DriveItem) error {
	roles, err := s.access.Roles(ctx, userID, orgID, items)
	if err != nil {
		return err
	}
	for _, it := range items {
		it.MyRole = roles[it.ID]
	}
	return nil
}

// visibleOnly fills roles and drops anything the caller cannot see.
func (s *DriveService) visibleOnly(ctx context.Context, orgID, userID uuid.UUID, items []*domain.DriveItem) ([]*domain.DriveItem, error) {
	if err := s.fillRoles(ctx, orgID, userID, items); err != nil {
		return nil, err
	}
	out := items[:0]
	for _, it := range items {
		if it.MyRole != domain.DriveRoleNone {
			out = append(out, it)
		}
	}
	return out, nil
}

// SharedWithMe lists items shared to the caller outside their own space.
func (s *DriveService) SharedWithMe(ctx context.Context, orgID, userID uuid.UUID, limit, offset int) ([]*domain.DriveItem, *int, error) {
	items, err := s.repo.ListSharedWithMe(ctx, orgID, userID, limit+1, offset)
	if err != nil {
		return nil, nil, err
	}
	var next *int
	if len(items) > limit {
		items = items[:limit]
		n := offset + limit
		next = &n
	}
	items, err = s.visibleOnly(ctx, orgID, userID, items)
	return items, next, err
}

// Recent lists the caller's recently changed files.
func (s *DriveService) Recent(ctx context.Context, orgID, userID uuid.UUID, limit int) ([]*domain.DriveItem, error) {
	f, err := s.accessFilter(ctx, orgID, userID)
	if err != nil {
		return nil, err
	}
	items, err := s.repo.ListRecent(ctx, orgID, f, limit)
	if err != nil {
		return nil, err
	}
	return s.visibleOnly(ctx, orgID, userID, items)
}

// Search matches names (case-insensitive substring) among items the caller can see.
func (s *DriveService) Search(ctx context.Context, orgID, userID uuid.UUID, query string, scope *domain.DriveScope, scopeID *uuid.UUID) ([]*domain.DriveItem, error) {
	f, err := s.accessFilter(ctx, orgID, userID)
	if err != nil {
		return nil, err
	}
	items, err := s.repo.Search(ctx, orgID, f, query, scope, scopeID, 50)
	if err != nil {
		return nil, err
	}
	return s.visibleOnly(ctx, orgID, userID, items)
}

// Trash lists top-level trashed items the caller may restore.
func (s *DriveService) Trash(ctx context.Context, orgID, userID uuid.UUID) ([]*domain.DriveItem, error) {
	f, err := s.accessFilter(ctx, orgID, userID)
	if err != nil {
		return nil, err
	}
	items, err := s.repo.ListTrash(ctx, orgID, f, driveTrashListMax)
	if err != nil {
		return nil, err
	}
	if err := s.fillRoles(ctx, orgID, userID, items); err != nil {
		return nil, err
	}
	out := items[:0]
	for _, it := range items {
		if canTrashDrive(it.MyRole, it.CreatedBy == userID) {
			out = append(out, it)
		}
	}
	return out, nil
}

// Usage returns org bytes used and the plan limit (-1 = unlimited).
func (s *DriveService) Usage(ctx context.Context, orgID, userID uuid.UUID) (int64, int64, error) {
	role, err := s.access.SpaceRole(ctx, userID, orgID, domain.DriveScopeOrg, orgID)
	if err != nil {
		return 0, 0, err
	}
	if role == domain.DriveRoleNone {
		return 0, 0, domain.ErrForbidden
	}
	return s.repo.Usage(ctx, orgID)
}

// ─── Create ───────────────────────────────────

// resolveParent validates the space and parent folder and returns the
// caller's role there. A space the caller may not name is 404.
func (s *DriveService) resolveParent(ctx context.Context, orgID, userID uuid.UUID, scope domain.DriveScope, scopeID uuid.UUID, parentID *uuid.UUID) (*domain.DriveItem, domain.DriveRole, error) {
	switch scope {
	case domain.DriveScopeUser:
		if scopeID != userID {
			return nil, domain.DriveRoleNone, domain.ErrNotFound
		}
	default:
		if _, err := s.repo.SpaceName(ctx, orgID, scope, scopeID); err != nil {
			return nil, domain.DriveRoleNone, err
		}
	}
	if parentID == nil {
		role, err := s.access.SpaceRole(ctx, userID, orgID, scope, scopeID)
		return nil, role, err
	}
	parent, err := s.repo.GetItem(ctx, orgID, *parentID)
	if err != nil {
		return nil, domain.DriveRoleNone, err
	}
	role, err := s.access.Role(ctx, userID, orgID, parent)
	if err != nil {
		return nil, domain.DriveRoleNone, err
	}
	if role == domain.DriveRoleNone || parent.TrashedAt != nil {
		return nil, domain.DriveRoleNone, domain.ErrNotFound
	}
	if parent.Kind != domain.DriveKindFolder || parent.Scope != scope || parent.ScopeID != scopeID {
		return nil, domain.DriveRoleNone, domain.ErrDriveInvalid.WithDetail("parent is not a folder in this space")
	}
	return parent, role, nil
}

// NewItemParams identifies where a new folder or file goes.
type NewItemParams struct {
	OrgID    uuid.UUID
	UserID   uuid.UUID
	Scope    domain.DriveScope
	ScopeID  uuid.UUID
	ParentID *uuid.UUID
	Name     string
}

// prepareNew validates name and destination and returns a skeleton item.
func (s *DriveService) prepareNew(ctx context.Context, p NewItemParams, kind string) (*domain.DriveItem, error) {
	name, err := validateDriveName(p.Name)
	if err != nil {
		return nil, err
	}
	parent, role, err := s.resolveParent(ctx, p.OrgID, p.UserID, p.Scope, p.ScopeID, p.ParentID)
	if err != nil {
		return nil, err
	}
	if err := checkDriveRole(role, domain.DriveRoleEditor); err != nil {
		return nil, err
	}
	ancestors := driveChildAncestors(parent)
	if len(ancestors) > maxDriveDepth {
		return nil, domain.ErrDriveInvalid.WithDetail("folders are nested too deeply")
	}
	return &domain.DriveItem{
		ID:          uuid.New(),
		OrgID:       p.OrgID,
		Scope:       p.Scope,
		ScopeID:     p.ScopeID,
		ParentID:    p.ParentID,
		AncestorIDs: ancestors,
		Kind:        kind,
		Name:        name,
		CreatedBy:   p.UserID,
	}, nil
}

// insertUnique inserts item, auto-renaming on a name clash ("a (1).pdf").
// Files also reserve quota in the same tx.
func (s *DriveService) insertUnique(ctx context.Context, item *domain.DriveItem) error {
	want := item.Name
	var err error
	for attempt := 0; attempt < driveNameAttempts; attempt++ {
		err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
			taken, err := s.repo.LiveNamesWithPrefix(ctx, tx, item.OrgID, item.Scope, item.ScopeID, item.ParentID, driveNameBase(want))
			if err != nil {
				return err
			}
			item.Name = uniqueDriveName(want, taken)
			if item.Kind == domain.DriveKindFile {
				if err := s.repo.ReserveQuota(ctx, tx, item.OrgID, *item.SizeBytes); err != nil {
					return err
				}
			}
			return s.repo.CreateItem(ctx, tx, item)
		})
		if !errors.Is(err, domain.ErrConflict) {
			return err
		}
	}
	return err
}

// CreateFolder creates a folder; needs editor on the parent or space.
func (s *DriveService) CreateFolder(ctx context.Context, p NewItemParams) (*domain.DriveItem, error) {
	item, err := s.prepareNew(ctx, p, domain.DriveKindFolder)
	if err != nil {
		return nil, err
	}
	if err := s.insertUnique(ctx, item); err != nil {
		return nil, err
	}
	return s.afterCreate(ctx, item)
}

// UploadParams describes one streamed file.
type UploadParams struct {
	NewItemParams
	DeclaredType string
	DeclaredSize int64 // -1 when the client sent no part Content-Length
}

// errDriveTooLarge marks the reader limit being hit mid-stream.
var errDriveTooLarge = errors.New("drive file exceeds size limit")

// limitedCounter counts bytes and fails once more than max were read.
type limitedCounter struct {
	r   io.Reader
	n   int64
	max int64
}

func (c *limitedCounter) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	if c.n > c.max {
		return n, errDriveTooLarge
	}
	return n, err
}

// Upload streams body to the private bucket while hashing and sniffing it,
// then records the item and its usage in one tx.
func (s *DriveService) Upload(ctx context.Context, p UploadParams, body io.Reader) (*domain.DriveItem, error) {
	item, err := s.prepareNew(ctx, p.NewItemParams, domain.DriveKindFile)
	if err != nil {
		return nil, err
	}
	if p.DeclaredSize > s.maxFileBytes {
		return nil, domain.ErrDriveFileTooLarge
	}
	// Cheap pre-check; the authoritative check runs under FOR UPDATE in the insert tx.
	used, limit, err := s.repo.Usage(ctx, p.OrgID)
	if err != nil {
		return nil, err
	}
	if limit >= 0 && used+max(p.DeclaredSize, 0) > limit {
		return nil, domain.ErrPlanLimitHit.WithDetail("storage quota exceeded")
	}

	counter := &limitedCounter{r: body, max: s.maxFileBytes}
	head := make([]byte, 512)
	n, err := io.ReadFull(counter, head)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return nil, driveStreamErr(err)
	}
	head = head[:n]
	mimeType := p.DeclaredType
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(head)
	}

	hasher := sha256.New()
	stream := io.TeeReader(io.MultiReader(bytes.NewReader(head), counter), hasher)
	key := fmt.Sprintf("orgs/%s/drive/%s", p.OrgID, item.ID)
	src := io.Reader(stream)
	if p.DeclaredSize >= 0 {
		// Storage trusts a known size; never hand it more than that.
		src = io.LimitReader(stream, p.DeclaredSize)
	}
	_, err = s.storage.Upload(ctx, key, src, p.DeclaredSize, mimeType)
	if p.DeclaredSize >= 0 {
		if sizeErr := checkDeclaredSize(stream, counter, p.DeclaredSize, err != nil); sizeErr != nil {
			err = sizeErr
		}
	}
	if err != nil {
		s.deleteObject(key)
		return nil, driveStreamErr(err)
	}

	size, sum := counter.n, hexSum(hasher)
	item.MimeType, item.SizeBytes, item.StorageKey, item.SHA256 = &mimeType, &size, &key, &sum
	if err := s.insertUnique(ctx, item); err != nil {
		s.deleteObject(key)
		return nil, err
	}
	return s.afterCreate(ctx, item)
}

// checkDeclaredSize detects a part Content-Length that lied. Storage reads at
// most the declared size, so a longer body leaves bytes behind, and a shorter
// one makes storage fail after the body is fully consumed.
func checkDeclaredSize(stream io.Reader, counter *limitedCounter, declared int64, uploadFailed bool) error {
	n, err := io.ReadFull(stream, make([]byte, 1))
	if errors.Is(err, errDriveTooLarge) {
		return domain.ErrDriveFileTooLarge
	}
	long := !uploadFailed && n > 0
	short := uploadFailed && n == 0 && counter.n < declared
	if long || short {
		return domain.ErrBadRequest.WithDetail("file size does not match Content-Length")
	}
	return nil
}

func driveStreamErr(err error) error {
	var maxErr *http.MaxBytesError
	if errors.Is(err, errDriveTooLarge) || errors.As(err, &maxErr) {
		return domain.ErrDriveFileTooLarge
	}
	return fmt.Errorf("store drive file: %w", err)
}

func hexSum(h hash.Hash) string { return hex.EncodeToString(h.Sum(nil)) }

// deleteObject is best-effort cleanup (same as attachments); orphans are
// harmless to users and cheap to find by key prefix.
func (s *DriveService) deleteObject(key string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := s.storage.Delete(ctx, key); err != nil {
		log.Warn().Err(err).Str("key", key).Msg("drive: failed to delete object after aborted upload")
	}
}

func (s *DriveService) afterCreate(ctx context.Context, item *domain.DriveItem) (*domain.DriveItem, error) {
	created, err := s.repo.GetItem(ctx, item.OrgID, item.ID)
	if err != nil {
		return nil, err
	}
	if created.MyRole, err = s.access.Role(ctx, item.CreatedBy, item.OrgID, created); err != nil {
		return nil, err
	}
	s.enqueueActivity(created, "created", item.CreatedBy, map[string]any{"name": created.Name, "kind": created.Kind})
	s.publishItem(ctx, domain.EventDriveItemCreated, item.CreatedBy, created)
	return created, nil
}

// ─── Modify ───────────────────────────────────

// liveItem loads a non-trashed item the caller can see with at least min.
func (s *DriveService) liveItem(ctx context.Context, orgID, userID, id uuid.UUID, min domain.DriveRole) (*domain.DriveItem, error) {
	item, err := s.repo.GetItem(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	if item.TrashedAt != nil {
		return nil, domain.ErrNotFound
	}
	if item.MyRole, err = s.access.Require(ctx, userID, orgID, item, min); err != nil {
		return nil, err
	}
	return item, nil
}

// reload re-reads an item after a write and keeps the caller's role.
func (s *DriveService) reload(ctx context.Context, item *domain.DriveItem) (*domain.DriveItem, error) {
	fresh, err := s.repo.GetItem(ctx, item.OrgID, item.ID)
	if err != nil {
		return nil, err
	}
	fresh.MyRole = item.MyRole
	return fresh, nil
}

// Rename changes an item's name; an existing name in the folder is 409.
func (s *DriveService) Rename(ctx context.Context, orgID, userID, id uuid.UUID, rawName string) (*domain.DriveItem, error) {
	name, err := validateDriveName(rawName)
	if err != nil {
		return nil, err
	}
	item, err := s.liveItem(ctx, orgID, userID, id, domain.DriveRoleEditor)
	if err != nil {
		return nil, err
	}
	if name == item.Name {
		return item, nil
	}
	if err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.RenameItem(ctx, tx, orgID, id, name)
	}); err != nil {
		return nil, err
	}
	updated, err := s.reload(ctx, item)
	if err != nil {
		return nil, err
	}
	s.enqueueActivity(updated, "renamed", userID, map[string]any{"from": item.Name, "to": name})
	s.publishItem(ctx, domain.EventDriveItemUpdated, userID, updated)
	return updated, nil
}

// Move re-parents an item within its space (nil = space root).
func (s *DriveService) Move(ctx context.Context, orgID, userID, id uuid.UUID, parentID *uuid.UUID) (*domain.DriveItem, error) {
	item, err := s.liveItem(ctx, orgID, userID, id, domain.DriveRoleEditor)
	if err != nil {
		return nil, err
	}
	var target *domain.DriveItem
	if parentID == nil {
		role, err := s.access.SpaceRole(ctx, userID, orgID, item.Scope, item.ScopeID)
		if err != nil {
			return nil, err
		}
		if err := checkDriveRole(role, domain.DriveRoleEditor); err != nil {
			return nil, err
		}
	} else {
		if target, err = s.repo.GetItem(ctx, orgID, *parentID); err != nil {
			return nil, err
		}
		if _, err := s.access.Require(ctx, userID, orgID, target, domain.DriveRoleEditor); err != nil {
			return nil, err
		}
	}
	if err := validateDriveMove(item, target); err != nil {
		return nil, err
	}
	if (item.ParentID == nil && parentID == nil) || (item.ParentID != nil && parentID != nil && *item.ParentID == *parentID) {
		return item, nil
	}

	ancestors := driveChildAncestors(target)
	count, maxDepth, err := s.repo.SubtreeStats(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	if count > maxDriveSubtree {
		return nil, domain.ErrDriveInvalid.WithDetail("folder is too large to move")
	}
	deepest := len(ancestors)
	if count > 0 {
		deepest = maxDepth - len(item.AncestorIDs) + len(ancestors)
	}
	if deepest > maxDriveDepth {
		return nil, domain.ErrDriveInvalid.WithDetail("folders would be nested too deeply")
	}

	if err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.MoveItem(ctx, tx, item, parentID, ancestors)
	}); err != nil {
		return nil, err
	}
	moved, err := s.reload(ctx, item)
	if err != nil {
		return nil, err
	}
	s.enqueueActivity(moved, "moved", userID, map[string]any{"from_parent_id": item.ParentID, "to_parent_id": parentID})
	// Both the old and the new location's viewers need to refresh.
	s.publishItem(ctx, domain.EventDriveItemUpdated, userID, moved, item.AncestorIDs...)
	return moved, nil
}

// TrashItem moves an item and its subtree to the trash.
func (s *DriveService) TrashItem(ctx context.Context, orgID, userID, id uuid.UUID) error {
	item, err := s.liveItem(ctx, orgID, userID, id, domain.DriveRoleViewer)
	if err != nil {
		return err
	}
	if !canTrashDrive(item.MyRole, item.CreatedBy == userID) {
		return domain.ErrForbidden
	}
	// Computed before trashing: shares stay, but the item must still be resolvable.
	audience := s.itemAudience(ctx, item)
	if err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.TrashSubtree(ctx, tx, orgID, id, userID)
	}); err != nil {
		return err
	}
	s.enqueueActivity(item, "trashed", userID, map[string]any{"name": item.Name})
	s.publish(ctx, domain.EventDriveItemTrashed, userID, item, audience)
	return nil
}

// Restore brings a trashed subtree back, to the space root if its parent is
// still trashed, auto-renaming on a clash.
func (s *DriveService) Restore(ctx context.Context, orgID, userID, id uuid.UUID) (*domain.DriveItem, error) {
	item, err := s.repo.GetItem(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	if item.MyRole, err = s.access.Require(ctx, userID, orgID, item, domain.DriveRoleViewer); err != nil {
		return nil, err
	}
	if !canTrashDrive(item.MyRole, item.CreatedBy == userID) {
		return nil, domain.ErrForbidden
	}
	if item.TrashedAt == nil {
		return nil, domain.ErrDriveInvalid.WithDetail("item is not in the trash")
	}

	toRoot := false
	if item.ParentID != nil {
		parent, err := s.repo.GetItem(ctx, orgID, *item.ParentID)
		if errors.Is(err, domain.ErrNotFound) || (err == nil && parent.TrashedAt != nil) {
			toRoot = true
		} else if err != nil {
			return nil, err
		}
	}
	dest := item.ParentID
	if toRoot {
		dest = nil
	}

	for attempt := 0; attempt < driveNameAttempts; attempt++ {
		err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
			if toRoot {
				if err := s.repo.MoveItem(ctx, tx, item, nil, []uuid.UUID{}); err != nil {
					return err
				}
			}
			taken, err := s.repo.LiveNamesWithPrefix(ctx, tx, orgID, item.Scope, item.ScopeID, dest, driveNameBase(item.Name))
			if err != nil {
				return err
			}
			return s.repo.RestoreSubtree(ctx, tx, orgID, id, *item.TrashedAt, uniqueDriveName(item.Name, taken))
		})
		if !errors.Is(err, domain.ErrConflict) {
			break
		}
	}
	if err != nil {
		return nil, err
	}
	restored, err := s.reload(ctx, item)
	if err != nil {
		return nil, err
	}
	s.enqueueActivity(restored, "restored", userID, map[string]any{"name": restored.Name})
	s.publishItem(ctx, domain.EventDriveItemRestored, userID, restored)
	return restored, nil
}

// DriveDownload is a short-lived presigned URL.
type DriveDownload struct {
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expires_at"`
	Inline    bool      `json:"inline"`
}

// DownloadURL presigns a GET for a file. Inline is honoured only for the
// §9.2 allowlist; everything else is forced to attachment.
func (s *DriveService) DownloadURL(ctx context.Context, orgID, userID, id uuid.UUID, wantInline bool) (*DriveDownload, error) {
	item, err := s.liveItem(ctx, orgID, userID, id, domain.DriveRoleViewer)
	if err != nil {
		return nil, err
	}
	if item.Kind != domain.DriveKindFile {
		return nil, domain.ErrDriveInvalid.WithDetail("folders cannot be downloaded")
	}
	params, inline := driveDownloadParams(item, wantInline)
	u, err := s.storage.PresignedGetURLWithParams(ctx, *item.StorageKey, driveURLTTL, params)
	if err != nil {
		return nil, fmt.Errorf("presign drive download: %w", err)
	}
	s.enqueueActivity(item, "downloaded", userID, map[string]any{"inline": inline})
	return &DriveDownload{URL: u, ExpiresAt: time.Now().Add(driveURLTTL).UTC(), Inline: inline}, nil
}

// ─── Events, activity, notifications ─────────

// itemAudience resolves who may see item's location: the space's members plus
// grantees of shares on the item or any ancestor in extra (e.g. an old path).
// The org space and oversized audiences resolve to nil: deliver to nobody.
func (s *DriveService) itemAudience(ctx context.Context, item *domain.DriveItem, extra ...uuid.UUID) []uuid.UUID {
	var base []uuid.UUID
	var err error
	switch item.Scope {
	case domain.DriveScopeOrg:
		return nil
	case domain.DriveScopeUser:
		base = []uuid.UUID{item.ScopeID}
	case domain.DriveScopeTeam:
		base, err = s.repo.TeamMemberIDs(ctx, item.OrgID, item.ScopeID, maxDriveAudience+1)
	case domain.DriveScopeProject:
		var members []*domain.EffectiveMember
		members, err = s.projectMemberRepo.ListEffectiveMembers(ctx, item.ScopeID)
		for _, m := range members {
			base = append(base, m.UserID)
		}
	}
	if err != nil {
		log.Warn().Err(err).Str("item_id", item.ID.String()).Msg("drive: resolve space audience")
		return nil
	}
	ids := append(append(slices.Clone(item.AncestorIDs), item.ID), extra...)
	grantees, err := s.repo.ItemGranteeUserIDs(ctx, item.OrgID, ids, maxDriveAudience+1)
	if err != nil {
		log.Warn().Err(err).Str("item_id", item.ID.String()).Msg("drive: resolve share audience")
		return nil
	}
	return capDriveAudience(base, grantees)
}

func (s *DriveService) publishItem(ctx context.Context, eventType string, actorID uuid.UUID, item *domain.DriveItem, extra ...uuid.UUID) {
	s.publish(ctx, eventType, actorID, item, s.itemAudience(ctx, item, extra...))
}

// publish emits an ID-only drive event; OrgHub delivers it to audience only.
func (s *DriveService) publish(ctx context.Context, eventType string, actorID uuid.UUID, item *domain.DriveItem, audience []uuid.UUID) {
	if s.publisher == nil || len(audience) == 0 {
		return
	}
	ids := make([]string, len(audience))
	for i, id := range audience {
		ids[i] = id.String()
	}
	var parent any
	if item.ParentID != nil {
		parent = item.ParentID.String()
	}
	event := domain.DomainEvent{
		Type:     eventType,
		OrgID:    item.OrgID.String(),
		ActorID:  actorID.String(),
		EntityID: item.ID.String(),
		Payload: map[string]any{
			"item_id":   item.ID.String(),
			"parent_id": parent,
			"scope":     string(item.Scope),
			"scope_id":  item.ScopeID.String(),
			"audience":  ids,
		},
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		log.Warn().Err(err).Str("type", eventType).Msg("drive: publish event")
	}
}

func (s *DriveService) enqueueActivity(item *domain.DriveItem, action string, actorID uuid.UUID, changes map[string]any) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewActivityLogTask(worker.ActivityLogPayload{
		OrgID:      item.OrgID.String(),
		EntityType: "drive_item",
		EntityID:   item.ID.String(),
		Action:     action,
		ActorID:    actorID.String(),
		Changes:    changes,
	})
	if err != nil {
		log.Error().Err(err).Msg("drive: build activity task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("drive: enqueue activity task")
	}
}

func (s *DriveService) enqueueNotification(userID uuid.UUID, item *domain.DriveItem, title string) {
	if s.workerSrv == nil {
		return
	}
	task, err := worker.NewNotificationTask(worker.NotificationPayload{
		UserID: userID.String(),
		OrgID:  item.OrgID.String(),
		Type:   "drive_shared",
		Title:  title,
		Body:   item.Name,
		Payload: map[string]any{
			"item_id": item.ID.String(),
			"kind":    item.Kind,
		},
	})
	if err != nil {
		log.Error().Err(err).Msg("drive: build notification task")
		return
	}
	if err := s.workerSrv.Enqueue(task); err != nil {
		log.Error().Err(err).Msg("drive: enqueue notification task")
	}
}
