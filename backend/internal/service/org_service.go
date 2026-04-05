package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
)

// CreateOrgParams holds parameters for creating an organization.
type CreateOrgParams struct {
	Name   string `json:"name" validate:"required,min=2,max=100"`
	Slug   string `json:"slug" validate:"required,min=2,max=50"`
	UserID uuid.UUID
}

// UpdateOrgParams holds parameters for updating an organization.
type UpdateOrgParams struct {
	Name     *string         `json:"name,omitempty" validate:"omitempty,min=2,max=100"`
	Slug     *string         `json:"slug,omitempty" validate:"omitempty,min=2,max=50"`
	LogoURL  *string         `json:"logo_url,omitempty"`
	Settings *map[string]any `json:"settings,omitempty"`
}

// CacheInvalidator defines the subset of cache.Manager needed for permission invalidation.
type CacheInvalidator interface {
	InvalidateUserPermissions(ctx context.Context, userID, orgID uuid.UUID) error
	InvalidateRolePermissions(ctx context.Context, orgID uuid.UUID) error
}

// OrgService handles organization business logic.
type OrgService struct {
	orgRepo       repository.OrgRepository
	orgMemberRepo repository.OrgMemberRepository
	roleRepo      repository.RoleRepository
	txm           *repository.TxManager
	cache         CacheInvalidator
	publisher     EventPublisher
}

// NewOrgService creates a new OrgService.
func NewOrgService(orgRepo repository.OrgRepository, orgMemberRepo repository.OrgMemberRepository, txm *repository.TxManager) *OrgService {
	return &OrgService{orgRepo: orgRepo, orgMemberRepo: orgMemberRepo, txm: txm}
}

// SetRoleRepo injects the role repository for role validation.
func (s *OrgService) SetRoleRepo(rr repository.RoleRepository) { s.roleRepo = rr }

// SetCache injects the cache invalidator.
func (s *OrgService) SetCache(c CacheInvalidator) { s.cache = c }

// SetPublisher injects the event publisher.
func (s *OrgService) SetPublisher(p EventPublisher) { s.publisher = p }

var slugRegex = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// Create creates a new organization and assigns the creating user as owner.
func (s *OrgService) Create(ctx context.Context, params CreateOrgParams) (*domain.Org, error) {
	params.Slug = strings.ToLower(strings.TrimSpace(params.Slug))
	if !slugRegex.MatchString(params.Slug) {
		return nil, domain.ErrBadRequest.WithDetail("slug must be lowercase alphanumeric with hyphens")
	}

	org := &domain.Org{
		Name:     strings.TrimSpace(params.Name),
		Slug:     params.Slug,
		Plan:     "free",
		Settings: map[string]any{},
	}

	var created *domain.Org
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.orgRepo.Create(ctx, tx, org)
		if err != nil {
			return fmt.Errorf("create org: %w", err)
		}

		member := &domain.OrgMember{
			OrgID:  created.ID,
			UserID: params.UserID,
			Role:   domain.RoleOrgOwner,
		}
		if err := s.orgMemberRepo.Add(ctx, tx, member); err != nil {
			return fmt.Errorf("add owner: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

// Get fetches an organization by ID.
func (s *OrgService) Get(ctx context.Context, id uuid.UUID) (*domain.Org, error) {
	return s.orgRepo.GetByID(ctx, id)
}

// GetBySlug fetches an organization by slug.
func (s *OrgService) GetBySlug(ctx context.Context, slug string) (*domain.Org, error) {
	return s.orgRepo.GetBySlug(ctx, slug)
}

// Update updates an organization.
func (s *OrgService) Update(ctx context.Context, id uuid.UUID, params UpdateOrgParams) (*domain.Org, error) {
	org, err := s.orgRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.Name != nil {
		org.Name = strings.TrimSpace(*params.Name)
	}
	if params.Slug != nil {
		slug := strings.ToLower(strings.TrimSpace(*params.Slug))
		if !slugRegex.MatchString(slug) {
			return nil, domain.ErrBadRequest.WithDetail("slug must be lowercase alphanumeric with hyphens")
		}
		org.Slug = slug
	}
	if params.LogoURL != nil {
		org.LogoURL = *params.LogoURL
	}
	if params.Settings != nil {
		if org.Settings == nil {
			org.Settings = make(map[string]any)
		}
		for k, v := range *params.Settings {
			org.Settings[k] = v
		}
	}

	var updated *domain.Org
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.orgRepo.Update(ctx, tx, org)
		return err
	})
	return updated, err
}

// Delete deletes an organization.
func (s *OrgService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgRepo.Delete(ctx, tx, id)
	})
}

// ListByUser lists organizations the user belongs to.
func (s *OrgService) ListByUser(ctx context.Context, userID uuid.UUID) ([]*domain.Org, error) {
	return s.orgRepo.ListByUser(ctx, userID)
}

// --- Members ---

// GetMember returns a specific org member.
func (s *OrgService) GetMember(ctx context.Context, orgID, userID uuid.UUID) (*domain.OrgMember, error) {
	return s.orgMemberRepo.Get(ctx, orgID, userID)
}

// ListMembers lists members of an org with pagination and filtering.
func (s *OrgService) ListMembers(ctx context.Context, orgID uuid.UUID, filter repository.MemberFilter) ([]*domain.OrgMember, int, error) {
	return s.orgMemberRepo.ListByOrg(ctx, orgID, filter)
}

// InviteMember adds a member to an org.
func (s *OrgService) InviteMember(ctx context.Context, orgID, userID uuid.UUID, role string) error {
	member := &domain.OrgMember{OrgID: orgID, UserID: userID, Role: role}
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgMemberRepo.Add(ctx, tx, member)
	})
}

// InviteByEmail looks up a user by email and adds them to the org.
func (s *OrgService) InviteByEmail(ctx context.Context, orgID uuid.UUID, email, role string) (*domain.OrgMember, error) {
	userID, err := s.orgMemberRepo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("find user by email: %w", err)
	}
	member := &domain.OrgMember{OrgID: orgID, UserID: userID, Role: role}
	if err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgMemberRepo.Add(ctx, tx, member)
	}); err != nil {
		return nil, err
	}
	return s.orgMemberRepo.Get(ctx, orgID, userID)
}

// UpdateMemberRole updates a member's role after validating the slug.
func (s *OrgService) UpdateMemberRole(ctx context.Context, orgID, userID uuid.UUID, role string) error {
	if err := s.validateRole(ctx, orgID, domain.ScopeOrg, role); err != nil {
		return err
	}
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgMemberRepo.UpdateRole(ctx, tx, orgID, userID, role)
	})
	if err != nil {
		return err
	}
	// Invalidate cached permissions for the affected user
	if s.cache != nil {
		_ = s.cache.InvalidateUserPermissions(ctx, userID, orgID)
	}
	s.publishEvent(ctx, domain.EventOrgMemberRoleUpdated, orgID.String(), orgID.String(), map[string]any{
		"user_id": userID.String(),
		"role":    role,
		"scope":   "org",
	})
	return nil
}

// validateRole checks that a role slug is valid for the given scope (system or custom).
func (s *OrgService) validateRole(ctx context.Context, orgID uuid.UUID, scope, slug string) error {
	if s.roleRepo == nil {
		return nil // skip validation if repo not injected
	}
	_, err := s.roleRepo.GetBySlug(ctx, orgID, scope, slug)
	if err != nil {
		return domain.ErrBadRequest.WithDetail("invalid role: " + slug)
	}
	return nil
}

// RemoveMember removes a member from an org.
func (s *OrgService) RemoveMember(ctx context.Context, orgID, userID uuid.UUID) error {
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgMemberRepo.Remove(ctx, tx, orgID, userID)
	})
	if err != nil {
		return err
	}
	// Invalidate cached permissions for the removed user
	if s.cache != nil {
		_ = s.cache.InvalidateUserPermissions(ctx, userID, orgID)
	}
	s.publishEvent(ctx, domain.EventOrgMemberRemoved, orgID.String(), orgID.String(), map[string]any{
		"user_id": userID.String(),
	})
	return nil
}

// publishEvent publishes a domain event via the event publisher.
func (s *OrgService) publishEvent(ctx context.Context, eventType, orgID, entityID string, payload map[string]any) {
	if s.publisher == nil {
		return
	}
	event := domain.DomainEvent{
		Type:     eventType,
		OrgID:    orgID,
		ActorID:  tenant.UserID(ctx).String(),
		EntityID: entityID,
		Payload:  payload,
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		_ = err
	}
}
