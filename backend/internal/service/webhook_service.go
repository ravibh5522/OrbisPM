package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
)

// WebhookService handles webhook business logic.
type WebhookService struct {
	webhookRepo repository.WebhookRepository
	txm         *repository.TxManager
}

// NewWebhookService creates a new WebhookService.
func NewWebhookService(webhookRepo repository.WebhookRepository, txm *repository.TxManager) *WebhookService {
	return &WebhookService{webhookRepo: webhookRepo, txm: txm}
}

// CreateWebhookParams holds parameters for creating a webhook.
type CreateWebhookParams struct {
	OrgID  uuid.UUID
	URL    string   `json:"url" validate:"required,url"`
	Events []string `json:"events" validate:"required,min=1"`
}

// Create creates a new webhook with an auto-generated secret.
func (s *WebhookService) Create(ctx context.Context, params CreateWebhookParams) (*domain.Webhook, error) {
	secret := generateSecret(32)

	w := &domain.Webhook{
		OrgID:    params.OrgID,
		URL:      strings.TrimSpace(params.URL),
		Events:   params.Events,
		Secret:   secret,
		IsActive: true,
	}

	var created *domain.Webhook
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.webhookRepo.Create(ctx, tx, w)
		return err
	})
	return created, err
}

// Get returns a webhook by ID.
func (s *WebhookService) Get(ctx context.Context, id uuid.UUID) (*domain.Webhook, error) {
	return s.webhookRepo.GetByID(ctx, id)
}

// UpdateWebhookParams holds parameters for updating a webhook.
type UpdateWebhookParams struct {
	URL      *string  `json:"url,omitempty"`
	Events   []string `json:"events,omitempty"`
	IsActive *bool    `json:"is_active,omitempty"`
}

// Update updates a webhook.
func (s *WebhookService) Update(ctx context.Context, id uuid.UUID, params UpdateWebhookParams) (*domain.Webhook, error) {
	w, err := s.webhookRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.URL != nil {
		w.URL = strings.TrimSpace(*params.URL)
	}
	if len(params.Events) > 0 {
		w.Events = params.Events
	}
	if params.IsActive != nil {
		w.IsActive = *params.IsActive
	}

	var updated *domain.Webhook
	err = s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		updated, err = s.webhookRepo.Update(ctx, tx, w)
		return err
	})
	return updated, err
}

// Delete removes a webhook.
func (s *WebhookService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.webhookRepo.Delete(ctx, tx, id)
	})
}

// ListByOrg returns all webhooks for an org.
func (s *WebhookService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.Webhook, error) {
	return s.webhookRepo.ListByOrg(ctx, orgID)
}

// --- API Key Service ---

// APIKeyService handles API key business logic.
type APIKeyService struct {
	apikeyRepo repository.APIKeyRepository
	txm        *repository.TxManager
}

// NewAPIKeyService creates a new APIKeyService.
func NewAPIKeyService(apikeyRepo repository.APIKeyRepository, txm *repository.TxManager) *APIKeyService {
	return &APIKeyService{apikeyRepo: apikeyRepo, txm: txm}
}

// CreateAPIKeyParams holds parameters for creating an API key.
type CreateAPIKeyParams struct {
	OrgID  uuid.UUID
	UserID uuid.UUID
	Name   string   `json:"name" validate:"required,min=2,max=100"`
	Scopes []string `json:"scopes" validate:"required,min=1"`
}

// CreateAPIKeyResult holds the created API key and the raw key (only returned once).
type CreateAPIKeyResult struct {
	APIKey *domain.APIKey `json:"api_key"`
	RawKey string         `json:"raw_key"` // Only returned on creation
}

// Create creates a new API key. The raw key is only returned once.
func (s *APIKeyService) Create(ctx context.Context, params CreateAPIKeyParams) (*CreateAPIKeyResult, error) {
	rawKey := "opm_" + generateSecret(32)
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(hash[:])
	keyPrefix := rawKey[:8]

	k := &domain.APIKey{
		OrgID:    params.OrgID,
		UserID:   params.UserID,
		Name:     strings.TrimSpace(params.Name),
		KeyHash:  keyHash,
		KeyPrefix: keyPrefix,
		Scopes:   params.Scopes,
	}

	var created *domain.APIKey
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.apikeyRepo.Create(ctx, tx, k)
		return err
	})
	if err != nil {
		return nil, err
	}

	return &CreateAPIKeyResult{APIKey: created, RawKey: rawKey}, nil
}

// Delete removes an API key.
func (s *APIKeyService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.apikeyRepo.Delete(ctx, tx, id)
	})
}

// ListByOrg returns all API keys for an org.
func (s *APIKeyService) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]*domain.APIKey, error) {
	return s.apikeyRepo.ListByOrg(ctx, orgID)
}

// ListByUser returns the API keys a user created in an org.
func (s *APIKeyService) ListByUser(ctx context.Context, orgID, userID uuid.UUID) ([]*domain.APIKey, error) {
	return s.apikeyRepo.ListByUser(ctx, orgID, userID)
}

// DeleteOwned revokes a key only when it belongs to the caller; it reports whether one was removed.
func (s *APIKeyService) DeleteOwned(ctx context.Context, orgID, userID, id uuid.UUID) (bool, error) {
	var removed bool
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var e error
		removed, e = s.apikeyRepo.DeleteOwned(ctx, tx, orgID, userID, id)
		return e
	})
	return removed, err
}

// DeleteInOrg revokes any key in the org (admin); it reports whether one was removed.
func (s *APIKeyService) DeleteInOrg(ctx context.Context, orgID, id uuid.UUID) (bool, error) {
	var removed bool
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		var e error
		removed, e = s.apikeyRepo.DeleteInOrg(ctx, tx, orgID, id)
		return e
	})
	return removed, err
}

func generateSecret(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
