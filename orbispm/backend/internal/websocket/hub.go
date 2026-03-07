package websocket

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/eventbus"
)

// Hub manages WebSocket connections and broadcasts events.
type Hub struct {
	// clients maps orgID -> userID -> connection
	clients    map[uuid.UUID]map[uuid.UUID]*Conn
	mu         sync.RWMutex
	subscriber *eventbus.RedisSubscriber
}

// Conn represents a WebSocket connection.
type Conn struct {
	UserID uuid.UUID
	OrgID  uuid.UUID
	send   chan []byte
	done   chan struct{}
	writer http.ResponseWriter
}

// NewHub creates a new WebSocket hub.
func NewHub(subscriber *eventbus.RedisSubscriber) *Hub {
	return &Hub{
		clients:    make(map[uuid.UUID]map[uuid.UUID]*Conn),
		subscriber: subscriber,
	}
}

// Start begins listening for events and broadcasting to connected clients.
func (h *Hub) Start(ctx context.Context) error {
	return h.subscriber.SubscribeAll(ctx, func(event domain.DomainEvent) {
		h.broadcast(event)
	})
}

// Register adds a client connection.
func (h *Hub) Register(userID, orgID uuid.UUID, w http.ResponseWriter) *Conn {
	conn := &Conn{
		UserID: userID,
		OrgID:  orgID,
		send:   make(chan []byte, 256),
		done:   make(chan struct{}),
		writer: w,
	}

	h.mu.Lock()
	if h.clients[orgID] == nil {
		h.clients[orgID] = make(map[uuid.UUID]*Conn)
	}
	h.clients[orgID][userID] = conn
	h.mu.Unlock()

	log.Info().Str("user_id", userID.String()).Str("org_id", orgID.String()).Msg("ws client registered")
	return conn
}

// Unregister removes a client connection.
func (h *Hub) Unregister(userID, orgID uuid.UUID) {
	h.mu.Lock()
	if orgClients, ok := h.clients[orgID]; ok {
		if conn, ok := orgClients[userID]; ok {
			close(conn.done)
			delete(orgClients, userID)
		}
		if len(orgClients) == 0 {
			delete(h.clients, orgID)
		}
	}
	h.mu.Unlock()

	log.Info().Str("user_id", userID.String()).Str("org_id", orgID.String()).Msg("ws client unregistered")
}

// broadcast sends an event to all connected clients in the relevant org.
func (h *Hub) broadcast(event domain.DomainEvent) {
	orgID, err := uuid.Parse(event.OrgID)
	if err != nil {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		log.Error().Err(err).Msg("failed to marshal event for broadcast")
		return
	}

	h.mu.RLock()
	orgClients := h.clients[orgID]
	h.mu.RUnlock()

	for _, conn := range orgClients {
		select {
		case conn.send <- data:
		default:
			log.Warn().Str("user_id", conn.UserID.String()).Msg("ws send buffer full, dropping event")
		}
	}
}

// SendCh returns the send channel for a connection.
func (c *Conn) SendCh() <-chan []byte {
	return c.send
}

// Done returns the done channel for a connection.
func (c *Conn) Done() <-chan struct{} {
	return c.done
}

// ConnectedClients returns the number of connected clients.
func (h *Hub) ConnectedClients() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	total := 0
	for _, orgClients := range h.clients {
		total += len(orgClients)
	}
	return total
}

// SSEHandler handles Server-Sent Events connections as a simpler alternative to full WS.
func (h *Hub) SSEHandler(userID, orgID uuid.UUID, w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// Clear HTTP server read/write deadlines so the long-lived SSE isn't killed.
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	conn := h.Register(userID, orgID, w)
	defer h.Unregister(userID, orgID)

	// Send a keepalive ping every 30 seconds
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-conn.Done():
			return
		case msg := <-conn.send:
			_, _ = w.Write([]byte("data: "))
			_, _ = w.Write(msg)
			_, _ = w.Write([]byte("\n\n"))
			flusher.Flush()
		case <-ticker.C:
			_, _ = w.Write([]byte(": keepalive\n\n"))
			flusher.Flush()
		}
	}
}
