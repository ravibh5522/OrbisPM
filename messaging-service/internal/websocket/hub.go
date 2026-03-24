package websocket

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"nhooyr.io/websocket"

	"github.com/orbispm/messaging-service/internal/domain"
)

// WSMessage is the JSON envelope for all WebSocket communication.
type WSMessage struct {
	ID      string          `json:"id,omitempty"`
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Error   string          `json:"error,omitempty"`
	ActorID string          `json:"actor_id,omitempty"`
}

// ChatConn represents a single WebSocket connection to the chat system.
type ChatConn struct {
	UserID uuid.UUID
	OrgID  uuid.UUID
	Conn   *websocket.Conn
	send   chan []byte
	done   chan struct{}

	channelsMu sync.RWMutex
	channels   map[uuid.UUID]struct{}
	closeOnce  sync.Once
}

// NewChatConn creates a new ChatConn with initialized channels.
func NewChatConn(userID, orgID uuid.UUID, conn *websocket.Conn, bufSize int) *ChatConn {
	return &ChatConn{
		UserID:   userID,
		OrgID:    orgID,
		Conn:     conn,
		send:     make(chan []byte, bufSize),
		done:     make(chan struct{}),
		channels: make(map[uuid.UUID]struct{}),
	}
}

func (c *ChatConn) Close() {
	c.closeOnce.Do(func() { close(c.done) })
}

// JoinChannel subscribes this connection to a channel room.
func (c *ChatConn) JoinChannel(id uuid.UUID) {
	c.channelsMu.Lock()
	c.channels[id] = struct{}{}
	c.channelsMu.Unlock()
}

// LeaveChannel unsubscribes this connection from a channel room.
func (c *ChatConn) LeaveChannel(id uuid.UUID) {
	c.channelsMu.Lock()
	delete(c.channels, id)
	c.channelsMu.Unlock()
}

// InChannel returns true if the connection is subscribed to the given channel.
func (c *ChatConn) InChannel(id uuid.UUID) bool {
	c.channelsMu.RLock()
	_, ok := c.channels[id]
	c.channelsMu.RUnlock()
	return ok
}

// SubscribedChannels returns a snapshot of all subscribed channel IDs.
func (c *ChatConn) SubscribedChannels() []uuid.UUID {
	c.channelsMu.RLock()
	defer c.channelsMu.RUnlock()
	ids := make([]uuid.UUID, 0, len(c.channels))
	for id := range c.channels {
		ids = append(ids, id)
	}
	return ids
}

// ─── ChatHub ───────────────────────────────────

// ChatHub manages WebSocket connections scoped to orgs with channel rooms.
type ChatHub struct {
	orgs map[uuid.UUID]map[*ChatConn]struct{} // orgID → set of connections
	mu   sync.RWMutex
}

// NewChatHub creates a new ChatHub.
func NewChatHub() *ChatHub {
	return &ChatHub{
		orgs: make(map[uuid.UUID]map[*ChatConn]struct{}),
	}
}

// HandleEvent processes a domain event from NATS and broadcasts to relevant connections.
func (h *ChatHub) HandleEvent(event domain.DomainEvent) {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		log.Warn().Str("org_id", event.OrgID).Msg("chat hub: invalid org_id in event")
		return
	}
	channelID, _ := uuid.Parse(event.ChannelID)

	// Extract the actual data from the event payload (unwrap {"data": ...} wrapper)
	var payloadData any = event.Payload
	if event.Payload != nil {
		if d, ok := event.Payload["data"]; ok {
			payloadData = d
		}
	}

	// Inject channel_id and entity_id into map payloads for frontend routing
	if pm, ok := payloadData.(map[string]any); ok {
		if event.ChannelID != "" {
			if _, exists := pm["channel_id"]; !exists {
				pm["channel_id"] = event.ChannelID
			}
		}
		if event.EntityID != "" {
			if _, exists := pm["entity_id"]; !exists {
				pm["entity_id"] = event.EntityID
			}
		}
	}

	data, err := json.Marshal(payloadData)
	if err != nil {
		return
	}
	msg := WSMessage{
		Action:  "event:" + event.Type,
		Payload: data,
		ActorID: event.ActorID,
	}

	if channelID != uuid.Nil {
		log.Debug().
			Str("type", event.Type).
			Str("org_id", event.OrgID).
			Str("channel_id", event.ChannelID).
			Msg("chat hub: broadcasting to channel")
		h.BroadcastChannel(orgID, channelID, msg, nil)
	} else {
		log.Debug().
			Str("type", event.Type).
			Str("org_id", event.OrgID).
			Msg("chat hub: broadcasting to org")
		h.BroadcastOrg(orgID, msg, nil)
	}
}

// Join adds a connection to an org room.
func (h *ChatHub) Join(conn *ChatConn) {
	h.mu.Lock()
	if h.orgs[conn.OrgID] == nil {
		h.orgs[conn.OrgID] = make(map[*ChatConn]struct{})
	}
	h.orgs[conn.OrgID][conn] = struct{}{}
	h.mu.Unlock()
	log.Info().
		Str("user_id", conn.UserID.String()).
		Str("org_id", conn.OrgID.String()).
		Msg("chat: user connected")
}

// Leave removes a connection.
func (h *ChatHub) Leave(conn *ChatConn) {
	h.mu.Lock()
	if room, ok := h.orgs[conn.OrgID]; ok {
		delete(room, conn)
		if len(room) == 0 {
			delete(h.orgs, conn.OrgID)
		}
	}
	h.mu.Unlock()
	conn.Close()
	log.Info().
		Str("user_id", conn.UserID.String()).
		Str("org_id", conn.OrgID.String()).
		Msg("chat: user disconnected")
}

// OrgSize returns the number of connections in an org.
func (h *ChatHub) OrgSize(orgID uuid.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.orgs[orgID])
}

// SendTo sends a message to a specific connection.
func (h *ChatHub) SendTo(conn *ChatConn, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Error().Err(err).Msg("chat: failed to marshal message")
		return
	}
	select {
	case conn.send <- data:
	default:
		log.Warn().Str("user_id", conn.UserID.String()).Msg("chat: send buffer full, dropping message")
	}
}

// BroadcastOrg sends a message to all connections in an org (org-level events like channel created/deleted).
func (h *ChatHub) BroadcastOrg(orgID uuid.UUID, msg WSMessage, exclude *ChatConn) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	conns := h.orgs[orgID]
	h.mu.RUnlock()
	for conn := range conns {
		if conn == exclude {
			continue
		}
		select {
		case conn.send <- data:
		default:
			log.Warn().Str("user_id", conn.UserID.String()).Str("action", msg.Action).Msg("chat: BroadcastOrg send buffer full, dropping message")
		}
	}
}

// BroadcastChannel sends a message to connections subscribed to a specific channel.
func (h *ChatHub) BroadcastChannel(orgID, channelID uuid.UUID, msg WSMessage, exclude *ChatConn) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	conns := h.orgs[orgID]
	h.mu.RUnlock()
	for conn := range conns {
		if conn == exclude {
			continue
		}
		if !conn.InChannel(channelID) {
			continue
		}
		select {
		case conn.send <- data:
		default:
			log.Warn().Str("user_id", conn.UserID.String()).Str("action", msg.Action).Str("channel_id", channelID.String()).Msg("chat: BroadcastChannel send buffer full, dropping message")
		}
	}
}

// BroadcastToUser sends a message to all connections of a specific user in an org.
func (h *ChatHub) BroadcastToUser(orgID, userID uuid.UUID, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	conns := h.orgs[orgID]
	h.mu.RUnlock()
	for conn := range conns {
		if conn.UserID != userID {
			continue
		}
		select {
		case conn.send <- data:
		default:
		}
	}
}

// WritePump sends queued messages to the WebSocket connection with periodic pings.
func WritePump(ctx context.Context, conn *ChatConn) {
	defer conn.Conn.Close(websocket.StatusNormalClosure, "")
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-conn.done:
			return
		case data := <-conn.send:
			if err := conn.Conn.Write(ctx, websocket.MessageText, data); err != nil {
				return
			}
		case <-pingTicker.C:
			if err := conn.Conn.Ping(ctx); err != nil {
				return
			}
		}
	}
}
