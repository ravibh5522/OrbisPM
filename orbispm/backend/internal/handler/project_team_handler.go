package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/service"
)

// ProjectTeamHandler handles project ↔ team linking endpoints.
type ProjectTeamHandler struct {
	ptSvc *service.ProjectTeamService
}

func NewProjectTeamHandler(ptSvc *service.ProjectTeamService) *ProjectTeamHandler {
	return &ProjectTeamHandler{ptSvc: ptSvc}
}

// Routes registers project-team routes. Mounted under /orgs/{orgId}/projects/{projectId}/teams.
func (h *ProjectTeamHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.ListTeams)
	r.Post("/", h.LinkTeams)
	r.Delete("/{teamId}", h.UnlinkTeam)
	r.Get("/eligible-members", h.ListEligibleMembers)

	return r
}

// ListTeams returns teams linked to a project.
func (h *ProjectTeamHandler) ListTeams(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	teams, err := h.ptSvc.ListTeams(r.Context(), projectID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, teams)
}

// LinkTeams links one or more teams to a project.
func (h *ProjectTeamHandler) LinkTeams(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	var body struct {
		TeamIDs []string `json:"team_ids"`
	}
	if err := parseBody(r, &body); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	if len(body.TeamIDs) == 0 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "team_ids is required"})
		return
	}

	teamIDs := make([]uuid.UUID, 0, len(body.TeamIDs))
	for _, s := range body.TeamIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id: " + s})
			return
		}
		teamIDs = append(teamIDs, id)
	}

	params := service.LinkTeamsParams{
		ProjectID: projectID,
		TeamIDs:   teamIDs,
	}
	if err := h.ptSvc.LinkTeams(r.Context(), params); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UnlinkTeam removes a team from a project.
func (h *ProjectTeamHandler) UnlinkTeam(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	teamID, err := uuidParam(r, "teamId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team id"})
		return
	}
	if err := h.ptSvc.UnlinkTeam(r.Context(), projectID, teamID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListEligibleMembers returns effective members for a project (direct + team-inherited).
func (h *ProjectTeamHandler) ListEligibleMembers(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	members, err := h.ptSvc.ListEligibleMembers(r.Context(), projectID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, members)
}
