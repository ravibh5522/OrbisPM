package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// SearchHandler handles search HTTP endpoints.
type SearchHandler struct {
	searchSvc *service.SearchService
}

// NewSearchHandler creates a new SearchHandler.
func NewSearchHandler(searchSvc *service.SearchService) *SearchHandler {
	return &SearchHandler{searchSvc: searchSvc}
}

// Routes registers search routes.
func (h *SearchHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/tasks", h.SearchTasks)
	r.Get("/projects", h.SearchProjects)
	return r
}

func (h *SearchHandler) SearchTasks(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	query := r.URL.Query().Get("q")
	if query == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "query parameter 'q' is required"})
		return
	}

	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)

	result, err := h.searchSvc.SearchTasks(r.Context(), query, orgID.String(), limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

func (h *SearchHandler) SearchProjects(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgIDFromCtx(r.Context())
	query := r.URL.Query().Get("q")
	if query == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "query parameter 'q' is required"})
		return
	}

	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)

	result, err := h.searchSvc.SearchProjects(r.Context(), query, orgID.String(), limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, result)
}
