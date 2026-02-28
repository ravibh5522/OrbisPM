package middleware

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/pkg/tenant"
)

// OrgIDFromCtx extracts the org ID from the context.
func OrgIDFromCtx(ctx context.Context) uuid.UUID {
	return tenant.OrgID(ctx)
}

// RLSTenant middleware reads orgId from URL and stores it in context.
// The actual SET LOCAL is done inside transactions via TxManager.
func RLSTenant() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			orgIDStr := chi.URLParam(r, "orgId")
			if orgIDStr == "" {
				next.ServeHTTP(w, r)
				return
			}

			orgID, err := uuid.Parse(orgIDStr)
			if err != nil {
				http.Error(w, `{"message":"invalid org id"}`, http.StatusBadRequest)
				return
			}

			ctx := tenant.SetOrgID(r.Context(), orgID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
