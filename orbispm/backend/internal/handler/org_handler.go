package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// OrgHandler handles organization HTTP endpoints.
type OrgHandler struct {
	orgSvc *service.OrgService
}

func NewOrgHandler(orgSvc *service.OrgService) *OrgHandler {
	return &OrgHandler{orgSvc: orgSvc}
}

// Routes registers org routes on a chi router.
func (h *OrgHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{orgId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)

		// Members
		r.Get("/members", h.ListMembers)
		r.Post("/members/invite", h.InviteMember)
		r.Patch("/members/{userId}", h.UpdateMemberRole)
		r.Delete("/members/{userId}", h.RemoveMember)
	})

	return r
}

func (h *OrgHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateOrgParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.UserID = middleware.UserIDFromCtx(r.Context())

	org, err := h.orgSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, org)
}

func (h *OrgHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	org, err := h.orgSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, org)
}

func (h *OrgHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgs, err := h.orgSvc.ListByUser(r.Context(), userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if orgs == nil {
		orgs = []*domain.Org{}
	}
	JSON(w, http.StatusOK, orgs)
}

func (h *OrgHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	var params service.UpdateOrgParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	org, err := h.orgSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, org)
}

func (h *OrgHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	if err := h.orgSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *OrgHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	members, err := h.orgSvc.ListMembers(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, members)
}

type inviteMemberRequest struct {
	UserID string `json:"user_id" validate:"required"`
	Role   string `json:"role" validate:"required"`
}

func (h *OrgHandler) InviteMember(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	var req inviteMemberRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.orgSvc.InviteMember(r.Context(), orgID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type updateRoleRequest struct {
	Role string `json:"role" validate:"required"`
}

func (h *OrgHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	var req updateRoleRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if err := h.orgSvc.UpdateMemberRole(r.Context(), orgID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *OrgHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuidParam(r, "orgId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid org id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.orgSvc.RemoveMember(r.Context(), orgID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
