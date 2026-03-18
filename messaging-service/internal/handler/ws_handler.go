package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	ws "nhooyr.io/websocket"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/middleware"
	"github.com/orbispm/messaging-service/internal/service"
	"github.com/orbispm/messaging-service/internal/websocket"
)

// WSHandler handles WebSocket connections for real-time chat.
type WSHandler struct {
	hub        *websocket.ChatHub
	channelSvc *service.ChannelService
	messageSvc *service.MessageService
}

// NewWSHandler creates a new WSHandler.
func NewWSHandler(
	hub *websocket.ChatHub,
	channelSvc *service.ChannelService,
	messageSvc *service.MessageService,
) *WSHandler {
	return &WSHandler{
		hub:        hub,
		channelSvc: channelSvc,
		messageSvc: messageSvc,
	}
}

// ServeWS upgrades to WebSocket and runs the read/write pump.
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	if userID == uuid.Nil || orgID == uuid.Nil {
		http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Clear HTTP server read/write deadlines for long-lived WS
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})

	c, err := ws.Accept(w, r, &ws.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		log.Error().Err(err).Msg("chat ws: accept failed")
		return
	}

	conn := websocket.NewChatConn(userID, orgID, c, 256)

	h.hub.Join(conn)
	defer h.hub.Leave(conn)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go websocket.WritePump(ctx, conn)

	// Send initial connection info
	h.hub.SendTo(conn, websocket.WSMessage{
		Action:  "connected",
		Payload: mustMarshal(map[string]any{"org_size": h.hub.OrgSize(orgID)}),
	})

	// Read pump
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			break
		}

		var msg websocket.WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			h.hub.SendTo(conn, websocket.WSMessage{
				Action: "error",
				Error:  "invalid message format",
			})
			continue
		}

		h.dispatch(ctx, conn, msg)
	}
}

func (h *WSHandler) dispatch(ctx context.Context, conn *websocket.ChatConn, msg websocket.WSMessage) {
	switch msg.Action {
	case "channel:join":
		h.handleChannelJoin(ctx, conn, msg)
	case "channel:leave":
		h.handleChannelLeave(conn, msg)
	case "message:send":
		h.handleMessageSend(ctx, conn, msg)
	case "typing:start":
		h.handleTyping(conn, msg, true)
	case "typing:stop":
		h.handleTyping(conn, msg, false)
	default:
		h.reply(conn, msg.ID, "error", nil, "unknown action: "+msg.Action)
	}
}

func (h *WSHandler) handleChannelJoin(ctx context.Context, conn *websocket.ChatConn, msg websocket.WSMessage) {
	var payload struct {
		ChannelID string `json:"channel_id"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		h.reply(conn, msg.ID, "error", nil, "invalid payload")
		return
	}
	channelID, err := uuid.Parse(payload.ChannelID)
	if err != nil {
		h.reply(conn, msg.ID, "error", nil, "invalid channel_id")
		return
	}

	// Verify membership
	if err := h.channelSvc.EnsureMember(ctx, channelID); err != nil {
		h.reply(conn, msg.ID, "error", nil, "not a member of this channel")
		return
	}

	conn.JoinChannel(channelID)
	h.reply(conn, msg.ID, "channel:joined", map[string]any{"channel_id": channelID}, "")

	log.Debug().
		Str("user_id", conn.UserID.String()).
		Str("channel_id", channelID.String()).
		Msg("chat ws: joined channel")
}

func (h *WSHandler) handleChannelLeave(conn *websocket.ChatConn, msg websocket.WSMessage) {
	var payload struct {
		ChannelID string `json:"channel_id"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		h.reply(conn, msg.ID, "error", nil, "invalid payload")
		return
	}
	channelID, err := uuid.Parse(payload.ChannelID)
	if err != nil {
		h.reply(conn, msg.ID, "error", nil, "invalid channel_id")
		return
	}
	conn.LeaveChannel(channelID)
	h.reply(conn, msg.ID, "channel:left", map[string]any{"channel_id": channelID}, "")
}

func (h *WSHandler) handleMessageSend(ctx context.Context, conn *websocket.ChatConn, msg websocket.WSMessage) {
	var payload struct {
		ChannelID       string   `json:"channel_id"`
		Body            string   `json:"body"`
		BodyFormat      string   `json:"body_format"`
		ParentMessageID string   `json:"parent_message_id,omitempty"`
		Mentions        []string `json:"mentions,omitempty"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		h.reply(conn, msg.ID, "error", nil, "invalid payload")
		return
	}

	channelID, err := uuid.Parse(payload.ChannelID)
	if err != nil {
		h.reply(conn, msg.ID, "error", nil, "invalid channel_id")
		return
	}

	if strings.TrimSpace(payload.Body) == "" {
		h.reply(conn, msg.ID, "error", nil, "message body is required")
		return
	}

	newMsg := &domain.Message{
		ChannelID:  channelID,
		Body:       payload.Body,
		BodyFormat: domain.MessageFormat(payload.BodyFormat),
	}
	if payload.ParentMessageID != "" {
		id, err := uuid.Parse(payload.ParentMessageID)
		if err == nil {
			newMsg.ParentMessageID = &id
		}
	}
	for _, m := range payload.Mentions {
		id, err := uuid.Parse(m)
		if err == nil {
			newMsg.Mentions = append(newMsg.Mentions, id)
		}
	}

	if err := h.messageSvc.SendMessage(ctx, newMsg); err != nil {
		errMsg := "failed to send message"
		if appErr, ok := domain.IsAppError(err); ok {
			errMsg = appErr.Message
		}
		h.reply(conn, msg.ID, "error", nil, errMsg)
		return
	}

	h.reply(conn, msg.ID, "message:sent", newMsg, "")
}

func (h *WSHandler) handleTyping(conn *websocket.ChatConn, msg websocket.WSMessage, isTyping bool) {
	var payload struct {
		ChannelID string `json:"channel_id"`
	}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	channelID, err := uuid.Parse(payload.ChannelID)
	if err != nil {
		return
	}

	eventType := domain.EventTypingStart
	if !isTyping {
		eventType = domain.EventTypingStop
	}

	// Broadcast to channel members (ephemeral, not persisted via NATS)
	h.hub.BroadcastChannel(conn.OrgID, channelID, websocket.WSMessage{
		Action:  "event:" + eventType,
		Payload: mustMarshal(domain.TypingIndicator{ChannelID: channelID, UserID: conn.UserID, IsTyping: isTyping}),
		ActorID: conn.UserID.String(),
	}, conn)
}

func (h *WSHandler) reply(conn *websocket.ChatConn, reqID, action string, payload any, errMsg string) {
	msg := websocket.WSMessage{ID: reqID, Action: action, Error: errMsg}
	if payload != nil {
		msg.Payload = mustMarshal(payload)
	}
	h.hub.SendTo(conn, msg)
}
