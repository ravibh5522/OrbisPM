package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// driveUploadTimeout replaces the server-wide read/write timeouts for one
// upload: 100 MB on a slow link takes minutes, not 15 seconds.
const driveUploadTimeout = 15 * time.Minute

// DriveHandler serves Orbis Drive. Authorization happens in the service
// (DriveAccess): the scope is only known after the item is loaded.
type DriveHandler struct {
	svc           *service.DriveService
	uploadLimiter *middleware.RateLimiter
}

// NewDriveHandler creates a new DriveHandler.
func NewDriveHandler(svc *service.DriveService) *DriveHandler {
	// 60 uploads/min per user (design §9.3), on top of the global per-IP limit.
	return &DriveHandler{svc: svc, uploadLimiter: middleware.NewRateLimiter(60, 20)}
}

// Routes registers drive routes (mounted at /orgs/{orgId}/drive).
func (h *DriveHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/spaces", h.Spaces)
	r.Get("/items", h.List)
	r.Post("/folders", h.CreateFolder)
	r.With(h.uploadLimiter.HandlerBy(func(r *http.Request) string {
		return middleware.UserIDFromCtx(r.Context()).String()
	})).Post("/files", h.Upload)
	r.Get("/shared-with-me", h.SharedWithMe)
	r.Get("/recent", h.Recent)
	r.Get("/search", h.Search)
	r.Get("/trash", h.ListTrash)
	r.Get("/usage", h.Usage)
	r.Route("/items/{itemId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Rename)
		r.Delete("/", h.Trash)
		r.Post("/move", h.Move)
		r.Post("/restore", h.Restore)
		r.Get("/url", h.DownloadURL)
		r.Get("/shares", h.ListShares)
		r.Post("/shares", h.CreateShares)
	})
	r.Route("/shares/{shareId}", func(r chi.Router) {
		r.Patch("/", h.UpdateShare)
		r.Delete("/", h.DeleteShare)
	})
	return r
}

func driveBadRequest(w http.ResponseWriter, msg string) {
	JSON(w, http.StatusBadRequest, ErrorResponse{Message: msg})
}

// drivePageParams parses limit (clamped to [1, maxLimit]) and the opaque offset cursor.
func drivePageParams(r *http.Request, def, maxLimit int) (int, int, bool) {
	limit := queryInt(r, "limit", def)
	if limit < 1 {
		limit = def
	}
	limit = min(limit, maxLimit)
	offset := 0
	if c := r.URL.Query().Get("cursor"); c != "" {
		n, err := strconv.Atoi(c)
		if err != nil || n < 0 {
			return 0, 0, false
		}
		offset = n
	}
	return limit, offset, true
}

func driveNextCursor(next *int) *string {
	if next == nil {
		return nil
	}
	c := strconv.Itoa(*next)
	return &c
}

func parseDriveSpace(scopeRaw, scopeIDRaw string) (domain.DriveScope, uuid.UUID, bool) {
	scope, ok := domain.ParseDriveScope(scopeRaw)
	if !ok {
		return "", uuid.Nil, false
	}
	id, err := uuid.Parse(scopeIDRaw)
	return scope, id, err == nil
}

func driveOptionalUUID(raw string) (*uuid.UUID, bool) {
	if raw == "" {
		return nil, true
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, false
	}
	return &id, true
}

// Spaces godoc
// @Summary List drive spaces
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} map[string]interface{} "spaces"
// @Router /orgs/{orgId}/drive/spaces [get]
func (h *DriveHandler) Spaces(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	spaces, err := h.svc.Spaces(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx))
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"spaces": spaces})
}

// List godoc
// @Summary List a drive folder
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param scope query string true "org | team | project | user"
// @Param scope_id query string true "Space ID" format(uuid)
// @Param parent_id query string false "Folder ID (omit for the space root)" format(uuid)
// @Param limit query int false "Page size (default 100, max 200)"
// @Param cursor query string false "Opaque cursor from next_cursor"
// @Success 200 {object} map[string]interface{} "items, next_cursor, my_role, breadcrumbs"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/items [get]
func (h *DriveHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	scope, scopeID, ok := parseDriveSpace(q.Get("scope"), q.Get("scope_id"))
	if !ok {
		driveBadRequest(w, "valid scope and scope_id are required")
		return
	}
	parentID, ok := driveOptionalUUID(q.Get("parent_id"))
	if !ok {
		driveBadRequest(w, "invalid parent_id")
		return
	}
	limit, offset, ok := drivePageParams(r, 100, 200)
	if !ok {
		driveBadRequest(w, "invalid cursor")
		return
	}
	ctx := r.Context()
	page, err := h.svc.List(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), scope, scopeID, parentID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{
		"items":       page.Items,
		"next_cursor": driveNextCursor(page.NextOffset),
		"my_role":     page.MyRole,
		"breadcrumbs": page.Breadcrumbs,
	})
}

// Get godoc
// @Summary Get a drive item
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Success 200 {object} map[string]interface{} "item, breadcrumbs, space"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/items/{itemId} [get]
func (h *DriveHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	ctx := r.Context()
	item, crumbs, space, err := h.svc.Get(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"item": item, "breadcrumbs": crumbs, "space": space})
}

type driveFolderRequest struct {
	Scope    string     `json:"scope"`
	ScopeID  uuid.UUID  `json:"scope_id"`
	ParentID *uuid.UUID `json:"parent_id"`
	Name     string     `json:"name"`
}

// CreateFolder godoc
// @Summary Create a drive folder
// @Tags Drive
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body driveFolderRequest true "Folder"
// @Success 201 {object} map[string]interface{} "DriveItem"
// @Failure 403 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 422 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/folders [post]
func (h *DriveHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	var req driveFolderRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	scope, ok := domain.ParseDriveScope(req.Scope)
	if !ok {
		driveBadRequest(w, "invalid scope")
		return
	}
	ctx := r.Context()
	item, err := h.svc.CreateFolder(ctx, service.NewItemParams{
		OrgID:    middleware.OrgIDFromCtx(ctx),
		UserID:   middleware.UserIDFromCtx(ctx),
		Scope:    scope,
		ScopeID:  req.ScopeID,
		ParentID: req.ParentID,
		Name:     req.Name,
	})
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, item)
}

// Upload godoc
// @Summary Upload a drive file
// @Description Multipart form: scope, scope_id, optional parent_id, then the file part last. Streamed, never buffered.
// @Tags Drive
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 201 {object} map[string]interface{} "DriveItem"
// @Failure 402 {object} ErrorResponse
// @Failure 413 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/files [post]
func (h *DriveHandler) Upload(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Now().Add(driveUploadTimeout))
	_ = rc.SetWriteDeadline(time.Now().Add(driveUploadTimeout + time.Minute))

	// +1 MB covers the other form fields and multipart framing.
	r.Body = http.MaxBytesReader(w, r.Body, h.svc.MaxFileBytes()+1<<20)
	mr, err := r.MultipartReader()
	if err != nil {
		driveBadRequest(w, "expected multipart/form-data")
		return
	}

	fields := map[string]string{}
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			driveBadRequest(w, "missing file part")
			return
		}
		if err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				Error(w, r, domain.ErrDriveFileTooLarge)
				return
			}
			driveBadRequest(w, "malformed multipart body")
			return
		}
		if part.FormName() == "file" {
			h.upload(w, r, fields, part.FileName(), part.Header.Get("Content-Type"), part.Header.Get("Content-Length"), part)
			return
		}
		v, err := io.ReadAll(io.LimitReader(part, 1024))
		_ = part.Close()
		if err != nil {
			driveBadRequest(w, "malformed multipart body")
			return
		}
		fields[part.FormName()] = string(v)
	}
}

func (h *DriveHandler) upload(w http.ResponseWriter, r *http.Request, fields map[string]string, filename, declaredType, declaredLen string, body io.Reader) {
	scope, scopeID, ok := parseDriveSpace(fields["scope"], fields["scope_id"])
	if !ok {
		driveBadRequest(w, "valid scope and scope_id fields must precede the file part")
		return
	}
	parentID, ok := driveOptionalUUID(fields["parent_id"])
	if !ok {
		driveBadRequest(w, "invalid parent_id")
		return
	}
	size := int64(-1)
	if declaredLen != "" {
		n, err := strconv.ParseInt(declaredLen, 10, 64)
		if err != nil || n < 0 {
			driveBadRequest(w, "invalid part Content-Length")
			return
		}
		size = n
	}
	ctx := r.Context()
	item, err := h.svc.Upload(ctx, service.UploadParams{
		NewItemParams: service.NewItemParams{
			OrgID:    middleware.OrgIDFromCtx(ctx),
			UserID:   middleware.UserIDFromCtx(ctx),
			Scope:    scope,
			ScopeID:  scopeID,
			ParentID: parentID,
			Name:     filename,
		},
		DeclaredType: declaredType,
		DeclaredSize: size,
	}, body)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, item)
}

type driveRenameRequest struct {
	Name string `json:"name"`
}

// Rename godoc
// @Summary Rename a drive item
// @Tags Drive
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Param body body driveRenameRequest true "New name"
// @Success 200 {object} map[string]interface{} "DriveItem"
// @Failure 409 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/items/{itemId} [patch]
func (h *DriveHandler) Rename(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	var req driveRenameRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	ctx := r.Context()
	item, err := h.svc.Rename(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id, req.Name)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, item)
}

type driveMoveRequest struct {
	ParentID *uuid.UUID `json:"parent_id"`
}

// Move godoc
// @Summary Move a drive item within its space
// @Tags Drive
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Param body body driveMoveRequest true "Target folder (null = space root)"
// @Success 200 {object} map[string]interface{} "DriveItem"
// @Failure 409 {object} ErrorResponse
// @Failure 422 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/items/{itemId}/move [post]
func (h *DriveHandler) Move(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	var req driveMoveRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	ctx := r.Context()
	item, err := h.svc.Move(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id, req.ParentID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, item)
}

// Trash godoc
// @Summary Move a drive item to the trash
// @Tags Drive
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Success 204 "No Content"
// @Failure 403 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/items/{itemId} [delete]
func (h *DriveHandler) Trash(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	ctx := r.Context()
	if err := h.svc.TrashItem(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Restore godoc
// @Summary Restore a drive item from the trash
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Success 200 {object} map[string]interface{} "DriveItem"
// @Router /orgs/{orgId}/drive/items/{itemId}/restore [post]
func (h *DriveHandler) Restore(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	ctx := r.Context()
	item, err := h.svc.Restore(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, item)
}

// DownloadURL godoc
// @Summary Presigned download/preview URL (5 minutes)
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Param disposition query string false "inline | attachment (default)"
// @Success 200 {object} map[string]interface{} "url, expires_at, inline"
// @Router /orgs/{orgId}/drive/items/{itemId}/url [get]
func (h *DriveHandler) DownloadURL(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	disposition := queryStrDefault(r, "disposition", "attachment")
	if disposition != "inline" && disposition != "attachment" {
		driveBadRequest(w, "disposition must be inline or attachment")
		return
	}
	ctx := r.Context()
	dl, err := h.svc.DownloadURL(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id, disposition == "inline")
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, dl)
}

// ListShares godoc
// @Summary List shares on a drive item (including inherited)
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Success 200 {object} map[string]interface{} "shares"
// @Router /orgs/{orgId}/drive/items/{itemId}/shares [get]
func (h *DriveHandler) ListShares(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	ctx := r.Context()
	shares, err := h.svc.ListShares(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"shares": shares})
}

type driveShareRequest struct {
	Grantees []struct {
		Type string    `json:"type"`
		ID   uuid.UUID `json:"id"`
	} `json:"grantees"`
	Role      string     `json:"role"`
	ExpiresAt *time.Time `json:"expires_at"`
}

// CreateShares godoc
// @Summary Share a drive item
// @Tags Drive
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param itemId path string true "Item ID" format(uuid)
// @Param body body driveShareRequest true "Grantees and role"
// @Success 201 {object} map[string]interface{} "shares"
// @Failure 403 {object} ErrorResponse
// @Failure 422 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/items/{itemId}/shares [post]
func (h *DriveHandler) CreateShares(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "itemId")
	if err != nil {
		driveBadRequest(w, "invalid item id")
		return
	}
	var req driveShareRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	grantees := make([]service.DriveGrantee, len(req.Grantees))
	for i, g := range req.Grantees {
		grantees[i] = service.DriveGrantee{Type: g.Type, ID: g.ID}
	}
	ctx := r.Context()
	shares, err := h.svc.CreateShares(ctx, service.CreateSharesParams{
		OrgID:     middleware.OrgIDFromCtx(ctx),
		UserID:    middleware.UserIDFromCtx(ctx),
		ItemID:    id,
		Grantees:  grantees,
		Role:      req.Role,
		ExpiresAt: req.ExpiresAt,
	})
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, map[string]any{"shares": shares})
}

type driveShareRoleRequest struct {
	Role string `json:"role"`
}

// UpdateShare godoc
// @Summary Change a drive share's role
// @Tags Drive
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param shareId path string true "Share ID" format(uuid)
// @Param body body driveShareRoleRequest true "Role"
// @Success 200 {object} map[string]interface{} "DriveShare"
// @Router /orgs/{orgId}/drive/shares/{shareId} [patch]
func (h *DriveHandler) UpdateShare(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "shareId")
	if err != nil {
		driveBadRequest(w, "invalid share id")
		return
	}
	var req driveShareRoleRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	ctx := r.Context()
	share, err := h.svc.UpdateShare(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id, req.Role)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, share)
}

// DeleteShare godoc
// @Summary Revoke a drive share
// @Tags Drive
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param shareId path string true "Share ID" format(uuid)
// @Success 204 "No Content"
// @Router /orgs/{orgId}/drive/shares/{shareId} [delete]
func (h *DriveHandler) DeleteShare(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "shareId")
	if err != nil {
		driveBadRequest(w, "invalid share id")
		return
	}
	ctx := r.Context()
	if err := h.svc.DeleteShare(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SharedWithMe godoc
// @Summary Items shared with the caller
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param limit query int false "Page size (default 100, max 200)"
// @Param cursor query string false "Opaque cursor from next_cursor"
// @Success 200 {object} map[string]interface{} "items, next_cursor"
// @Router /orgs/{orgId}/drive/shared-with-me [get]
func (h *DriveHandler) SharedWithMe(w http.ResponseWriter, r *http.Request) {
	limit, offset, ok := drivePageParams(r, 100, 200)
	if !ok {
		driveBadRequest(w, "invalid cursor")
		return
	}
	ctx := r.Context()
	items, next, err := h.svc.SharedWithMe(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"items": items, "next_cursor": driveNextCursor(next)})
}

// Recent godoc
// @Summary The caller's recent files
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param limit query int false "Max items (default 20, max 50)"
// @Success 200 {object} map[string]interface{} "items"
// @Router /orgs/{orgId}/drive/recent [get]
func (h *DriveHandler) Recent(w http.ResponseWriter, r *http.Request) {
	limit, _, _ := drivePageParams(r, 20, 50)
	ctx := r.Context()
	items, err := h.svc.Recent(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), limit)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"items": items})
}

// Search godoc
// @Summary Search drive item names
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param q query string true "At least 2 characters"
// @Param scope query string false "org | team | project | user"
// @Param scope_id query string false "Space ID" format(uuid)
// @Success 200 {object} map[string]interface{} "items"
// @Failure 422 {object} ErrorResponse
// @Router /orgs/{orgId}/drive/search [get]
func (h *DriveHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := strings.TrimSpace(q.Get("q"))
	if utf8.RuneCountInString(query) < 2 {
		Error(w, r, domain.ErrDriveInvalid.WithDetail("q must be at least 2 characters"))
		return
	}
	var scope *domain.DriveScope
	if raw := q.Get("scope"); raw != "" {
		s, ok := domain.ParseDriveScope(raw)
		if !ok {
			driveBadRequest(w, "invalid scope")
			return
		}
		scope = &s
	}
	scopeID, ok := driveOptionalUUID(q.Get("scope_id"))
	if !ok {
		driveBadRequest(w, "invalid scope_id")
		return
	}
	ctx := r.Context()
	items, err := h.svc.Search(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx), query, scope, scopeID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"items": items})
}

// ListTrash godoc
// @Summary Trashed items the caller may restore
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} map[string]interface{} "items"
// @Router /orgs/{orgId}/drive/trash [get]
func (h *DriveHandler) ListTrash(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	items, err := h.svc.Trash(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx))
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"items": items})
}

// Usage godoc
// @Summary Org drive storage usage
// @Tags Drive
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {object} map[string]interface{} "bytes_used, bytes_limit (-1 = unlimited)"
// @Router /orgs/{orgId}/drive/usage [get]
func (h *DriveHandler) Usage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	used, limit, err := h.svc.Usage(ctx, middleware.OrgIDFromCtx(ctx), middleware.UserIDFromCtx(ctx))
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"bytes_used": used, "bytes_limit": limit})
}
