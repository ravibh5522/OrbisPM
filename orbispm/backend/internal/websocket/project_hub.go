package websocket

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"nhooyr.io/websocket"
)

// WSMessage is the JSON envelope for all WebSocket communication.
type WSMessage struct {
	ID      string          `json:"id,omitempty"`       // Request ID (client→server, server→sender)
	Action  string          `json:"action"`             // e.g. "task:create", "task:updated"
	Payload json.RawMessage `json:"payload,omitempty"`  // Action-specific data
	Error   string          `json:"error,omitempty"`    // Error message (server→client)
	ActorID string          `json:"actor_id,omitempty"` // Who made the change (broadcast only)
}

// ProjectConn represents a single WebSocket connection to a project room.
type ProjectConn struct {
	UserID    uuid.UUID
	OrgID     uuid.UUID
	ProjectID uuid.UUID
	Conn      *websocket.Conn
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
}

// NewProjectConn creates a new ProjectConn with initialized channels.
func NewProjectConn(userID, orgID, projectID uuid.UUID, conn *websocket.Conn, bufSize int) *ProjectConn {
	return &ProjectConn{
		UserID:    userID,
		OrgID:     orgID,
		ProjectID: projectID,
		Conn:      conn,
		send:      make(chan []byte, bufSize),
		done:      make(chan struct{}),
	}
}

func (c *ProjectConn) Close() {
	c.closeOnce.Do(func() { close(c.done) })
}

// ProjectHub manages WebSocket connections scoped to project rooms.
type ProjectHub struct {
	// rooms maps projectID → set of connections
	rooms map[uuid.UUID]map[*ProjectConn]struct{}
	mu    sync.RWMutex
}

// NewProjectHub creates a new ProjectHub.
func NewProjectHub() *ProjectHub {
	return &ProjectHub{
		rooms: make(map[uuid.UUID]map[*ProjectConn]struct{}),
	}
}

// Join adds a connection to a project room.
func (h *ProjectHub) Join(conn *ProjectConn) {
	h.mu.Lock()
	if h.rooms[conn.ProjectID] == nil {
		h.rooms[conn.ProjectID] = make(map[*ProjectConn]struct{})
	}
	h.rooms[conn.ProjectID][conn] = struct{}{}
	h.mu.Unlock()

	log.Info().
		Str("user_id", conn.UserID.String()).
		Str("project_id", conn.ProjectID.String()).
		Int("room_size", h.RoomSize(conn.ProjectID)).
		Msg("ws: user joined project room")
}

// Leave removes a connection from a project room.
func (h *ProjectHub) Leave(conn *ProjectConn) {
	h.mu.Lock()
	if room, ok := h.rooms[conn.ProjectID]; ok {
		delete(room, conn)
		if len(room) == 0 {
			delete(h.rooms, conn.ProjectID)
		}
	}
	h.mu.Unlock()

	conn.Close()
	log.Info().
		Str("user_id", conn.UserID.String()).
		Str("project_id", conn.ProjectID.String()).
		Msg("ws: user left project room")
}

// RoomSize returns the number of connections in a project room.
func (h *ProjectHub) RoomSize(projectID uuid.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[projectID])
}

// SendTo sends a message to a specific connection.
func (h *ProjectHub) SendTo(conn *ProjectConn, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Error().Err(err).Msg("ws: failed to marshal message")
		return
	}
	select {
	case conn.send <- data:
	default:
		log.Warn().Str("user_id", conn.UserID.String()).Msg("ws: send buffer full, dropping message")
	}
}

// Broadcast sends a message to all connections in a project room except the sender.
func (h *ProjectHub) Broadcast(projectID uuid.UUID, msg WSMessage, exclude *ProjectConn) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Error().Err(err).Msg("ws: failed to marshal broadcast")
		return
	}

	h.mu.RLock()
	room := h.rooms[projectID]
	h.mu.RUnlock()

	for conn := range room {
		if conn == exclude {
			continue
		}
		select {
		case conn.send <- data:
		default:
			log.Warn().Str("user_id", conn.UserID.String()).Msg("ws: broadcast buffer full, dropping")
		}
	}
}

// BroadcastAll sends a message to all connections in a project room (including sender).
func (h *ProjectHub) BroadcastAll(projectID uuid.UUID, msg WSMessage) {
	h.Broadcast(projectID, msg, nil)
}

// WritePump sends queued messages to the WebSocket connection.
// It also sends periodic pings to keep the connection alive through proxies.
// Runs as a goroutine per connection.
func WritePump(ctx context.Context, conn *ProjectConn) {
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
