package service

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
)

const maxDriveGrantees = 50

// DriveGrantee identifies a share target.
type DriveGrantee struct {
	Type string    `json:"type"`
	ID   uuid.UUID `json:"id"`
}

// CreateSharesParams is a bulk share request on one item.
type CreateSharesParams struct {
	OrgID     uuid.UUID
	UserID    uuid.UUID
	ItemID    uuid.UUID
	Grantees  []DriveGrantee
	Role      string
	ExpiresAt *time.Time
}

// ListShares returns shares on the item and, marked inherited, on its ancestors.
func (s *DriveService) ListShares(ctx context.Context, orgID, userID, itemID uuid.UUID) ([]*domain.DriveShare, error) {
	item, err := s.liveItem(ctx, orgID, userID, itemID, domain.DriveRoleViewer)
	if err != nil {
		return nil, err
	}
	shares, err := s.repo.ListShares(ctx, orgID, append(slices.Clone(item.AncestorIDs), item.ID), false)
	if err != nil {
		return nil, err
	}
	for _, sh := range shares {
		sh.ItemID = item.ID
		sh.Inherited = sh.SourceItemID != item.ID
	}
	return shares, nil
}

// CreateShares upserts one share per grantee. The role is capped at the
// actor's own role, and an editor cannot overwrite someone else's share.
func (s *DriveService) CreateShares(ctx context.Context, p CreateSharesParams) ([]*domain.DriveShare, error) {
	role, ok := domain.ParseDriveRole(p.Role)
	if !ok {
		return nil, domain.ErrDriveInvalid.WithDetail("role must be viewer, editor or manager")
	}
	if len(p.Grantees) == 0 || len(p.Grantees) > maxDriveGrantees {
		return nil, domain.ErrDriveInvalid.WithDetail(fmt.Sprintf("between 1 and %d grantees are required", maxDriveGrantees))
	}
	if p.ExpiresAt != nil && !p.ExpiresAt.After(time.Now()) {
		return nil, domain.ErrDriveInvalid.WithDetail("expires_at must be in the future")
	}
	item, err := s.liveItem(ctx, p.OrgID, p.UserID, p.ItemID, domain.DriveRoleEditor)
	if err != nil {
		return nil, err
	}
	if !withinDriveCap(item.MyRole, role) {
		return nil, domain.ErrForbidden.WithDetail("cannot grant a role above your own")
	}
	grantees, err := s.validateGrantees(ctx, p.OrgID, p.UserID, p.Grantees)
	if err != nil {
		return nil, err
	}

	existing, err := s.repo.ListShares(ctx, p.OrgID, []uuid.UUID{item.ID}, true)
	if err != nil {
		return nil, err
	}
	prior := map[DriveGrantee]*domain.DriveShare{}
	for _, sh := range existing {
		prior[DriveGrantee{sh.GranteeType, sh.GranteeID}] = sh
	}
	for _, g := range grantees {
		if ex := prior[g]; ex != nil && item.MyRole != domain.DriveRoleManager && ex.CreatedBy != p.UserID {
			return nil, domain.ErrForbidden.WithDetail("only a manager can change another user's share")
		}
	}

	var ids, raised, fresh []uuid.UUID
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		ids, raised, fresh = nil, nil, nil
		for _, g := range grantees {
			id, err := s.repo.UpsertShare(ctx, tx, &domain.DriveShare{
				OrgID: p.OrgID, ItemID: item.ID, GranteeType: g.Type, GranteeID: g.ID,
				Role: role, CreatedBy: p.UserID, ExpiresAt: p.ExpiresAt,
			})
			if err != nil {
				return err
			}
			ids = append(ids, id)
			ex := prior[g]
			switch {
			case ex == nil || (ex.ExpiresAt != nil && !ex.ExpiresAt.After(time.Now())):
				fresh = append(fresh, id)
				raised = append(raised, id)
			case role.Rank() > ex.Role.Rank():
				raised = append(raised, id)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	all, err := s.repo.ListShares(ctx, p.OrgID, []uuid.UUID{item.ID}, true)
	if err != nil {
		return nil, err
	}
	shares := []*domain.DriveShare{}
	for _, sh := range all {
		if slices.Contains(ids, sh.ID) {
			shares = append(shares, sh)
		}
	}

	s.enqueueActivity(item, "shared", p.UserID, map[string]any{"grantees": grantees, "role": role})
	s.publishShareEvent(ctx, domain.EventDriveItemShared, p.UserID, item, raised)
	s.notifyShared(ctx, p.UserID, item, fresh)
	return shares, nil
}

// validateGrantees dedupes and checks every grantee belongs to this org.
func (s *DriveService) validateGrantees(ctx context.Context, orgID, userID uuid.UUID, in []DriveGrantee) ([]DriveGrantee, error) {
	seen := map[DriveGrantee]bool{}
	var out []DriveGrantee
	for _, g := range in {
		if seen[g] {
			continue
		}
		seen[g] = true
		if g.Type == domain.DriveGranteeUser && g.ID == userID {
			return nil, domain.ErrDriveInvalid.WithDetail("cannot share with yourself")
		}
		ok, err := s.repo.GranteeExists(ctx, orgID, g.Type, g.ID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, domain.ErrDriveInvalid.WithDetail("invalid grantee " + g.Type + " " + g.ID.String())
		}
		out = append(out, g)
	}
	return out, nil
}

// shareForChange loads a share the caller may change: a manager on the item
// or the share's creator. No access to the item at all is 404.
func (s *DriveService) shareForChange(ctx context.Context, orgID, userID, shareID uuid.UUID) (*domain.DriveShare, *domain.DriveItem, error) {
	share, err := s.repo.GetShare(ctx, orgID, shareID)
	if err != nil {
		return nil, nil, err
	}
	item, err := s.liveItem(ctx, orgID, userID, share.ItemID, domain.DriveRoleViewer)
	if err != nil {
		return nil, nil, err
	}
	if item.MyRole != domain.DriveRoleManager && share.CreatedBy != userID {
		return nil, nil, domain.ErrForbidden
	}
	return share, item, nil
}

// UpdateShare changes a share's role, still capped at the actor's role.
func (s *DriveService) UpdateShare(ctx context.Context, orgID, userID, shareID uuid.UUID, rawRole string) (*domain.DriveShare, error) {
	role, ok := domain.ParseDriveRole(rawRole)
	if !ok {
		return nil, domain.ErrDriveInvalid.WithDetail("role must be viewer, editor or manager")
	}
	share, item, err := s.shareForChange(ctx, orgID, userID, shareID)
	if err != nil {
		return nil, err
	}
	if !withinDriveCap(item.MyRole, role) {
		return nil, domain.ErrForbidden.WithDetail("cannot grant a role above your own")
	}
	if err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.UpdateShareRole(ctx, tx, orgID, shareID, role)
	}); err != nil {
		return nil, err
	}
	updated, err := s.repo.GetShare(ctx, orgID, shareID)
	if err != nil {
		return nil, err
	}
	s.enqueueActivity(item, "shared", userID, map[string]any{"share_id": shareID, "from": share.Role, "to": role})
	if role.Rank() > share.Role.Rank() {
		s.publishShareEvent(ctx, domain.EventDriveItemShared, userID, item, []uuid.UUID{shareID})
	}
	return updated, nil
}

// DeleteShare revokes a share.
func (s *DriveService) DeleteShare(ctx context.Context, orgID, userID, shareID uuid.UUID) error {
	share, item, err := s.shareForChange(ctx, orgID, userID, shareID)
	if err != nil {
		return err
	}
	// Resolved before the row is gone; these users just lost the share.
	audience := s.shareAudience(ctx, orgID, []uuid.UUID{shareID})
	if err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.repo.DeleteShare(ctx, tx, orgID, shareID)
	}); err != nil {
		return err
	}
	s.enqueueActivity(item, "revoked", userID, map[string]any{
		"share_id": shareID, "grantee_type": share.GranteeType, "grantee_id": share.GranteeID,
	})
	s.publish(ctx, domain.EventDriveShareRevoked, userID, item, audience)
	return nil
}

func (s *DriveService) shareAudience(ctx context.Context, orgID uuid.UUID, shareIDs []uuid.UUID) []uuid.UUID {
	users, err := s.repo.ShareGranteeUserIDs(ctx, orgID, shareIDs,
		[]string{domain.DriveGranteeUser, domain.DriveGranteeTeam, domain.DriveGranteeProject, domain.DriveGranteeOrg},
		maxDriveAudience+1)
	if err != nil {
		log.Warn().Err(err).Msg("drive: resolve share audience")
		return nil
	}
	return capDriveAudience(users)
}

func (s *DriveService) publishShareEvent(ctx context.Context, eventType string, actorID uuid.UUID, item *domain.DriveItem, shareIDs []uuid.UUID) {
	if len(shareIDs) == 0 {
		return
	}
	s.publish(ctx, eventType, actorID, item, s.shareAudience(ctx, item.OrgID, shareIDs))
}

// notifyShared tells user grantees and members of team grantees about new
// shares. Project and org grantees are too broad to notify individually.
func (s *DriveService) notifyShared(ctx context.Context, actorID uuid.UUID, item *domain.DriveItem, shareIDs []uuid.UUID) {
	if len(shareIDs) == 0 || s.workerSrv == nil {
		return
	}
	users, err := s.repo.ShareGranteeUserIDs(ctx, item.OrgID, shareIDs,
		[]string{domain.DriveGranteeUser, domain.DriveGranteeTeam}, maxDriveAudience)
	if err != nil {
		log.Warn().Err(err).Msg("drive: resolve share notification recipients")
		return
	}
	actor, err := s.repo.UserDisplayName(ctx, actorID)
	if err != nil {
		log.Warn().Err(err).Msg("drive: resolve actor name")
		actor = "Someone"
	}
	title := fmt.Sprintf("%s shared %q with you", actor, item.Name)
	for _, u := range users {
		if u != actorID {
			s.enqueueNotification(u, item, title)
		}
	}
}
