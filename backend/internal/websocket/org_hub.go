package websocket

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"nhooyr.io/websocket"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/eventbus"
)

// ─── OrgConn ──────────────────────────────────

// maxConsecutiveDrops is the number of consecutive dropped messages before
// a connection is considered unresponsive and force-closed.
const maxConsecutiveDrops = 10

// OrgConn represents a single WebSocket connection scoped to an org.
type OrgConn struct {
	UserID    uuid.UUID
	OrgID     uuid.UUID
	Conn      *websocket.Conn
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once

	projectsMu sync.RWMutex
	projects   map[uuid.UUID]struct{}

	dropCount int32 // atomic: consecutive messages dropped due to full buffer
}

// NewOrgConn creates a new OrgConn with initialized channels.
func NewOrgConn(userID, orgID uuid.UUID, conn *websocket.Conn, bufSize int) *OrgConn {
	return &OrgConn{
		UserID:   userID,
		OrgID:    orgID,
		Conn:     conn,
		send:     make(chan []byte, bufSize),
		done:     make(chan struct{}),
		projects: make(map[uuid.UUID]struct{}),
	}
}

func (c *OrgConn) Close() {
	c.closeOnce.Do(func() { close(c.done) })
}

// JoinProject subscribes this connection to a project room.
func (c *OrgConn) JoinProject(id uuid.UUID) {
	c.projectsMu.Lock()
	c.projects[id] = struct{}{}
	c.projectsMu.Unlock()
}

// LeaveProject unsubscribes this connection from a project room.
func (c *OrgConn) LeaveProject(id uuid.UUID) {
	c.projectsMu.Lock()
	delete(c.projects, id)
	c.projectsMu.Unlock()
}

// InProject returns true if the connection is subscribed to the given project.
func (c *OrgConn) InProject(id uuid.UUID) bool {
	c.projectsMu.RLock()
	_, ok := c.projects[id]
	c.projectsMu.RUnlock()
	return ok
}

// ─── OrgHub ───────────────────────────────────

// OrgHub manages WebSocket connections scoped to orgs with optional project rooms.
type OrgHub struct {
	orgs       map[uuid.UUID]map[*OrgConn]struct{} // orgID → set of connections
	mu         sync.RWMutex
	subscriber *eventbus.RedisSubscriber
}

// NewOrgHub creates a new OrgHub.
func NewOrgHub(subscriber *eventbus.RedisSubscriber) *OrgHub {
	return &OrgHub{
		orgs:       make(map[uuid.UUID]map[*OrgConn]struct{}),
		subscriber: subscriber,
	}
}

// Start subscribes to the Redis event bus and broadcasts events to org connections.
func (h *OrgHub) Start(ctx context.Context) error {
	log.Info().Msg("OrgHub started — listening for events")
	return h.subscriber.SubscribeAll(ctx, func(event domain.DomainEvent) {
		orgID, err := uuid.Parse(event.OrgID)
		if err != nil {
			return
		}
		data, err := json.Marshal(event)
		if err != nil {
			return
		}
		msg := WSMessage{
			Action:  "event:" + event.Type,
			Payload: data,
		}
		h.BroadcastOrg(orgID, msg, nil)
	})
}

// Join adds a connection to an org room.
func (h *OrgHub) Join(conn *OrgConn) {
	h.mu.Lock()
	if h.orgs[conn.OrgID] == nil {
		h.orgs[conn.OrgID] = make(map[*OrgConn]struct{})
	}
	h.orgs[conn.OrgID][conn] = struct{}{}
	h.mu.Unlock()

	log.Info().
		Str("user_id", conn.UserID.String()).
		Str("org_id", conn.OrgID.String()).
		Msg("ws: user joined org")
}

// Leave removes a connection from an org room.
func (h *OrgHub) Leave(conn *OrgConn) {
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
		Msg("ws: user left org")
}

// OrgSize returns the number of connections in an org.
func (h *OrgHub) OrgSize(orgID uuid.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.orgs[orgID])
}

// ProjectRoomSize returns the number of connections subscribed to a project.
func (h *OrgHub) ProjectRoomSize(orgID, projectID uuid.UUID) int {
	h.mu.RLock()
	conns := h.orgs[orgID]
	h.mu.RUnlock()

	count := 0
	for conn := range conns {
		if conn.InProject(projectID) {
			count++
		}
	}
	return count
}

// trySend attempts to send data to a connection. Returns true if sent, false if dropped.
// After maxConsecutiveDrops consecutive drops, force-closes the connection.
func (h *OrgHub) trySend(conn *OrgConn, data []byte, action string) bool {
	select {
	case conn.send <- data:
		atomic.StoreInt32(&conn.dropCount, 0)
		return true
	default:
		drops := atomic.AddInt32(&conn.dropCount, 1)
		log.Warn().Str("user_id", conn.UserID.String()).Str("action", action).
			Int32("consecutive_drops", drops).Msg("ws: send buffer full, dropping message")
		if drops >= maxConsecutiveDrops {
			log.Warn().Str("user_id", conn.UserID.String()).
				Msg("ws: too many consecutive drops — force-closing unresponsive connection")
			conn.Conn.Close(websocket.StatusGoingAway, "send buffer overflow")
			conn.Close()
		}
		return false
	}
}

// SendTo sends a message to a specific connection.
func (h *OrgHub) SendTo(conn *OrgConn, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Error().Err(err).Msg("ws: failed to marshal message")
		return
	}
	h.trySend(conn, data, msg.Action)
}

// BroadcastOrg sends a message to all connections in an org.
func (h *OrgHub) BroadcastOrg(orgID uuid.UUID, msg WSMessage, exclude *OrgConn) {
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
		h.trySend(conn, data, msg.Action)
	}
}

// BroadcastProject sends a message to connections subscribed to a specific project.
func (h *OrgHub) BroadcastProject(orgID, projectID uuid.UUID, msg WSMessage, exclude *OrgConn) {
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
		if !conn.InProject(projectID) {
			continue
		}
		h.trySend(conn, data, msg.Action)
	}
}

// WritePump sends queued messages to the WebSocket connection with periodic pings.
func OrgWritePump(ctx context.Context, conn *OrgConn) {
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
