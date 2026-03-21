# OrbisPM — Messaging System Architecture

> Real-time messaging for 10,000+ concurrent users with 1:1, group, team, and project conversations.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Requirements](#2-requirements)
3. [Technology Recommendation](#3-technology-recommendation)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [Channel Types & Auto-Creation](#6-channel-types--auto-creation)
7. [Real-Time Message Flow](#7-real-time-message-flow)
8. [Feature Implementation](#8-feature-implementation)
9. [Scalability Plan (10K → 100K)](#9-scalability-plan-10k--100k)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Security & Multi-Tenancy](#11-security--multi-tenancy)
12. [Deployment & Infrastructure](#12-deployment--infrastructure)
13. [Migration Plan (Phased)](#13-migration-plan-phased)
14. [Cost & Resource Estimates](#14-cost--resource-estimates)

---

## 1. Executive Summary

Build messaging **inside the existing OrbisPM monolith** (Option A), reusing the current Go backend, PostgreSQL (RLS), Redis Pub/Sub, and WebSocket infrastructure. This avoids a separate microservice, eliminates cross-service auth complexity, and leverages the proven 4-layer DAO pattern.

**Why not a separate chat microservice?**

- The existing `chat-service/` directory is empty — no code to preserve.
- At 10K concurrent connections, a single Go process handles this easily (Go routines are ~2KB each; 10K = ~20MB RAM for connections alone).
- The existing OrgHub WebSocket already manages per-org connections with project rooms — extending to chat rooms is minimal work.
- Shared DB means RLS tenant isolation works automatically.
- When you hit 100K+, you can extract chat into a microservice later (the interface-based architecture makes this easy).

**Recommended Stack Addition:**
| Component | Choice | Why |
|-----------|--------|-----|
| Real-time transport | Existing nhooyr.io/websocket + OrgHub | Already handles 256-buffered sends, project rooms |
| Message persistence | PostgreSQL (same DB, new tables) | RLS isolation, JSONB metadata, same TxManager |
| Message cache | Redis (hot messages) | Already used for Pub/Sub + Asynq |
| File uploads | MinIO (existing) | Pre-signed URLs, same pattern as attachments |
| Search | Meilisearch (existing) | Full-text message search within org |
| Push notifications | Asynq background jobs → Email Service + Web Push | Existing worker infrastructure |
| Typing indicators | Redis Pub/Sub (ephemeral) | No persistence needed |

---

## 2. Requirements

### Core Features

| Feature               | Priority | Description                                                     |
| --------------------- | -------- | --------------------------------------------------------------- |
| 1:1 DMs               | P0       | Private conversations between two org members                   |
| Custom Groups         | P0       | User-created group conversations (invite-based)                 |
| Team Channels         | P0       | Auto-created when team is created; all team members auto-joined |
| Project Sub-Channels  | P0       | Auto-created under team channel when project is created         |
| Send/Receive Messages | P0       | Real-time text messages with delivery confirmation              |
| Reply (Thread)        | P0       | Reply to specific message, threaded view                        |
| Edit Message          | P0       | Edit own messages (within time window)                          |
| Delete Message        | P0       | Soft-delete own messages, admins can delete any                 |
| @Mention              | P0       | Tag users, trigger notification                                 |
| Emoji Reactions       | P1       | React to messages with emoji                                    |
| File Attachments      | P1       | Upload images, docs, files via MinIO                            |
| Forward Message       | P1       | Forward to another channel/DM                                   |
| Read Receipts         | P1       | Last-read cursor per user per channel                           |
| Typing Indicators     | P1       | Ephemeral "user is typing"                                      |
| Message Search        | P2       | Full-text search within org messages                            |
| Pinned Messages       | P2       | Pin important messages in a channel                             |
| Bookmarks             | P2       | User's personal bookmarked messages                             |
| Link Previews         | P2       | URL unfurling with OG metadata                                  |
| Voice/Video Calls     | P3       | Future — integrate Livekit or similar                           |

### Non-Functional Requirements

| Requirement                      | Target                                |
| -------------------------------- | ------------------------------------- |
| Concurrent WebSocket connections | 10,000 (initial), 100K (future)       |
| Message delivery latency         | < 100ms (same region)                 |
| Message persistence              | Indefinite (PostgreSQL)               |
| Hot message cache                | Last 100 messages per channel (Redis) |
| File upload max size             | 50MB                                  |
| Max channel members              | 10,000 (org-wide broadcast)           |
| API rate limit                   | 60 messages/min per user              |

---

## 3. Technology Recommendation

### Why Stay With Go + PostgreSQL (Not NATS/Centrifugo/Kafka)

| Option                               | Verdict            | Reason                                                                                                     |
| ------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Centrifugo**                       | ❌ Skip for now    | Adds operational complexity. Your Go WebSocket hub already does the job at 10K scale. Re-evaluate at 50K+. |
| **NATS**                             | ❌ Skip for now    | Great for microservice pub/sub, but Redis already serves this role. NATS adds another moving part.         |
| **Kafka**                            | ❌ Overkill        | Designed for millions of events/sec. You need 10K concurrent users, not 10M events/sec.                    |
| **Socket.io**                        | ❌ Wrong ecosystem | Node.js library. You're on Go.                                                                             |
| **Go + nhooyr.io/websocket + Redis** | ✅ Use this        | You already have it. Proven at 10K. Add chat rooms to existing OrgHub.                                     |

### When to Scale Out

| Scale            | Approach                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| 0–10K concurrent | Single Go process, PostgreSQL, Redis                                                                           |
| 10K–50K          | Add read replicas (PostgreSQL), Redis Cluster, multiple Go instances behind load balancer with sticky sessions |
| 50K–100K         | Extract chat into separate service, add Centrifugo or NATS for fan-out, partition messages by org              |
| 100K+            | Shard PostgreSQL by org_id (Citus), dedicate WebSocket edge nodes, add Kafka for event streaming               |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENTS (Browser)                          │
│  Next.js 15 + React 19 + useChatSocket hook + Zustand chat store  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ WSS + HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      KONG API GATEWAY                              │
│  /api/v1/orgs/{orgId}/ws  →  backend:8080 (WebSocket upgrade)     │
│  /api/v1/chat/**          →  backend:8080 (REST)                  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   GO BACKEND (Single Process)                      │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │ OrgHub   │  │ ChatHandler  │  │ ChatService  │                 │
│  │ (WS Mgr) │  │ (REST API)   │  │ (Biz Logic)  │                 │
│  │          │←─│              │──▶│              │                 │
│  │ Per-Org  │  │ • Send msg   │  │ • Validate   │                 │
│  │ Per-Chan │  │ • History    │  │ • Persist     │                 │
│  │ Rooms    │  │ • Channels   │  │ • Broadcast   │                 │
│  │          │  │ • Search     │  │ • Index       │                 │
│  └────┬─────┘  └──────────────┘  └──────┬───────┘                 │
│       │                                  │                         │
│       ▼                                  ▼                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  Redis   │  │ PostgreSQL   │  │  Meilisearch │                 │
│  │ Pub/Sub  │  │ (RLS)        │  │  (FT Search) │                 │
│  │ + Cache  │  │ Messages +   │  │              │                 │
│  │ + Typing │  │ Channels +   │  └──────────────┘                 │
│  │          │  │ Reactions    │                                    │
│  └──────────┘  └──────────────┘  ┌──────────────┐                 │
│                                  │    MinIO      │                 │
│  ┌──────────┐                    │ File Uploads  │                 │
│  │  Asynq   │                    └──────────────┘                 │
│  │ Workers  │                                                      │
│  │ • Push   │                                                      │
│  │ • Index  │                                                      │
│  │ • Unfurl │                                                      │
│  └──────────┘                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Extended OrgHub Design

The current OrgHub manages connections per-org with optional project rooms. Extend it to also support **chat channel rooms**:

```go
type OrgConn struct {
    UserID    uuid.UUID
    OrgID     uuid.UUID
    Conn      *websocket.Conn
    projects  map[uuid.UUID]struct{}    // existing
    channels  map[uuid.UUID]struct{}    // NEW: chat channel subscriptions
    send      chan []byte               // existing buffered channel (256)
}

// New dispatch actions:
// "channel:join"    — subscribe to channel messages
// "channel:leave"   — unsubscribe
// "message:send"    — send message to channel
// "message:edit"    — edit own message
// "message:delete"  — delete message
// "message:react"   — add/remove reaction
// "typing:start"    — ephemeral typing indicator
// "typing:stop"     — stop typing
```

---

## 5. Database Schema

### Migration: `000019_messaging.up.sql`

```sql
-- ============================================================
-- CHANNELS: Represents a conversation (DM, group, team, project)
-- ============================================================
CREATE TABLE channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    type            TEXT NOT NULL CHECK (type IN ('dm', 'group', 'team', 'project')),

    -- For team/project auto-channels
    team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Channel settings
    is_archived     BOOLEAN NOT NULL DEFAULT false,
    metadata        JSONB NOT NULL DEFAULT '{}',

    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_channels_org_id ON channels(org_id);
CREATE INDEX idx_channels_org_type ON channels(org_id, type);
CREATE INDEX idx_channels_team ON channels(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_channels_project ON channels(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX idx_channels_dm_pair ON channels(org_id, type, (metadata->>'dm_pair'))
    WHERE type = 'dm';

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY channels_org_isolation ON channels
    USING (org_id::text = current_setting('app.current_org_id', true));

-- ============================================================
-- CHANNEL MEMBERS: Who is in which channel + their settings
-- ============================================================
CREATE TABLE channel_members (
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

    -- Per-user channel state
    last_read_at    TIMESTAMPTZ,
    is_muted        BOOLEAN NOT NULL DEFAULT false,
    is_pinned       BOOLEAN NOT NULL DEFAULT false,

    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_channel_members_user ON channel_members(user_id);
CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);

-- ============================================================
-- MESSAGES: The actual chat messages
-- ============================================================
CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    channel_id          UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,

    -- Content
    body                TEXT NOT NULL,
    body_format         TEXT NOT NULL DEFAULT 'text' CHECK (body_format IN ('text', 'markdown', 'html')),

    -- Threading
    parent_message_id   UUID REFERENCES messages(id) ON DELETE SET NULL,
    thread_count        INT NOT NULL DEFAULT 0,

    -- Forwarding
    forwarded_from_id   UUID REFERENCES messages(id) ON DELETE SET NULL,

    -- Mentions (extracted on write for fast notification)
    mentions            UUID[] DEFAULT '{}',

    -- Flexible metadata (link previews, custom data)
    metadata            JSONB NOT NULL DEFAULT '{}',

    -- Soft delete
    is_deleted          BOOLEAN NOT NULL DEFAULT false,
    deleted_at          TIMESTAMPTZ,

    -- Edit tracking
    is_edited           BOOLEAN NOT NULL DEFAULT false,
    edited_at           TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_channel_time ON messages(org_id, channel_id, created_at DESC);
CREATE INDEX idx_messages_thread ON messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_mentions ON messages USING GIN(mentions);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_org_isolation ON messages
    USING (org_id::text = current_setting('app.current_org_id', true));

-- ============================================================
-- MESSAGE REACTIONS: Emoji reactions on messages
-- ============================================================
CREATE TABLE message_reactions (
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    emoji           TEXT NOT NULL,      -- Unicode emoji or shortcode
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON message_reactions(message_id);

-- ============================================================
-- MESSAGE ATTACHMENTS: Files attached to messages
-- ============================================================
CREATE TABLE message_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,

    file_name       TEXT NOT NULL,
    file_size       BIGINT NOT NULL,
    content_type    TEXT NOT NULL,
    storage_key     TEXT NOT NULL,       -- MinIO object key

    metadata        JSONB NOT NULL DEFAULT '{}',    -- width, height for images; duration for audio

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_msg_attachments_message ON message_attachments(message_id);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY msg_attachments_org_isolation ON message_attachments
    USING (org_id::text = current_setting('app.current_org_id', true));

-- ============================================================
-- PINNED MESSAGES: Per-channel pinned messages
-- ============================================================
CREATE TABLE pinned_messages (
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by       UUID NOT NULL,
    pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (channel_id, message_id)
);

-- ============================================================
-- USER BOOKMARKS: Personal saved messages
-- ============================================================
CREATE TABLE message_bookmarks (
    user_id         UUID NOT NULL,
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    note            TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, message_id)
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get or create a DM channel between two users
CREATE OR REPLACE FUNCTION get_or_create_dm_channel(
    p_org_id UUID,
    p_user_a UUID,
    p_user_b UUID
) RETURNS UUID AS $$
DECLARE
    v_dm_pair TEXT;
    v_channel_id UUID;
BEGIN
    -- Canonical pair: always sorted so A→B and B→A produce same key
    v_dm_pair := CASE WHEN p_user_a < p_user_b
                      THEN p_user_a::text || ':' || p_user_b::text
                      ELSE p_user_b::text || ':' || p_user_a::text
                 END;

    -- Try find existing
    SELECT id INTO v_channel_id
    FROM channels
    WHERE org_id = p_org_id
      AND type = 'dm'
      AND metadata->>'dm_pair' = v_dm_pair;

    IF v_channel_id IS NOT NULL THEN
        RETURN v_channel_id;
    END IF;

    -- Create new DM channel
    INSERT INTO channels (org_id, name, type, metadata, created_by)
    VALUES (p_org_id, '', 'dm', jsonb_build_object('dm_pair', v_dm_pair), p_user_a)
    RETURNING id INTO v_channel_id;

    -- Add both members
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, p_user_a, 'member'),
           (v_channel_id, p_user_b, 'member');

    RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql;
```

### Migration: `000019_messaging.down.sql`

```sql
DROP FUNCTION IF EXISTS get_or_create_dm_channel;
DROP TABLE IF EXISTS message_bookmarks;
DROP TABLE IF EXISTS pinned_messages;
DROP TABLE IF EXISTS message_attachments;
DROP TABLE IF EXISTS message_reactions;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS channel_members;
DROP TABLE IF EXISTS channels;
```

---

## 6. Channel Types & Auto-Creation

### Channel Type Matrix

| Type      | Created                          | Members             | Auto-Sync                     | Example               |
| --------- | -------------------------------- | ------------------- | ----------------------------- | --------------------- |
| `dm`      | On first message between 2 users | Exactly 2           | No                            | Alice ↔ Bob           |
| `group`   | Manually by user                 | Invited users       | No                            | "Weekend Hackathon"   |
| `team`    | Auto on team creation            | All team members    | Yes (team_members trigger)    | "#engineering"        |
| `project` | Auto on project creation         | All project members | Yes (project_members trigger) | "#engineering/api-v2" |

### Auto-Creation Triggers

Add to existing service layer (NOT database triggers — keeps logic in Go):

```go
// In team_service.go → CreateTeam()
func (s *TeamService) CreateTeam(ctx context.Context, params CreateTeamParams) (*Team, error) {
    return s.txManager.WithTx(ctx, func(tx pgx.Tx) (*Team, error) {
        team, err := s.teamRepo.Create(ctx, tx, params)
        // ... existing logic ...

        // Auto-create team channel
        _, err = s.chatSvc.CreateTeamChannel(ctx, tx, team.ID, team.OrgID, team.Name)
        // Add creator as channel owner
        return team, err
    })
}

// In project_service.go → CreateProject()
func (s *ProjectService) CreateProject(ctx context.Context, params CreateProjectParams) (*Project, error) {
    return s.txManager.WithTx(ctx, func(tx pgx.Tx) (*Project, error) {
        project, err := s.projectRepo.Create(ctx, tx, params)
        // ... existing logic ...

        // Auto-create project sub-channel
        _, err = s.chatSvc.CreateProjectChannel(ctx, tx, project.ID, project.OrgID, project.TeamID, project.Name)
        return project, err
    })
}
```

### Member Sync

When a user joins/leaves a team → auto add/remove from the team's channel.
When a user joins/leaves a project → auto add/remove from the project's channel.

```go
// In team_service.go → AddTeamMember()
func (s *TeamService) AddTeamMember(ctx context.Context, teamID, userID uuid.UUID, role string) error {
    return s.txManager.WithTx(ctx, func(tx pgx.Tx) error {
        err := s.teamRepo.AddMember(ctx, tx, teamID, userID, role)
        // ... existing logic ...

        // Auto-join team channel
        return s.chatSvc.AddToTeamChannel(ctx, tx, teamID, userID)
    })
}
```

---

## 7. Real-Time Message Flow

### Send Message (Happy Path)

```
1. Client: WS → {"action": "message:send", "payload": {"channel_id": "...", "body": "Hello @alice!", "parent_message_id": null}}
2. WS Handler: Parse message, extract mentions
3. Chat Service:
   a. Validate user is channel member
   b. Within TxManager.WithTx:
      - Insert message into PostgreSQL
      - Update thread_count if threaded reply
      - Update channel_members.last_read_at for sender
   c. Publish "message.created" to Redis eventbus
   d. Enqueue Asynq jobs:
      - "chat:notify_mentions" (push notification for @alice)
      - "chat:index_message" (Meilisearch indexing)
      - "chat:unfurl_links" (if URLs detected)
4. Redis Pub/Sub → OrgHub listens, fans out to all OrgConns subscribed to channel_id
5. All clients in channel receive: {"action": "message:created", "payload": {message object}}
6. Client: Update Zustand chat store, scroll to bottom
```

### Typing Indicator (Ephemeral — No DB)

```
1. Client: WS → {"action": "typing:start", "payload": {"channel_id": "..."}}
2. WS Handler: Publish to Redis channel "orbispm:typing:{channelId}"
3. OrgHub: All connections in that channel room receive typing event
4. Client: Show "Alice is typing..." for 3 seconds
5. Auto-expire: If no "typing:start" received in 3s, hide indicator
```

### Read Receipt Update

```
1. Client opens channel → WS → {"action": "channel:mark_read", "payload": {"channel_id": "...", "timestamp": "..."}}
2. Chat Service: UPDATE channel_members SET last_read_at = timestamp WHERE channel_id = ? AND user_id = ?
3. Broadcast read receipt to other channel members (for green checkmark UI)
```

---

## 8. Feature Implementation

### @Mentions

**On message send:**

1. Parse body for `@username` or `@user_id` patterns
2. Resolve usernames to user IDs via org member lookup (cached in Redis)
3. Store resolved IDs in `messages.mentions UUID[]` column
4. Enqueue notification job for each mentioned user

**On mention notification:**

```go
// worker/chat_tasks.go
func (w *Worker) HandleNotifyMentions(ctx context.Context, t *asynq.Task) error {
    var payload MentionPayload
    json.Unmarshal(t.Payload(), &payload)

    for _, userID := range payload.Mentions {
        // Create in-app notification
        w.notifSvc.Create(ctx, Notification{
            UserID: userID,
            OrgID:  payload.OrgID,
            Type:   "chat_mention",
            Title:  fmt.Sprintf("%s mentioned you in %s", payload.SenderName, payload.ChannelName),
            Body:   truncate(payload.MessageBody, 100),
            Payload: map[string]any{
                "channel_id": payload.ChannelID,
                "message_id": payload.MessageID,
            },
        })

        // Email notification if user has email notifications enabled
        // (check notification_preferences)
    }
    return nil
}
```

### Reply / Threading

- `parent_message_id` links to the root message
- `thread_count` on root message shows reply count
- **Flat threads**: One level deep (like Slack). Parent → Replies. No nested sub-threads.
- **UI**: Click "Reply" opens thread panel. Thread messages appear in both channel timeline + thread view.

### Edit / Delete

```go
// chat_service.go
func (s *ChatService) EditMessage(ctx context.Context, msgID, userID uuid.UUID, newBody string) error {
    return s.txManager.WithTx(ctx, func(tx pgx.Tx) error {
        msg, err := s.msgRepo.GetByID(ctx, tx, msgID)
        if msg.UserID != userID {
            return domain.ErrForbidden
        }
        if time.Since(msg.CreatedAt) > 15*time.Minute {
            return domain.ErrEditWindowExpired
        }

        msg.Body = newBody
        msg.IsEdited = true
        msg.EditedAt = time.Now()
        return s.msgRepo.Update(ctx, tx, msg)
    })
    // → broadcast "message:edited" to channel
}

func (s *ChatService) DeleteMessage(ctx context.Context, msgID, userID uuid.UUID, isAdmin bool) error {
    // Soft delete: set is_deleted = true, body = "[Message deleted]"
    // Admins can delete any message; regular users only their own
}
```

### Emoji Reactions

```go
// WS → {"action": "message:react", "payload": {"message_id": "...", "emoji": "👍"}}
// Toggle: if reaction exists → remove, else → add
func (s *ChatService) ToggleReaction(ctx context.Context, msgID, userID uuid.UUID, emoji string) error {
    return s.txManager.WithTx(ctx, func(tx pgx.Tx) error {
        exists, err := s.reactionRepo.Exists(ctx, tx, msgID, userID, emoji)
        if exists {
            return s.reactionRepo.Delete(ctx, tx, msgID, userID, emoji)
        }
        return s.reactionRepo.Create(ctx, tx, msgID, userID, emoji)
    })
    // → broadcast "message:reaction_updated" with aggregated reaction counts
}
```

### File Attachments

1. Client calls REST endpoint: `POST /api/v1/chat/channels/{channelId}/upload`
2. Handler generates MinIO pre-signed upload URL
3. Client uploads directly to MinIO (bypasses backend for large files)
4. Client sends message with attachment reference
5. Service creates `message_attachments` row with storage key
6. Response includes pre-signed download URL (1-hour expiry)

### Forward Message

```go
// WS → {"action": "message:forward", "payload": {"message_id": "...", "target_channel_id": "..."}}
// Creates a new message in target channel with forwarded_from_id set
// Body includes original message text + "Forwarded from #channel-name"
```

### Message Search

```go
// REST → GET /api/v1/chat/search?q=deploy+fix&channel_id=...
// 1. Query Meilisearch index "messages_{orgId}"
// 2. Filter by channel_id if specified
// 3. Return matching messages with highlight snippets
```

Meilisearch index config:

```json
{
  "uid": "messages",
  "filterableAttributes": ["org_id", "channel_id", "user_id", "created_at"],
  "searchableAttributes": ["body"],
  "sortableAttributes": ["created_at"]
}
```

---

## 9. Scalability Plan (10K → 100K)

### Current Capacity (Single Go Process)

| Resource              | Capacity         | Basis                                                  |
| --------------------- | ---------------- | ------------------------------------------------------ |
| WebSocket connections | ~50K per process | Go goroutine = ~2KB; 50K × 8KB (with buffers) = ~400MB |
| Message throughput    | ~10K msg/sec     | PostgreSQL bulk inserts + Redis pub/sub                |
| Redis Pub/Sub         | ~100K msg/sec    | Single Redis instance fan-out                          |
| PostgreSQL writes     | ~5K TPS          | Standard NVMe SSD, connection pooling via pgx          |

### Scaling Phases

#### Phase 1: 0–10K (Current Plan)

- Single Go process
- Single PostgreSQL instance
- Single Redis instance
- Connection buffering: 256-message send queue per conn

#### Phase 2: 10K–50K

```
                    ┌──── Go Instance 1 ────┐
                    │   (OrgHub + Chat)      │
Client ──▶ Kong ──▶├──── Go Instance 2 ────┤──▶ PostgreSQL (primary)
           (LB)    │   (OrgHub + Chat)      │      ↓ streaming replication
                    └──── Go Instance 3 ────┘   PostgreSQL (read replica)
                              │
                              ▼
                         Redis Cluster
                    (Pub/Sub + Cache + Asynq)
```

**Key changes:**

- **Sticky sessions** in Kong (hash by `org_id` or `user_id`) so all connections for an org hit the same Go instance
- **Redis Cluster** for Pub/Sub fan-out across instances (subscriber on each instance receives broadcasts)
- **Read replicas** for message history queries (GET /messages)
- **Connection-aware load balancing**: Each Go instance publishes connection count to Redis; Kong routes to least-loaded

#### Phase 3: 50K–100K

- Extract chat into dedicated microservice with own DB
- Add Centrifugo or custom fan-out service as WebSocket edge layer
- Go backend focuses on REST API + write path
- Centrifugo handles 100K+ connections and broadcasts
- PostgreSQL: partition `messages` table by `(org_id, created_at)` monthly

#### Phase 4: 100K+

- Citus (distributed PostgreSQL) for horizontal sharding by `org_id`
- NATS JetStream for durable message streaming between services
- CDN-proxied WebSocket edges (Cloudflare Workers)
- S3 for message archive (cold storage > 90 days)

---

## 10. Frontend Architecture

### Chat Store (Zustand)

```typescript
// stores/chat-store.ts
interface ChatState {
  // Channel list
  channels: Channel[];
  activeChannelId: string | null;

  // Messages per channel (keyed by channel ID)
  messagesByChannel: Record<string, Message[]>;

  // Typing indicators
  typingUsers: Record<string, string[]>; // channelId → [userId, ...]

  // Unread counts
  unreadCounts: Record<string, number>; // channelId → count

  // UI state
  threadMessageId: string | null; // open thread panel
  searchQuery: string;
  searchResults: Message[];

  // Actions
  setActiveChannel: (channelId: string) => void;
  addMessage: (channelId: string, message: Message) => void;
  editMessage: (channelId: string, messageId: string, body: string) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  updateReaction: (
    channelId: string,
    messageId: string,
    reactions: Reaction[],
  ) => void;
  setTyping: (channelId: string, userIds: string[]) => void;
  markRead: (channelId: string) => void;
  prependMessages: (channelId: string, messages: Message[]) => void; // infinite scroll up
}
```

### Chat Hook

```typescript
// hooks/use-chat-socket.ts
// Extends the existing useOrgSocket to handle chat-specific events:
function useChatSocket(orgId: string) {
  const { send } = useOrgSocket(orgId);
  const chatStore = useChatStore();

  // Register chat event handlers on the existing WS connection:
  // - message:created    → chatStore.addMessage
  // - message:edited     → chatStore.editMessage
  // - message:deleted    → chatStore.deleteMessage
  // - message:reaction   → chatStore.updateReaction
  // - typing:update      → chatStore.setTyping
  // - channel:created    → add to channel list
  // - channel:updated    → update channel in list

  return {
    sendMessage: (channelId, body, parentId?) =>
      send("message:send", {
        channel_id: channelId,
        body,
        parent_message_id: parentId,
      }),
    editMessage: (messageId, body) =>
      send("message:edit", { message_id: messageId, body }),
    deleteMessage: (messageId) =>
      send("message:delete", { message_id: messageId }),
    reactToMessage: (messageId, emoji) =>
      send("message:react", { message_id: messageId, emoji }),
    startTyping: (channelId) => send("typing:start", { channel_id: channelId }),
    joinChannel: (channelId) => send("channel:join", { channel_id: channelId }),
    leaveChannel: (channelId) =>
      send("channel:leave", { channel_id: channelId }),
    markRead: (channelId) =>
      send("channel:mark_read", { channel_id: channelId }),
  };
}
```

### Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar (existing)  │  Chat Panel (new route)               │
│                     │                                        │
│ Dashboard           │  ┌─ Channel List ─┐ ┌── Messages ──┐ │
│ My Tasks            │  │ # engineering  │ │ [Alice] Hi!  │ │
│ Calendar            │  │   # api-v2     │ │ [Bob] Hey 👍 │ │
│ Projects            │  │   # frontend   │ │ ...          │ │
│ Teams               │  │ # design       │ │              │ │
│ Templates           │  │ DMs            │ │──────────────│ │
│ Activity            │  │  Alice ●       │ │ [Type msg]   │ │
│ Notifications       │  │  Bob           │ │ 📎 😀 Send   │ │
│ Search              │  │ Groups         │ └──────────────┘ │
│ ─────────────       │  │  Weekend hack  │                   │
│ MESSAGING ←NEW      │  └────────────────┘                   │
│ ─────────────       │                                        │
│ ORGANISATION        │                                        │
│ Organisation        │                                        │
└─────────────────────────────────────────────────────────────┘
```

### Routes

```
/[orgSlug]/messages                    → Channel list + last active channel
/[orgSlug]/messages/[channelId]        → Selected channel messages
/[orgSlug]/messages/dm/[userId]        → DM with user (auto-creates DM channel)
```

### REST API Endpoints

```
# Channels
GET    /api/v1/orgs/{orgId}/channels                    → List user's channels
POST   /api/v1/orgs/{orgId}/channels                    → Create group channel
GET    /api/v1/orgs/{orgId}/channels/{channelId}        → Channel details
PATCH  /api/v1/orgs/{orgId}/channels/{channelId}        → Update channel (name, description)
DELETE /api/v1/orgs/{orgId}/channels/{channelId}        → Archive channel
POST   /api/v1/orgs/{orgId}/channels/{channelId}/members → Add members
DELETE /api/v1/orgs/{orgId}/channels/{channelId}/members/{userId} → Remove member

# Messages (REST for history; WS for real-time send)
GET    /api/v1/orgs/{orgId}/channels/{channelId}/messages?before=cursor&limit=50
GET    /api/v1/orgs/{orgId}/channels/{channelId}/messages/{msgId}/thread → Thread messages
POST   /api/v1/orgs/{orgId}/channels/{channelId}/upload  → Get pre-signed upload URL

# Pins
GET    /api/v1/orgs/{orgId}/channels/{channelId}/pins
POST   /api/v1/orgs/{orgId}/channels/{channelId}/pins/{msgId}
DELETE /api/v1/orgs/{orgId}/channels/{channelId}/pins/{msgId}

# Bookmarks
GET    /api/v1/orgs/{orgId}/bookmarks
POST   /api/v1/orgs/{orgId}/bookmarks/{msgId}
DELETE /api/v1/orgs/{orgId}/bookmarks/{msgId}

# Search
GET    /api/v1/orgs/{orgId}/messages/search?q=text&channel_id=...

# DM shortcut
POST   /api/v1/orgs/{orgId}/dm/{userId}   → Get or create DM channel
```

---

## 11. Security & Multi-Tenancy

### RLS Isolation

- All tables (`channels`, `messages`, `message_attachments`) have `org_id` + RLS policies
- TxManager sets `app.current_org_id` — exact same pattern as existing tables
- **Cross-org messaging is impossible** by design

### Authorization Matrix

| Action               | Who Can                                  |
| -------------------- | ---------------------------------------- |
| Create group channel | Any org member                           |
| Add member to group  | Channel owner/admin                      |
| Send message         | Channel member                           |
| Edit own message     | Message author (within 15 min)           |
| Delete own message   | Message author                           |
| Delete any message   | Channel admin, org admin                 |
| Pin/unpin message    | Channel admin                            |
| Archive channel      | Channel owner, org admin                 |
| Create DM            | Any org member with any other org member |

### Rate Limiting

- Message send: 60/min per user (existing `middleware.RateLimiter` pattern)
- File upload: 10/min per user
- Channel creation: 5/min per user
- Reaction: 30/min per user

### Content Security

- HTML sanitize message body (if markdown/html format)
- Validate file types and sizes on upload
- Pre-signed URLs expire after 1 hour (existing MinIO pattern)
- Never expose MinIO storage keys to client

---

## 12. Deployment & Infrastructure

### Docker Compose Additions

No new services needed. All runs within existing infrastructure:

```yaml
# In docker-compose.yaml — no changes needed!
# The Go backend already has:
# - PostgreSQL (add migration 000019)
# - Redis (already used for Pub/Sub)
# - MinIO (already used for file storage)
# - Meilisearch (add "messages" index)
```

### Environment Variables (New)

```env
# Chat-specific settings (add to .env.local)
CHAT_MESSAGE_EDIT_WINDOW=15m          # How long users can edit messages
CHAT_MAX_FILE_SIZE=52428800           # 50MB
CHAT_MAX_MESSAGE_LENGTH=4000          # Characters
CHAT_HISTORY_PAGE_SIZE=50             # Messages per page
CHAT_TYPING_TIMEOUT=3s                # Typing indicator duration
```

### MinIO Bucket

Add a `chat-attachments` bucket alongside the existing bucket:

```go
// In main.go initialization
minioClient.MakeBucket(ctx, "chat-attachments", minio.MakeBucketOptions{})
```

### Meilisearch Index

```go
// In main.go initialization
meiliClient.CreateIndex(&meilisearch.IndexConfig{
    Uid:        "messages",
    PrimaryKey: "id",
})
meiliClient.Index("messages").UpdateFilterableAttributes(&[]string{
    "org_id", "channel_id", "user_id", "created_at",
})
```

---

## 13. Migration Plan (Phased)

### Phase 1: Foundation (Week 1–2)

- [ ] Create migration `000019_messaging.up.sql`
- [ ] Domain structs: `Channel`, `Message`, `MessageReaction`, `MessageAttachment`
- [ ] Repository interfaces: `ChannelRepository`, `MessageRepository`
- [ ] Repository implementations (sqlc or pgx)
- [ ] ChatService with basic CRUD
- [ ] ChatHandler with REST endpoints (channels, messages)
- [ ] Wire into `main.go`

### Phase 2: Real-Time (Week 3)

- [ ] Extend OrgHub with channel rooms (`channel:join`, `channel:leave`)
- [ ] WS dispatch for `message:send`, `message:edit`, `message:delete`
- [ ] Redis Pub/Sub events for chat messages
- [ ] Typing indicators (ephemeral, no DB)
- [ ] Frontend: Chat store (Zustand), `useChatSocket` hook
- [ ] Frontend: Channel list sidebar, message list, compose box

### Phase 3: Features (Week 4–5)

- [ ] @Mentions (parse, notify via Asynq)
- [ ] Emoji reactions (toggle, broadcast)
- [ ] File attachments (MinIO pre-signed upload)
- [ ] Reply/Threading (parent_message_id, thread view)
- [ ] Forward message
- [ ] Read receipts (last_read_at, unread count badge)

### Phase 4: Polish (Week 6)

- [ ] Message search (Meilisearch indexing via Asynq worker)
- [ ] Pinned messages
- [ ] Bookmarks
- [ ] Link preview unfurling (Asynq worker)
- [ ] Auto-create team/project channels (service layer hooks)
- [ ] Member sync (team add/remove → channel add/remove)

### Phase 5: Scale & Optimize (Week 7+)

- [ ] Redis message cache (last 100 per channel)
- [ ] Infinite scroll (cursor-based pagination)
- [ ] Message delivery confirmation (server ack)
- [ ] Offline message queue (send when reconnected)
- [ ] Performance testing at 10K concurrent connections
- [ ] Monitoring dashboards (Prometheus metrics for message throughput, WS connections)

---

## 14. Cost & Resource Estimates

### Infrastructure (At 10K Concurrent Users)

| Component   | Sizing                              | Monthly Cost (Cloud) |
| ----------- | ----------------------------------- | -------------------- |
| Go Backend  | 2 vCPU, 4GB RAM (handles WS + REST) | ~$30                 |
| PostgreSQL  | 4 vCPU, 8GB RAM, 100GB SSD          | ~$80                 |
| Redis       | 2GB RAM (cache + Pub/Sub + Asynq)   | ~$25                 |
| MinIO / S3  | 100GB storage                       | ~$5                  |
| Meilisearch | 2 vCPU, 4GB RAM                     | ~$30                 |
| **Total**   |                                     | **~$170/mo**         |

### Storage Growth Estimate

| Data              | Size Per Unit  | Daily Volume (10K users)  | Monthly |
| ----------------- | -------------- | ------------------------- | ------- |
| Messages          | ~500 bytes     | 100K messages/day = ~50MB | ~1.5GB  |
| Attachments       | ~2MB avg       | 5K files/day = ~10GB      | ~300GB  |
| Meilisearch index | ~200 bytes/msg | 100K/day = ~20MB          | ~600MB  |

---

## Summary

**Build messaging inside the existing Go backend.** You have all the primitives:

- WebSocket hub with room management
- Redis Pub/Sub for real-time events
- PostgreSQL with RLS for multi-tenant isolation
- MinIO for file storage
- Meilisearch for full-text search
- Asynq for background processing

No new services, no new infrastructure, no new complexity. Just new tables, new handlers, and extended WebSocket dispatch. When you outgrow this (50K+), the interface-based architecture lets you extract chat into a separate service without rewriting.
