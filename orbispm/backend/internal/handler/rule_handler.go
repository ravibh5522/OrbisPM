package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// RuleHandler handles task rule HTTP endpoints.
type RuleHandler struct {
	ruleSvc *service.RuleService
}

func NewRuleHandler(ruleSvc *service.RuleService) *RuleHandler {
	return &RuleHandler{ruleSvc: ruleSvc}
}

// Routes registers rule routes. Mounted under /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/rules.
func (h *RuleHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{ruleId}", func(r chi.Router) {
		r.Delete("/", h.Delete)
	})

	return r
}

func (h *RuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateRuleParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	params.TaskID = taskID

	rule, err := h.ruleSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, rule)
}

func (h *RuleHandler) List(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	rules, err := h.ruleSvc.ListByTask(r.Context(), taskID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if rules == nil {
		rules = []*domain.TaskRule{}
	}
	JSON(w, http.StatusOK, rules)
}

func (h *RuleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "ruleId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid rule id"})
		return
	}
	if err := h.ruleSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
