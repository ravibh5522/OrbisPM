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

// Create godoc
// @Summary Create task rule
// @Description Add an automation rule to a task
// @Tags Rules
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param body body swaggerCreateRuleParams true "Rule data (rule_type: auto_assign|require_review|auto_close)"
// @Success 201 {object} swaggerTaskRule
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/rules [post]
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

// List godoc
// @Summary List task rules
// @Description List all automation rules on a task
// @Tags Rules
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {array} swaggerTaskRule
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/rules [get]
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

// Delete godoc
// @Summary Delete task rule
// @Description Remove an automation rule from a task
// @Tags Rules
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param ruleId path string true "Rule ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/rules/{ruleId} [delete]
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
