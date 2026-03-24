package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/pkg/tenant"
	"github.com/orbispm/messaging-service/internal/service"
)

// RESTHandler handles REST API endpoints for chat.
type RESTHandler struct {
	channelSvc  *service.ChannelService
	messageSvc  *service.MessageService
	uploadSvc   *service.UploadService
	presenceSvc *service.PresenceService
	sidebarSvc  *service.SidebarService
	categorySvc *service.CategoryService
}

// NewRESTHandler creates a new RESTHandler.
func NewRESTHandler(
	channelSvc *service.ChannelService,
	messageSvc *service.MessageService,
	uploadSvc *service.UploadService,
	presenceSvc *service.PresenceService,
	sidebarSvc *service.SidebarService,
	categorySvc *service.CategoryService,
) *RESTHandler {
	return &RESTHandler{
		channelSvc:  channelSvc,
		messageSvc:  messageSvc,
		uploadSvc:   uploadSvc,
		presenceSvc: presenceSvc,
		sidebarSvc:  sidebarSvc,
		categorySvc: categorySvc,
	}
}

// Routes registers REST API routes on the given chi router.
func (h *RESTHandler) Routes(r chi.Router) {
	// Sidebar
	r.Get("/sidebar", h.GetSidebar)

	// User search (for DMs, mentions)
	r.Get("/users", h.SearchUsers)

	// Presence
	r.Get("/presence", h.GetPresence)

	r.Route("/channels", func(r chi.Router) {
		r.Post("/", h.CreateChannel)
		r.Get("/", h.ListChannels)
		r.Post("/dm", h.GetOrCreateDM)

		r.Route("/{channelID}", func(r chi.Router) {
			r.Get("/", h.GetChannel)
			r.Put("/", h.UpdateChannel)
			r.Delete("/", h.DeleteChannel)
			r.Post("/archive", h.ArchiveChannel)

			// Members
			r.Get("/members", h.ListMembers)
			r.Post("/members", h.AddMember)
			r.Delete("/members/{userID}", h.RemoveMember)
			r.Put("/members/{userID}/role", h.UpdateMemberRole)
			r.Put("/settings", h.UpdateChannelSettings)
			r.Post("/read", h.MarkRead)

			// Messages
			r.Get("/messages", h.ListMessages)
			r.Post("/messages", h.SendMessage)
			r.Get("/messages/search", h.SearchMessages)

			// Pins
			r.Get("/pins", h.ListPins)
			r.Post("/pins/{messageID}", h.PinMessage)
			r.Delete("/pins/{messageID}", h.UnpinMessage)

			// Upload
			r.Post("/upload", h.UploadFile)
		})
	})

	r.Route("/messages/{messageID}", func(r chi.Router) {
		r.Put("/", h.EditMessage)
		r.Delete("/", h.DeleteMessage)
		r.Post("/reactions", h.ToggleReaction)
		r.Post("/forward", h.ForwardMessage)
		r.Post("/bookmark", h.AddBookmark)
		r.Delete("/bookmark", h.RemoveBookmark)
	})

	r.Route("/messages/{messageID}/thread", func(r chi.Router) {
		r.Get("/", h.ListThread)
	})

	// Attachments
	r.Get("/attachments/{attachmentID}/url", h.GetAttachmentURL)

	r.Get("/bookmarks", h.ListBookmarks)

	// Categories
	r.Route("/categories", func(r chi.Router) {
		r.Get("/", h.ListCategories)
		r.Post("/", h.CreateCategory)
		r.Route("/{categoryID}", func(r chi.Router) {
			r.Put("/", h.UpdateCategory)
			r.Delete("/", h.DeleteCategory)
			r.Put("/collapsed", h.ToggleCategoryCollapsed)
		})
		r.Put("/channel/{channelID}", h.SetChannelCategory)
	})
}

// ─── Channel Handlers ─────────────────────────

func (h *RESTHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Type        string `json:"type"`
		TeamID      string `json:"team_id,omitempty"`
		ProjectID   string `json:"project_id,omitempty"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}

	ch := &domain.Channel{
		OrgID:       tenant.OrgID(r.Context()),
		Name:        req.Name,
		Description: req.Description,
		Type:        domain.ChannelType(req.Type),
	}
	if req.TeamID != "" {
		id, err := uuid.Parse(req.TeamID)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid team_id"})
			return
		}
		ch.TeamID = &id
	}
	if req.ProjectID != "" {
		id, err := uuid.Parse(req.ProjectID)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project_id"})
			return
		}
		ch.ProjectID = &id
	}

	if err := h.channelSvc.CreateChannel(r.Context(), ch); err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, ch)
}

func (h *RESTHandler) GetChannel(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	ch, err := h.channelSvc.GetChannel(r.Context(), channelID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ch)
}

func (h *RESTHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	channels, total, err := h.channelSvc.ListUserChannels(r.Context(), limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ListResponse{Data: channels, Total: total, Limit: limit, Offset: offset})
}

func (h *RESTHandler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AvatarURL   string `json:"avatar_url"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	ch := &domain.Channel{ID: channelID, Name: req.Name, Description: req.Description, AvatarURL: req.AvatarURL}
	if err := h.channelSvc.UpdateChannel(r.Context(), ch); err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ch)
}

func (h *RESTHandler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	if err := h.channelSvc.DeleteChannel(r.Context(), channelID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) ArchiveChannel(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	if err := h.channelSvc.ArchiveChannel(r.Context(), channelID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) GetOrCreateDM(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	otherUserID, err := uuid.Parse(req.UserID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user_id"})
		return
	}
	ch, err := h.channelSvc.GetOrCreateDM(r.Context(), otherUserID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ch)
}

// ─── Member Handlers ──────────────────────────

func (h *RESTHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	members, err := h.channelSvc.ListMembers(r.Context(), channelID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, members)
}

func (h *RESTHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	targetUserID, err := uuid.Parse(req.UserID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user_id"})
		return
	}
	if err := h.channelSvc.AddMember(r.Context(), channelID, targetUserID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user_id"})
		return
	}
	if err := h.channelSvc.RemoveMember(r.Context(), channelID, userID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid user_id"})
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	if err := h.channelSvc.UpdateMemberRole(r.Context(), channelID, userID, domain.MemberRole(req.Role)); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) UpdateChannelSettings(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	var req struct {
		IsMuted  bool `json:"is_muted"`
		IsPinned bool `json:"is_pinned"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	if err := h.channelSvc.UpdateMutePin(r.Context(), channelID, req.IsMuted, req.IsPinned); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	if err := h.channelSvc.MarkRead(r.Context(), channelID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Message Handlers ─────────────────────────

func (h *RESTHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	var req struct {
		Body            string   `json:"body"`
		BodyFormat      string   `json:"body_format"`
		ParentMessageID string   `json:"parent_message_id,omitempty"`
		Mentions        []string `json:"mentions,omitempty"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	if req.Body == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "body is required"})
		return
	}

	msg := &domain.Message{
		ChannelID:  channelID,
		Body:       req.Body,
		BodyFormat: domain.MessageFormat(req.BodyFormat),
	}
	if req.ParentMessageID != "" {
		id, err := uuid.Parse(req.ParentMessageID)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid parent_message_id"})
			return
		}
		msg.ParentMessageID = &id
	}
	for _, m := range req.Mentions {
		id, err := uuid.Parse(m)
		if err != nil {
			continue
		}
		msg.Mentions = append(msg.Mentions, id)
	}

	if err := h.messageSvc.SendMessage(r.Context(), msg); err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, msg)
}

func (h *RESTHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	var before *uuid.UUID
	if b := r.URL.Query().Get("before"); b != "" {
		id, err := uuid.Parse(b)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid before cursor"})
			return
		}
		before = &id
	}

	messages, err := h.messageSvc.ListMessages(r.Context(), channelID, before, limit)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, messages)
}

func (h *RESTHandler) EditMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	var req struct {
		Body       string `json:"body"`
		BodyFormat string `json:"body_format"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	msg, err := h.messageSvc.EditMessage(r.Context(), messageID, req.Body, domain.MessageFormat(req.BodyFormat))
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, msg)
}

func (h *RESTHandler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	if err := h.messageSvc.DeleteMessage(r.Context(), messageID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) ListThread(w http.ResponseWriter, r *http.Request) {
	parentID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	messages, total, err := h.messageSvc.ListThread(r.Context(), parentID, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ListResponse{Data: messages, Total: total, Limit: limit, Offset: offset})
}

func (h *RESTHandler) SearchMessages(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	query := r.URL.Query().Get("q")
	if query == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "query is required"})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	messages, total, err := h.messageSvc.SearchMessages(r.Context(), channelID, query, limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ListResponse{Data: messages, Total: total, Limit: limit, Offset: offset})
}

// ─── Reaction Handlers ────────────────────────

func (h *RESTHandler) ToggleReaction(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	var req struct {
		Emoji string `json:"emoji"`
	}
	if err := parseBody(r, &req); err != nil || req.Emoji == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "emoji is required"})
		return
	}
	added, err := h.messageSvc.ToggleReaction(r.Context(), messageID, req.Emoji)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"added": added})
}

// ─── Pin Handlers ─────────────────────────────

func (h *RESTHandler) ListPins(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	pins, err := h.messageSvc.ListPins(r.Context(), channelID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, pins)
}

func (h *RESTHandler) PinMessage(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	if err := h.messageSvc.PinMessage(r.Context(), channelID, messageID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) UnpinMessage(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	if err := h.messageSvc.UnpinMessage(r.Context(), channelID, messageID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Forward Handler ──────────────────────────

func (h *RESTHandler) ForwardMessage(w http.ResponseWriter, r *http.Request) {
	sourceID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	var req struct {
		TargetChannelID string `json:"target_channel_id"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	targetID, err := uuid.Parse(req.TargetChannelID)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid target_channel_id"})
		return
	}
	msg, err := h.messageSvc.ForwardMessage(r.Context(), sourceID, targetID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, msg)
}

// ─── Bookmark Handlers ────────────────────────

func (h *RESTHandler) AddBookmark(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	var req struct {
		Note string `json:"note"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	if err := h.messageSvc.AddBookmark(r.Context(), messageID, req.Note); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) RemoveBookmark(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
		return
	}
	if err := h.messageSvc.RemoveBookmark(r.Context(), messageID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) ListBookmarks(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	bookmarks, total, err := h.messageSvc.ListBookmarks(r.Context(), limit, offset)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, ListResponse{Data: bookmarks, Total: total, Limit: limit, Offset: offset})
}

// ─── Sidebar Handler ──────────────────────────

func (h *RESTHandler) GetSidebar(w http.ResponseWriter, r *http.Request) {
	sidebar, err := h.sidebarSvc.GetSidebar(r.Context())
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, sidebar)
}

// ─── User Search Handler ──────────────────────

func (h *RESTHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}

	users, err := h.sidebarSvc.SearchOrgMembers(r.Context(), query, limit)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, users)
}

// ─── Presence Handler ─────────────────────────

func (h *RESTHandler) GetPresence(w http.ResponseWriter, r *http.Request) {
	orgID := tenant.OrgID(r.Context())
	online, err := h.presenceSvc.GetOnlineUsers(r.Context(), orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"online_users": online})
}

// ─── Upload Handler ───────────────────────────

func (h *RESTHandler) UploadFile(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}

	// Parse multipart form (max 50MB + overhead)
	if err := r.ParseMultipartForm(52 << 20); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file too large or invalid multipart form"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file is required"})
		return
	}
	defer file.Close()

	// Get or create a placeholder message for the attachment
	messageIDStr := r.FormValue("message_id")
	var messageID uuid.UUID
	if messageIDStr != "" {
		messageID, err = uuid.Parse(messageIDStr)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid message_id"})
			return
		}
	} else {
		// Create a placeholder message with the file
		body := r.FormValue("body")
		if body == "" {
			body = "📎 " + header.Filename
		}
		msg := &domain.Message{
			ChannelID:  channelID,
			Body:       body,
			BodyFormat: domain.MessageFormatText,
		}
		if err := h.messageSvc.SendMessage(r.Context(), msg); err != nil {
			Error(w, r, err)
			return
		}
		messageID = msg.ID
	}

	orgID := tenant.OrgID(r.Context())
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	att, err := h.uploadSvc.Upload(r.Context(), orgID, messageID, header.Filename, contentType, header.Size, file)
	if err != nil {
		Error(w, r, err)
		return
	}

	JSON(w, http.StatusCreated, att)
}

// ─── Attachment URL Handler ───────────────────

func (h *RESTHandler) GetAttachmentURL(w http.ResponseWriter, r *http.Request) {
	attachmentID, err := uuid.Parse(chi.URLParam(r, "attachmentID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid attachment_id"})
		return
	}
	att, err := h.uploadSvc.GetAttachmentURL(r.Context(), attachmentID)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, att)
}

// ─── Category Handlers ───────────────────────

func (h *RESTHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.categorySvc.List(r.Context())
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, categories)
}

func (h *RESTHandler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Position int    `json:"position"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	if req.Name == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "name is required"})
		return
	}
	cat, err := h.categorySvc.Create(r.Context(), req.Name, req.Position)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, cat)
}

func (h *RESTHandler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	categoryID, err := uuid.Parse(chi.URLParam(r, "categoryID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid category_id"})
		return
	}
	var req struct {
		Name     string `json:"name"`
		Position int    `json:"position"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	if err := h.categorySvc.Update(r.Context(), categoryID, req.Name, req.Position); err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "category updated"})
}

func (h *RESTHandler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	categoryID, err := uuid.Parse(chi.URLParam(r, "categoryID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid category_id"})
		return
	}
	if err := h.categorySvc.Delete(r.Context(), categoryID); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RESTHandler) ToggleCategoryCollapsed(w http.ResponseWriter, r *http.Request) {
	categoryID, err := uuid.Parse(chi.URLParam(r, "categoryID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid category_id"})
		return
	}
	var req struct {
		Collapsed bool `json:"collapsed"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	if err := h.categorySvc.ToggleCollapsed(r.Context(), categoryID, req.Collapsed); err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "category state updated"})
}

func (h *RESTHandler) SetChannelCategory(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid channel_id"})
		return
	}
	var req struct {
		CategoryID *string `json:"category_id"`
		Position   int     `json:"position"`
	}
	if err := parseBody(r, &req); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request body"})
		return
	}
	var catID *uuid.UUID
	if req.CategoryID != nil && *req.CategoryID != "" {
		parsed, err := uuid.Parse(*req.CategoryID)
		if err != nil {
			JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid category_id"})
			return
		}
		catID = &parsed
	}
	if err := h.categorySvc.SetChannelCategory(r.Context(), channelID, catID, req.Position); err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "channel category updated"})
}
