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

func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var params service.CreateCommentParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}
	params.OrgID = middleware.OrgIDFromCtx(r.Context())
	params.UserID = middleware.UserIDFromCtx(r.Context())

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

func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuidParam(r, "taskId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid task id"})
		return
	}
	comments, err := h.commentSvc.ListByTask(r.Context(), taskID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if comments == nil {
		comments = []*domain.Comment{}
	}
	JSON(w, http.StatusOK, comments)
}

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
