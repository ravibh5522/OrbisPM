package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

type StickyNoteHandler struct {
	svc *service.StickyNoteService
}

func NewStickyNoteHandler(svc *service.StickyNoteService) *StickyNoteHandler {
	return &StickyNoteHandler{svc: svc}
}

// Routes registers sticky note routes. Mounted under /sticky-notes.
func (h *StickyNoteHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Create)
	r.Get("/", h.List)
	r.Get("/stats", h.Stats)
	r.Get("/{noteId}", h.Get)
	r.Put("/{noteId}", h.Update)
	r.Delete("/{noteId}", h.Delete)

	return r
}

type createStickyNoteRequest struct {
	Title       string              `json:"title" validate:"required,max=255"`
	Description string              `json:"description"`
	Color       string              `json:"color"`
	Priority    string              `json:"priority" validate:"omitempty,oneof=low medium high urgent"`
	StartDate   *time.Time          `json:"start_date"`
	DueDate     *time.Time          `json:"due_date"`
	Checkpoints []domain.Checkpoint `json:"checkpoints"`
}

type updateStickyNoteRequest struct {
	Title       string              `json:"title" validate:"required,max=255"`
	Description string              `json:"description"`
	Color       string              `json:"color"`
	Priority    string              `json:"priority" validate:"omitempty,oneof=low medium high urgent"`
	StartDate   *time.Time          `json:"start_date"`
	DueDate     *time.Time          `json:"due_date"`
	Completed   bool                `json:"completed"`
	Checkpoints []domain.Checkpoint `json:"checkpoints"`
}

// Create godoc
// @Summary Create sticky note
// @Description Create a personal sticky note
// @Tags StickyNotes
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body createStickyNoteRequest true "Sticky note data"
// @Success 201 {object} domain.StickyNote
// @Failure 400 {object} ErrorResponse
// @Router /sticky-notes [post]
func (h *StickyNoteHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createStickyNoteRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}

	userID := middleware.UserIDFromCtx(r.Context())
	color := req.Color
	if color == "" {
		color = "yellow"
	}
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}
	checkpoints := req.Checkpoints
	if checkpoints == nil {
		checkpoints = []domain.Checkpoint{}
	}

	note := &domain.StickyNote{
		UserID:      userID,
		Title:       req.Title,
		Description: req.Description,
		Color:       color,
		Priority:    priority,
		StartDate:   req.StartDate,
		DueDate:     req.DueDate,
		Checkpoints: checkpoints,
	}

	result, err := h.svc.Create(r.Context(), note)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, result)
}

// List godoc
// @Summary List sticky notes
// @Description List sticky notes for the authenticated user
// @Tags StickyNotes
// @Produce json
// @Security BearerAuth
// @Param limit query int false "Limit" default(50)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ListResponse
// @Router /sticky-notes [get]
func (h *StickyNoteHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	notes, total, err := h.svc.List(r.Context(), userID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	if notes == nil {
		notes = []*domain.StickyNote{}
	}
	JSON(w, http.StatusOK, ListResponse{
		Data:   notes,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

// Get godoc
// @Summary Get sticky note
// @Description Get a sticky note by ID
// @Tags StickyNotes
// @Produce json
// @Security BearerAuth
// @Param noteId path string true "Sticky Note ID" format(uuid)
// @Success 200 {object} domain.StickyNote
// @Failure 404 {object} ErrorResponse
// @Router /sticky-notes/{noteId} [get]
func (h *StickyNoteHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "noteId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid note id"})
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())

	note, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, note)
}

// Update godoc
// @Summary Update sticky note
// @Description Update a sticky note
// @Tags StickyNotes
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param noteId path string true "Sticky Note ID" format(uuid)
// @Param body body updateStickyNoteRequest true "Updated sticky note data"
// @Success 200 {object} domain.StickyNote
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /sticky-notes/{noteId} [put]
func (h *StickyNoteHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "noteId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid note id"})
		return
	}

	var req updateStickyNoteRequest
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body", Detail: err.Error()})
		return
	}

	userID := middleware.UserIDFromCtx(r.Context())
	color := req.Color
	if color == "" {
		color = "yellow"
	}
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}
	checkpoints := req.Checkpoints
	if checkpoints == nil {
		checkpoints = []domain.Checkpoint{}
	}

	note := &domain.StickyNote{
		ID:          id,
		UserID:      userID,
		Title:       req.Title,
		Description: req.Description,
		Color:       color,
		Priority:    priority,
		StartDate:   req.StartDate,
		DueDate:     req.DueDate,
		Completed:   req.Completed,
		Checkpoints: checkpoints,
	}

	result, err := h.svc.Update(r.Context(), note)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// Delete godoc
// @Summary Delete sticky note
// @Description Delete a sticky note
// @Tags StickyNotes
// @Produce json
// @Security BearerAuth
// @Param noteId path string true "Sticky Note ID" format(uuid)
// @Success 204 "No Content"
// @Failure 404 {object} ErrorResponse
// @Router /sticky-notes/{noteId} [delete]
func (h *StickyNoteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "noteId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid note id"})
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Stats godoc
// @Summary Get sticky note stats
// @Description Get aggregate stats for the user's sticky notes
// @Tags StickyNotes
// @Produce json
// @Security BearerAuth
// @Success 200 {object} domain.StickyNoteStats
// @Router /sticky-notes/stats [get]
func (h *StickyNoteHandler) Stats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	stats, err := h.svc.Stats(r.Context(), userID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, stats)
}

// Helper to generate a unique ID for checkpoints if not provided
func ensureCheckpointIDs(checkpoints []domain.Checkpoint) []domain.Checkpoint {
	for i := range checkpoints {
		if checkpoints[i].ID == "" {
			checkpoints[i].ID = uuid.New().String()
		}
	}
	return checkpoints
}
