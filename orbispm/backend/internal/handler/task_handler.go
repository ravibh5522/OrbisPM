package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/service"
)

// TaskHandler handles task HTTP endpoints.
type TaskHandler struct {
	taskSvc *service.TaskService
}

func NewTaskHandler(taskSvc *service.TaskService) *TaskHandler {
	return &TaskHandler{taskSvc: taskSvc}
}

// Routes registers task routes. Mounted under /orgs/{orgId}/projects/{projectId}/tasks.
func (h *TaskHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{taskId}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Patch("/", h.Update)
		r.Delete("/", h.Delete)
		r.Get("/tree", h.GetTree)
		r.Post("/submit-review", h.SubmitForReview)
		r.Post("/complete", h.MarkComplete)
	})

	return r
}

func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateTaskParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	params.ProjectID = projectID

	task, err := h.taskSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, task)
}

func (h *TaskHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	task, err := h.taskSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
}

func (h *TaskHandler) GetTree(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	tree, err := h.taskSvc.GetTree(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	if tree == nil {
		tree = []*domain.Task{}
	}
	JSON(w, http.StatusOK, tree)
}

func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}

	filter := repository.TaskFilter{
		ListFilter: repository.ListFilter{
			Limit:  queryInt(r, "limit", 50),
			Offset: queryInt(r, "offset", 0),
		},
		Status:     queryStr(r, "status"),
		Priority:   queryStr(r, "priority"),
		AssigneeID: queryUUID(r, "assignee_id"),
		Search:     queryStr(r, "search"),
	}

	tasks, total, err := h.taskSvc.List(r.Context(), projectID, filter)
	if err != nil {
		Error(w, r, err)
		return
	}
	if tasks == nil {
		tasks = []*domain.Task{}
	}
	JSON(w, http.StatusOK, ListResponse{
		Data:   tasks,
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	})
}

func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	var params service.UpdateTaskParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	task, err := h.taskSvc.Update(r.Context(), id, params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
}

func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	if err := h.taskSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *TaskHandler) SubmitForReview(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	task, err := h.taskSvc.SubmitForReview(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
}

func (h *TaskHandler) MarkComplete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	task, err := h.taskSvc.MarkComplete(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, task)
}
