package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
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
	Name    *string `json:"name,omitempty" validate:"omitempty,min=2,max=100"`
	Slug    *string `json:"slug,omitempty" validate:"omitempty,min=2,max=50"`
	LogoURL *string `json:"logo_url,omitempty"`
}

// OrgService handles organization business logic.
type OrgService struct {
	orgRepo       repository.OrgRepository
	orgMemberRepo repository.OrgMemberRepository
	txm           *repository.TxManager
}

// NewOrgService creates a new OrgService.
func NewOrgService(orgRepo repository.OrgRepository, orgMemberRepo repository.OrgMemberRepository, txm *repository.TxManager) *OrgService {
	return &OrgService{orgRepo: orgRepo, orgMemberRepo: orgMemberRepo, txm: txm}
}

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

// ListMembers lists members of an org.
func (s *OrgService) ListMembers(ctx context.Context, orgID uuid.UUID) ([]*domain.OrgMember, error) {
	return s.orgMemberRepo.ListByOrg(ctx, orgID)
}

// InviteMember adds a member to an org.
func (s *OrgService) InviteMember(ctx context.Context, orgID, userID uuid.UUID, role string) error {
	member := &domain.OrgMember{OrgID: orgID, UserID: userID, Role: role}
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgMemberRepo.Add(ctx, tx, member)
	})
}

// UpdateMemberRole updates a member's role.
func (s *OrgService) UpdateMemberRole(ctx context.Context, orgID, userID uuid.UUID, role string) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgMemberRepo.UpdateRole(ctx, tx, orgID, userID, role)
	})
}

// RemoveMember removes a member from an org.
func (s *OrgService) RemoveMember(ctx context.Context, orgID, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.orgMemberRepo.Remove(ctx, tx, orgID, userID)
	})
}
