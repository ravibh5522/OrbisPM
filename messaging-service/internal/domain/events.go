package domain

// Event types for the messaging real-time system.
const (
	// Channel events.
	EventChannelCreated  = "channel.created"
	EventChannelUpdated  = "channel.updated"
	EventChannelArchived = "channel.archived"
	EventChannelDeleted  = "channel.deleted"

	// Channel member events.
	EventMemberJoined = "channel.member_joined"
	EventMemberLeft   = "channel.member_left"
	EventMemberKicked = "channel.member_kicked"
	EventRoleChanged  = "channel.role_changed"

	// Message events.
	EventMessageCreated  = "message.created"
	EventMessageEdited   = "message.edited"
	EventMessageDeleted  = "message.deleted"
	EventMessagePinned   = "message.pinned"
	EventMessageUnpinned = "message.unpinned"

	// Reaction events.
	EventReactionAdded   = "reaction.added"
	EventReactionRemoved = "reaction.removed"

	// Typing events (ephemeral — not persisted).
	EventTypingStart = "typing.start"
	EventTypingStop  = "typing.stop"

	// Read receipt events.
	EventReadReceipt = "read_receipt.updated"

	// Presence events.
	EventPresenceOnline  = "presence.online"
	EventPresenceOffline = "presence.offline"
)

// NATS JetStream subject patterns.
const (
	// NatsSubjectChat is the root subject for all chat events.
	// Format: chat.{org_id}.{event_type}
	NatsSubjectChat = "chat"

	// NatsStreamName is the JetStream stream for chat events.
	NatsStreamName = "CHAT"

	// NatsConsumerDurable is the durable consumer name for persistent delivery.
	NatsConsumerDurable = "chat-hub"
)

// DomainEvent carries event data through NATS and WebSocket.
type DomainEvent struct {
	Type      string         `json:"type"`
	OrgID     string         `json:"org_id"`
	ChannelID string         `json:"channel_id,omitempty"`
	ActorID   string         `json:"actor_id"`
	EntityID  string         `json:"entity_id"`
	Payload   map[string]any `json:"payload,omitempty"`
}
