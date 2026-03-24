package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// CommentHandler handles comment HTTP endpoints.
type CommentHandler struct {
	commentSvc *service.CommentService
}

func NewCommentHandler(commentSvc *service.CommentService) *CommentHandler {
	return &CommentHandler{commentSvc: commentSvc}
}

// Routes registers comment routes. Mounted under /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/comments.
func (h *CommentHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)

	r.Route("/{commentId}", func(r chi.Router) {
		r.Delete("/", h.Delete)
	})

	return r
}

// Create godoc
// @Summary Create comment
// @Description Add a comment to a task
// @Tags Comments
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param body body swaggerCreateCommentParams true "Comment data"
// @Success 201 {object} swaggerComment
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/comments [post]
func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateCommentParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())
	params.UserID = middleware.UserIDFromCtx(r.Context())

	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	params.ProjectID = projectID

	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	params.TaskID = taskID

	comment, err := h.commentSvc.Create(r.Context(), params)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, comment)
}

// List godoc
// @Summary List comments
// @Description List all comments on a task
// @Tags Comments
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Success 200 {array} swaggerComment
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/comments [get]
func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	limit := queryInt(r, "limit", 100)
	offset := queryInt(r, "offset", 0)
	if limit > 500 {
		limit = 500
	}
	comments, total, err := h.commentSvc.ListByTaskPaginated(r.Context(), taskID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	if comments == nil {
		comments = []*domain.Comment{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: comments, Total: total, Limit: limit, Offset: offset})
}

// Delete godoc
// @Summary Delete comment
// @Description Delete a comment from a task
// @Tags Comments
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param taskId path string true "Task ID" format(uuid)
// @Param commentId path string true "Comment ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/comments/{commentId} [delete]
func (h *CommentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "commentId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid comment id"})
		return
	}
	if err := h.commentSvc.Delete(r.Context(), id); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
