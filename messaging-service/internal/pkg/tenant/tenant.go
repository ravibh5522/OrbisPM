package tenant

import (
	"context"

	"github.com/google/uuid"
)

type contextKey string

const orgIDKey contextKey = "tenant_org_id"
const userIDKey contextKey = "tenant_user_id"
const emailKey contextKey = "tenant_email"
const displayNameKey contextKey = "tenant_display_name"

// SetOrgID stores the org ID in context.
func SetOrgID(ctx context.Context, orgID uuid.UUID) context.Context {
	return context.WithValue(ctx, orgIDKey, orgID)
}

// OrgID extracts the org ID from context.
func OrgID(ctx context.Context) uuid.UUID {
	if v, ok := ctx.Value(orgIDKey).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}

// SetUserID stores the user ID in context.
func SetUserID(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, userIDKey, userID)
}

// UserID extracts the user ID from context.
func UserID(ctx context.Context) uuid.UUID {
	if v, ok := ctx.Value(userIDKey).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}

// SetEmail stores the email in context.
func SetEmail(ctx context.Context, email string) context.Context {
	return context.WithValue(ctx, emailKey, email)
}

// Email extracts the email from context.
func Email(ctx context.Context) string {
	if v, ok := ctx.Value(emailKey).(string); ok {
		return v
	}
	return ""
}

// SetDisplayName stores the display name in context.
func SetDisplayName(ctx context.Context, name string) context.Context {
	return context.WithValue(ctx, displayNameKey, name)
}

// DisplayName extracts the display name from context.
func DisplayName(ctx context.Context) string {
	if v, ok := ctx.Value(displayNameKey).(string); ok {
		return v
	}
	return ""
}
