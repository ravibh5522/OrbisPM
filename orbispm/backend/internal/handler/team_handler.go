package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// TeamHandler handles team HTTP endpoints.
type TeamHandler struct {
	teamSvc *service.TeamService
}

func NewTeamHandler(teamSvc *service.TeamService) *TeamHandler {
	return &TeamHandler{teamSvc: teamSvc}
}

// Routes registers team routes. Mounted under /orgs/{orgId}/teams.
func (h *TeamHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{teamId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)

		// Members
		r.Get("/members", h.ListMembers)
		r.Post("/members", h.AddMember)
		r.Delete("/members/{userId}", h.RemoveMember)
	})

	return r
}

func (h *TeamHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateTeamParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	team, err := h.teamSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, team)
}

func (h *TeamHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	team, err := h.teamSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, team)
}

func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	teams, err := h.teamSvc.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if teams == nil {
		teams = []*domain.Team{}
	}
	JSON(w, http.StatusOK, teams)
}

func (h *TeamHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	var params service.UpdateTeamParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	team, err := h.teamSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, team)
}

func (h *TeamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	if err := h.teamSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *TeamHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	members, err := h.teamSvc.ListMembers(r.Context(), teamID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, members)
}

type addTeamMemberRequest struct {
	UserID string `json:"user_id" validate:"required"`
	Role   string `json:"role" validate:"required"`
}

func (h *TeamHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	var req addTeamMemberRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.teamSvc.AddMember(r.Context(), teamID, userID, req.Role); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *TeamHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	userID, err := uuidParam(r, "userId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user id"})
		return
	}
	if err := h.teamSvc.RemoveMember(r.Context(), teamID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
