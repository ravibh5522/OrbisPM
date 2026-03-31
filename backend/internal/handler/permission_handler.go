package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/service"
)

// PermissionHandler handles permission and role HTTP endpoints.
type PermissionHandler struct {
	permSvc      *service.PermissionService
	permResolver *service.PermissionResolver
}

func NewPermissionHandler(permSvc *service.PermissionService) *PermissionHandler {
	return &PermissionHandler{permSvc: permSvc}
}

// SetPermissionResolver sets the permission resolver for org-scope my-permissions.
func (h *PermissionHandler) SetPermissionResolver(pr *service.PermissionResolver) {
	h.permResolver = pr
}

// Routes registers permission routes. Mounted under /orgs/{orgId}/permissions.
// DEPRECATED: Use ReadRoutes() and AdminRoutes() for proper RBAC split.
func (h *PermissionHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Permissions (read-only, seed data)
	r.Get("/", h.ListPermissions)

	// Roles
	r.Route("/roles", func(r chi.Router) {
		r.Get("/", h.ListRoles)
		r.Post("/", h.CreateRole)
		r.Route("/{roleId}", func(r chi.Router) {
			r.Get("/", h.GetRole)
			r.Patch("/", h.UpdateRole)
			r.Delete("/", h.DeleteRole)
			r.Put("/permissions", h.SetRolePermissions)
		})
	})

	// Team-project role map (org settings)
	r.Get("/team-project-role-map", h.GetTeamProjectRoleMap)
	r.Put("/team-project-role-map", h.SetTeamProjectRoleMap)

	return r
}

// ReadRoutes returns read-only routes accessible by all org members.
// Mount under /orgs/{orgId}/permissions with RequireOrgMember.
func (h *PermissionHandler) ReadRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.ListPermissions)
	r.Get("/roles", h.ListRoles)
	r.Get("/roles/{roleId}", h.GetRole)
	r.Get("/team-project-role-map", h.GetTeamProjectRoleMap)
	return r
}

// AdminRoutes returns mutation routes accessible by admins only.
// Mount under /orgs/{orgId}/permissions with RequireOrgAdmin.
func (h *PermissionHandler) AdminRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/roles", h.CreateRole)
	r.Patch("/roles/{roleId}", h.UpdateRole)
	r.Delete("/roles/{roleId}", h.DeleteRole)
	r.Put("/roles/{roleId}/permissions", h.SetRolePermissions)
	r.Put("/team-project-role-map", h.SetTeamProjectRoleMap)
	return r
}

// CombinedRoutes returns all permission routes as a single chi.Router.
// Read operations are accessible by all org members; mutations are guarded by PermissionResolver.
// Use this to mount at a single path and avoid chi duplicate-mount panics.
func (h *PermissionHandler) CombinedRoutes(resolver *service.PermissionResolver) chi.Router {
	r := chi.NewRouter()

	prm := func(resource, action string) func(http.Handler) http.Handler {
		return middleware.RequireResolvedPermission(resolver, resource, action)
	}

	// Read-only routes — available to all org members
	r.Get("/", h.ListPermissions)
	r.Get("/team-project-role-map", h.GetTeamProjectRoleMap)

	r.Route("/roles", func(r chi.Router) {
		r.Get("/", h.ListRoles)
		r.Get("/{roleId}", h.GetRole)

		// Admin-only mutations via PermissionResolver
		r.Group(func(r chi.Router) {
			r.Use(prm("roles", "create"))
			r.Post("/", h.CreateRole)
		})
		r.Route("/{roleId}", func(r chi.Router) {
			r.With(prm("roles", "update")).Patch("/", h.UpdateRole)
			r.With(prm("roles", "delete")).Delete("/", h.DeleteRole)
			r.With(prm("roles", "update")).Put("/permissions", h.SetRolePermissions)
		})
	})

	// Admin-only team-project role map mutation
	r.With(prm("roles", "update")).Put("/team-project-role-map", h.SetTeamProjectRoleMap)

	return r
}

// ListPermissions returns all canonical permissions, optionally filtered by scope.
func (h *PermissionHandler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	scope := queryStr(r, "scope")
	perms, err := h.permSvc.ListPermissions(r.Context(), scope)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, perms)
}

// ListRoles returns all roles for the current org.
func (h *PermissionHandler) ListRoles(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	scope := queryStr(r, "scope")
	roles, err := h.permSvc.ListRoles(r.Context(), orgID, scope)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, roles)
}

// CreateRole creates a new custom role.
func (h *PermissionHandler) CreateRole(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	var params service.CreateRoleParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = orgID

	role, err := h.permSvc.CreateRole(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, role)
}

// GetRole returns a single role by ID with its permissions.
func (h *PermissionHandler) GetRole(w http.ResponseWriter, r *http.Request) {
	roleID, err := uuidParam(r, "roleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid role id"})
		return
	}
	role, err := h.permSvc.GetRole(r.Context(), roleID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, role)
}

// UpdateRole updates a role's name and description.
func (h *PermissionHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	roleID, err := uuidParam(r, "roleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid role id"})
		return
	}
	var params service.UpdateRoleParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	role, err := h.permSvc.UpdateRole(r.Context(), roleID, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, role)
}

// DeleteRole deletes a custom role.
func (h *PermissionHandler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	roleID, err := uuidParam(r, "roleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid role id"})
		return
	}
	if err := h.permSvc.DeleteRole(r.Context(), roleID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetRolePermissions replaces all permissions for a role.
func (h *PermissionHandler) SetRolePermissions(w http.ResponseWriter, r *http.Request) {
	roleID, err := uuidParam(r, "roleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid role id"})
		return
	}
	var body struct {
		PermissionIDs []string `json:"permission_ids"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	permIDs := make([]uuid.UUID, 0, len(body.PermissionIDs))
	for _, s := range body.PermissionIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid permission id: " + s})
			return
		}
		permIDs = append(permIDs, id)
	}

	if err := h.permSvc.SetRolePermissions(r.Context(), roleID, permIDs); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetTeamProjectRoleMap returns the org's team->project role mapping.
func (h *PermissionHandler) GetTeamProjectRoleMap(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	roleMap, err := h.permSvc.GetTeamProjectRoleMap(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, roleMap)
}

// SetTeamProjectRoleMap updates the org's team->project role mapping.
func (h *PermissionHandler) SetTeamProjectRoleMap(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	var roleMap map[string]string
	if err := parseBody(r, &roleMap); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if err := h.permSvc.SetTeamProjectRoleMap(r.Context(), orgID, roleMap); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetMyOrgPermissions returns the calling user's effective role and permissions at org scope.
func (h *PermissionHandler) GetMyOrgPermissions(w http.ResponseWriter, r *http.Request) {
	if h.permResolver == nil {
		JSON(w, http.StatusInternalServerError, ErrorResponse{Message: "permission resolver not configured"})
		return
	}
	userID := tenant.UserID(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	role, perms, err := h.permResolver.GetEffectivePermissions(r.Context(), userID, orgID, domain.ScopeOrg, nil)
	if err != nil {
		Error(w, r, err)
		return
	}

	type permItem struct {
		Resource string `json:"resource"`
		Action   string `json:"action"`
	}
	items := make([]permItem, 0, len(perms))
	for _, p := range perms {
		items = append(items, permItem{Resource: p.Resource, Action: p.Action})
	}

	JSON(w, http.StatusOK, map[string]any{
		"role":        role,
		"permissions": items,
	})
}
