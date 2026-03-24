# OrbisPM Messaging V2 — Complete Implementation Plan

> **Goal:** Transform the current basic chat into a production-grade, **context-aware** messaging system that is tightly integrated with the existing Org → Team → Project → Task hierarchy. Channels are auto-managed, permissions are inherited, and every entity in the system is referenceable inside messages.

---

## Current State Analysis

### What Exists (Backend — `messaging-service/`)

| Layer         | Status | Notes                                                                                                                                        |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain models | ✅     | Channel (dm/group/team/project), Message (threads, mentions, reactions, attachments), Bookmark, Pin                                          |
| DB schema     | ✅     | `channels`, `channel_members`, `messages`, `message_reactions`, `message_attachments`, `pinned_messages`, `message_bookmarks` — all with RLS |
| Repository    | ✅     | 8 interfaces: Channel, ChannelMember, Message, Reaction, Attachment, Pin, Bookmark, TxManager                                                |
| Service       | ✅     | ChannelService (CRUD, DM, member mgmt), MessageService (send, edit, delete, search, thread, reactions, pins, bookmarks, forward)             |
| Handler       | ✅     | 30+ REST endpoints, WebSocket handler                                                                                                        |
| WebSocket     | ✅     | Hub with org/channel rooms, NATS JetStream integration                                                                                       |
| Auth          | ✅     | JWT + session token fallback via Zitadel                                                                                                     |

### What Exists (Frontend — `frontend/src/`)

| Component     | Status | Notes                                                              |
| ------------- | ------ | ------------------------------------------------------------------ |
| Channel list  | ✅     | Search, DM/group split, unread badges, pin/mute                    |
| Message list  | ✅     | Infinite scroll, search, reactions, hover actions, date separators |
| Message input | ✅     | Auto-resize, emoji picker, typing indicator via WS                 |
| Thread panel  | ✅     | Parent + replies, send reply                                       |
| Chat store    | ✅     | Zustand: channels, messages (per-channel map), threads, typing, WS |

### What Exists (Main Backend — `backend/`)

| Entity   | Relevant Tables/Models                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Orgs     | `orgs` + `org_members` (owner/admin/member/viewer/billing_admin)                                        |
| Teams    | `teams` + `team_members` (team_lead/member/viewer)                                                      |
| Projects | `projects` + `project_members` (lead/contributor/reviewer/observer) + `project_teams` (multi-team link) |
| Tasks    | `tasks` (recursive depth 0-3, multi-assignee, labels, metadata)                                         |
| RBAC     | `permissions` → `roles` → `role_permissions` (3-scope: org/team/project)                                |

### Key Relationships Already Built

```
Org
 ├── Teams (team_members with roles)
 │    └── → linked to Projects (project_teams)
 ├── Projects (project_members: source=direct|team)
 │    └── Tasks (assignee_ids, reporter_id, watchers)
 └── Org Members (org-wide roles)
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
│  Messages Page (3-panel layout)                              │
│  ┌──────────┬─────────────────────┬─────────────────┐        │
│  │ Sidebar  │   Chat Area         │  Detail/Thread  │        │
│  │          │                     │     Panel       │        │
│  │ Teams    │  Messages + Media   │  Thread / Info  │        │
│  │  └ Chans │  @mentions, #refs   │  Members / Pins │        │
│  │ DMs      │  File uploads       │  Shared Files   │        │
│  │ Search   │  Link previews      │                 │        │
│  └──────────┴─────────────────────┴─────────────────┘        │
└──────────────────────────────────────────────────────────────┘
                            │
                    Kong Gateway (:8000)
                    /api/v1/chat  /ws/chat
                            │
┌──────────────────────────────────────────────────────────────┐
│                    MESSAGING SERVICE                         │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐   │
│  │ Handler │→│ Service  │→│Repository │→│ PostgreSQL │   │
│  │ (REST)  │  │ (Logic)  │  │  (SQL)    │  │  (RLS)     │   │
│  └─────────┘  └──────────┘  └───────────┘  └────────────┘   │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐                   │
│  │ WS Hub  │←│  NATS    │←│ Service   │  MinIO (files)    │
│  └─────────┘  └──────────┘  └───────────┘                   │
└──────────────────────────────────────────────────────────────┘
                            │
              Cross-service event bus (NATS)
                            │
┌──────────────────────────────────────────────────────────────┐
│                    MAIN BACKEND                              │
│  Publishes: team.created, team.member_added,                 │
│             project.created, project_team.linked,            │
│             project.member_added, etc.                       │
│  → messaging-service subscribes & auto-creates channels      │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Auto-Managed Team & Project Channels

### 1.1 Auto-Create Team Channels on Team Creation

**Trigger:** When a team is created in the main backend (`team.created` event)

**Implementation:**

#### Backend (main) — Publish Event

- File: `backend/internal/service/team_service.go`
- After team creation, publish NATS event:
  ```
  Subject: orbispm.team.created
  Payload: { org_id, team_id, name, created_by }
  ```

#### Messaging Service — Subscribe & Create

- New file: `messaging-service/internal/service/sync_service.go`
- **SyncService** subscribes to NATS subjects from the main backend
- On `orbispm.team.created`:
  1. Create channel: `type=team, team_id=<id>, name="general", description="General discussion for <team_name>"`
  2. Fetch team members from main backend via internal API or NATS request-reply
  3. Add all team members to the channel
  4. Optionally create additional default channels: `#announcements`, `#random`

#### Auto-Channels per Team

| Channel          | Purpose                                      | Auto-Created     |
| ---------------- | -------------------------------------------- | ---------------- |
| `#general`       | Main team discussion                         | On team creation |
| `#announcements` | Team-wide announcements (admin-only posting) | On team creation |

#### DB Migration

```sql
-- messaging-service/db/migrations/000003_add_auto_channel_fields.up.sql
ALTER TABLE channels ADD COLUMN is_auto_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN auto_source TEXT; -- 'team' or 'project'
ALTER TABLE channels ADD COLUMN auto_source_id UUID; -- team_id or project_id
CREATE INDEX idx_channels_auto_source ON channels(auto_source, auto_source_id) WHERE auto_source IS NOT NULL;
```

### 1.2 Auto-Create Project Channels

**Trigger:** When a project is created or a team is linked to a project

**Events:**

- `orbispm.project.created` → Create `#<project-slug>` channel
- `orbispm.project_team.linked` → Add channel to team's sidebar
- `orbispm.project_team.unlinked` → Remove channel from team's sidebar
- `orbispm.project.member_added` → Add user to project channel
- `orbispm.project.member_removed` → Remove user from project channel

**Behavior:**

1. When project is created → create channel `type=project, project_id=<id>, name=<project-slug>`
2. Channel auto-contains: all project members (from direct + team inheritance)
3. When team is linked to project → all team members get added to channel
4. When team is unlinked from project → team-sourced members removed (unless direct member)
5. When user directly added to project → auto-join project channel
6. When user removed from project → auto-leave project channel

### 1.3 Auto-Sync Team Membership to Channels

**Events:**

- `orbispm.team.member_added` → Add user to ALL team channels + linked project channels
- `orbispm.team.member_removed` → Remove user from team channels + team-sourced project channels

**Sync Rules:**
| Backend Event | Messaging Action |
|--------------|-----------------|
| Team created | Create `#general`, `#announcements` team channels |
| Team deleted | Archive all team channels (preserve history) |
| Team member added | Add to team channels + linked project channels |
| Team member removed | Remove from team channels + linked project channels (if no direct membership) |
| Project created | Create project channel |
| Project deleted | Archive project channel |
| Project team linked | Add team members to project channel |
| Project team unlinked | Remove team-sourced members from project channel |
| Project member added (direct) | Add to project channel |
| Project member removed | Remove from project channel (if no team source) |

### 1.4 Internal API for Cross-Service Communication

Since the messaging service needs to know about team/project members, we need a way to query:

**Option A — NATS Request-Reply (preferred, no network calls)**

```
Subject: orbispm.query.team.members
Request:  { org_id, team_id }
Response: { members: [{ user_id, role, display_name, email, avatar_url }] }

Subject: orbispm.query.project.members
Request:  { org_id, project_id }
Response: { members: [{ user_id, role, source, display_name }] }

Subject: orbispm.query.org.members
Request:  { org_id }
Response: { members: [{ user_id, role, display_name, email, avatar_url }] }
```

**Backend Implementation:**

- New file: `backend/internal/service/nats_responder.go`
- Register NATS request handlers in `cmd/api/main.go`
- Each handler queries the relevant repository and responds

---

## Phase 2: Direct Messages (DM)

### 2.1 Backend DM Support (Mostly Exists)

The DB schema already supports DMs:

- `channels.type = 'dm'`, `channels.dm_pair = 'uuid_a:uuid_b'` (canonical sorted)
- `get_or_create_dm_channel()` SQL function exists
- `ChannelService.GetOrCreateDM()` exists
- REST endpoint `POST /channels/dm` exists

**What's Missing:**

1. Org member list endpoint for the messaging service (to pick DM recipients)
2. Frontend DM creation UI
3. DM-specific display (show other user's name/avatar, not channel name)

### 2.2 Org Member Search for DM (New Endpoint)

```
GET /api/v1/chat/users?q=<search>&limit=20
```

**Implementation:**

- Query main backend via NATS request-reply: `orbispm.query.org.members`
- Filter by search term (name/email)
- Return list of org members (excluding current user)
- Used by "New DM" feature in frontend

### 2.3 Frontend DM UI

- "New Message" button in sidebar → opens user search modal
- Search org members by name/email
- Click user → Create or open existing DM channel
- DM channels show other user's display name and avatar (not "dm" channel name)
- DM list sorted by last activity (most recent first)

---

## Phase 3: Media Upload (50MB Max, Image Preview)

### 3.1 Backend File Upload

**Endpoint:**

```
POST /api/v1/chat/channels/{channelId}/messages/{messageId}/attachments
Content-Type: multipart/form-data
Body: file (max 50MB)
Response: { id, file_name, file_size, content_type, url (presigned) }
```

**Or inline with message send:**

```
POST /api/v1/chat/channels/{channelId}/messages
Content-Type: multipart/form-data
Body: body (text), files[] (array of files, max 10 per message)
```

**Implementation:**

- New handler: `HandleUploadAttachment`
- Validates: file size ≤ 50MB, allowed MIME types
- Upload to MinIO: `chat/{org_id}/{channel_id}/{message_id}/{uuid}_{filename}`
- Store metadata in `message_attachments` table
- Return presigned URL (1 hour expiry)
- Image processing: generate thumbnail for images (optional, later phase)

**Allowed MIME Types:**

```
Images:  image/jpeg, image/png, image/gif, image/webp, image/svg+xml
Docs:    application/pdf, text/plain, text/csv
Office:  application/vnd.openxmlformats-officedocument.* (docx, xlsx, pptx)
Code:    text/*, application/json, application/xml
Video:   video/mp4, video/webm (up to 50MB)
Audio:   audio/mpeg, audio/wav, audio/ogg
Archive: application/zip, application/gzip
```

**Presigned URL Endpoint (for serving files):**

```
GET /api/v1/chat/attachments/{attachmentId}/url
Response: { url: "https://minio.../presigned?..." }
```

### 3.2 Frontend Upload UI

- **Attachment button** (📎) next to emoji picker in message input
- Click → native file picker (accept: images, docs, etc.)
- **Drag & drop** on chat area
- **Paste image** from clipboard
- Upload progress bar (per file)
- Image preview inline in message (thumbnail max 400×300)
- Non-image files: file card (icon + name + size + download link)
- Multi-file support (up to 10 per message)
- Cancel upload button

### 3.3 Image Preview & Lightbox

- Inline image thumbnails in messages (click to expand)
- Lightbox modal for full-size image viewing
- Previous/Next navigation in lightbox
- Download button in lightbox

---

## Phase 4: Message Alignment (Own Messages on Right)

### 4.1 Chat Bubble Layout

Current: All messages left-aligned (same sender layout).

**New Design — WhatsApp/Telegram-style:**
| Condition | Alignment | Style |
|-----------|-----------|-------|
| Other user's message | Left | Avatar + name + bubble (base-300 bg) |
| Current user's message | Right | Bubble only (primary bg), no avatar |

**Frontend Changes:**

- `message-list.tsx` → Check `message.user_id === currentUser.id`
- If own message: `flex-row-reverse`, `bg-primary text-primary-content`, right-aligned
- If other message: `flex-row`, `bg-base-300`, left-aligned, show avatar + name
- Thread panel: same alignment logic
- Group consecutive messages from same sender (hide avatar for subsequent)

---

## Phase 5: @Mentions & Entity References with Previews

### 5.1 Mentionable Entities

| Prefix     | Entity             | Example                  | On Hover                                      | On Click                 |
| ---------- | ------------------ | ------------------------ | --------------------------------------------- | ------------------------ |
| `@`        | User / Team Member | `@john.doe`              | User card (name, role, avatar, status)        | Open DM                  |
| `#`        | Channel            | `#design-team`           | Channel card (name, type, member count)       | Navigate to channel      |
| `@@`       | Team               | `@@frontend-team`        | Team card (name, member count, projects)      | Navigate to team page    |
| `!task`    | Task               | `!task PROJ-42`          | Task card (title, status, priority, assignee) | Navigate to task detail  |
| `!project` | Project            | `!project design-system` | Project card (name, status, team count)       | Navigate to project page |

### 5.2 Backend — Mention Resolution

**Mention Storage (Already Exists):**

- `messages.mentions` (UUID[]) — stores user IDs mentioned
- Extend to store structured mentions:

**New DB Column:**

```sql
ALTER TABLE messages ADD COLUMN entity_mentions JSONB DEFAULT '[]';
-- Format: [{"type":"user","id":"uuid","display":"@john"},{"type":"task","id":"uuid","display":"!task PROJ-42"}]
```

**Mention Resolution Endpoint:**

```
POST /api/v1/chat/mentions/resolve
Body: { query: "john", type: "user|team|task|project|channel", org_id }
Response: { results: [{ id, type, display_name, metadata }] }
```

This calls back to the main backend via NATS:

```
Subject: orbispm.query.mentions.resolve
Payload: { org_id, query, type }
```

**Backend Responder (main backend):**

- `user` → search `org_members` by display_name/email
- `team` → search `teams` by name
- `task` → search `tasks` by title or task number
- `project` → search `projects` by name
- `channel` → search `channels` by name

### 5.3 Frontend — Mention Autocomplete

**Trigger:** User types `@`, `#`, `@@`, or `!task`/`!project` in message input

**UI Flow:**

1. User types `@jo` → debounced API call to resolve mentions
2. Dropdown appears above cursor with matching users
3. Arrow keys to navigate, Enter/Tab to select
4. Selected mention inserted as styled badge: `@John Doe`
5. Raw format stored: `<@user:uuid>` (parsed on render)

**Mention Rendering in Messages:**

- Parse message body for `<@user:uuid>`, `<#channel:uuid>`, `<@@team:uuid>`, `<!task:uuid>`, `<!project:uuid>`
- Render as styled inline badges (colored, clickable)
- On hover: show preview card (fetched via API)
- On click: navigate to entity

**Preview Card Component:**

- Floating card with entity details
- User card: avatar, name, role, email, "Send Message" button
- Task card: title, status badge, priority, assignee avatar, project name
- Project card: name, status, team count, description excerpt
- Team card: name, member count, project list

### 5.4 Mention Preview API (Main Backend)

New endpoints on main backend (or via NATS):

```
GET /api/v1/mentions/user/{userId}/preview       → { display_name, email, avatar_url, role }
GET /api/v1/mentions/team/{teamId}/preview        → { name, member_count, project_count }
GET /api/v1/mentions/project/{projectId}/preview  → { name, status, team_count, description }
GET /api/v1/mentions/task/{taskId}/preview         → { title, status, priority, assignee, project }
```

---

## Phase 6: Channel Sidebar Hierarchy

### 6.1 Sidebar Structure

Replace flat channel list with organized hierarchy:

```
📱 DIRECT MESSAGES
  ├── John Doe          (online 🟢)
  ├── Jane Smith        (away 🟡)
  └── + New message

🏢 TEAMS
  ├── ▼ Frontend Team
  │    ├── # general
  │    ├── # announcements
  │    ├── # random (user-created)
  │    └── 📁 Projects
  │         ├── # design-system
  │         └── # mobile-app
  ├── ▼ Backend Team
  │    ├── # general
  │    ├── # announcements
  │    └── 📁 Projects
  │         ├── # api-gateway
  │         └── # design-system    ← same project, appears in both teams
  └── ▼ DevOps Team
       ├── # general
       └── 📁 Projects
            └── # infrastructure

💬 GROUP CHANNELS
  ├── # watercooler
  └── # design-review

🔍 Search channels...
```

### 6.2 API for Hierarchical Channel Listing

**New Endpoint:**

```
GET /api/v1/chat/channels/sidebar
Response: {
  dms: [{ channel, other_user: { id, display_name, avatar, online } }],
  teams: [{
    team_id, team_name,
    channels: [{ id, name, type, unread_count }],
    project_channels: [{ id, name, project_id, project_name, unread_count }]
  }],
  groups: [{ id, name, unread_count }]
}
```

**Backend Implementation:**

1. Query user's channels: `SELECT * FROM channels JOIN channel_members ON ... WHERE user_id = $1`
2. Group by type:
   - `dm` → DM section (resolve other user's name via stored dm_pair)
   - `team` → Group under team_id (fetch team name)
   - `project` → Group under associated team(s) via project_teams
   - `group` → Standalone group section
3. Count unreads per channel

### 6.3 Frontend Sidebar Component Rewrite

- Collapsible team sections (stored in localStorage)
- Nested project channels under teams
- DM section with online/offline indicators
- Unread badges per channel
- Right-click context menu: Mute, Pin, Leave, Copy link
- Drag to reorder pinned channels
- Keyboard shortcut: `Cmd+K` to quick-switch channels

---

## Phase 7: Presence & Online Status

### 7.1 Backend Presence Tracking

**Architecture:** Redis-backed presence with heartbeat

**Implementation:**

- On WebSocket connect: `SADD presence:{org_id} {user_id}` + `SET presence:{org_id}:{user_id} online EX 60`
- Heartbeat every 30s: `EXPIRE presence:{org_id}:{user_id} 60`
- On WebSocket disconnect: `SREM presence:{org_id} {user_id}` + `DEL presence:{org_id}:{user_id}`
- On heartbeat miss (TTL expired): Redis keyspace notification → broadcast offline event

**API:**

```
GET /api/v1/chat/presence
Response: { online_users: ["uuid1", "uuid2", ...] }
```

**WebSocket Events:**

```json
{ "type": "presence.online", "payload": { "user_id": "..." } }
{ "type": "presence.offline", "payload": { "user_id": "..." } }
```

### 7.2 Frontend Presence UI

- Green dot on online user avatars
- Yellow dot for "away" (idle > 5 min, via `visibilitychange` event)
- Gray dot for offline
- DM list: show status next to name
- Channel member list: sort online first
- "X members online" in channel details

---

## Phase 8: Admin & Permission Controls

### 8.1 Channel Permission Model

| Action         | Team Channel          | Project Channel          | Group Channel       | DM             |
| -------------- | --------------------- | ------------------------ | ------------------- | -------------- |
| Create         | Auto (system)         | Auto (system)            | Any org member      | Any org member |
| Delete         | Team lead / Org admin | Project lead / Org admin | Channel owner       | Cannot delete  |
| Invite member  | Team lead / Admin     | Project lead / Admin     | Channel owner/admin | N/A            |
| Remove member  | Team lead / Admin     | Project lead / Admin     | Channel owner/admin | N/A            |
| Post message   | All members           | All members              | All members         | Both users     |
| Pin message    | Admin+                | Admin+                   | Admin+              | Both users     |
| Manage channel | Owner/Admin           | Owner/Admin              | Owner               | N/A            |

### 8.2 Org-Wide Admin Controls

- **Org Admin** can:
  - View/join any channel in the org
  - Delete any channel
  - Remove any member from any channel
  - Set channel as read-only (announcements)
  - View chat analytics (message count, active users, etc.)

- **Permission Integration:**
  - New permissions in the canonical permission system:
    ```
    chat:channels:create (org scope)
    chat:channels:delete (org scope)
    chat:channels:manage (org scope)
    chat:messages:delete_any (org scope)
    chat:channels:join_any (org scope)
    ```

### 8.3 Add Org Members to Channels

**UI:**

- "Add Member" button in channel details → opens org member search
- Search org members by name/email
- Shows member's org role, teams, avatar
- Can assign channel role (admin/member) on invite
- For team/project channels: shows warning if member is not in the team/project

---

## Phase 9: Advanced Features (Production Grade)

### 9.1 Message Formatting (Rich Text)

- Markdown support (already `body_format: 'markdown'`)
- **Code blocks** with syntax highlighting (Prism.js)
- **Block quotes** for quoted replies
- **Lists** (ordered, unordered)
- **Bold, italic, strikethrough** with toolbar shortcuts
- **Links** with auto-preview (Open Graph metadata)
- **Tables** (markdown tables rendered)

### 9.2 Link Previews

When a message contains a URL:

1. Backend extracts URLs from message body
2. Asynq job fetches Open Graph data (title, description, image)
3. Store in `messages.metadata` JSONB
4. Frontend renders preview card below message

### 9.3 Message Read Receipts (Who Read)

**Current:** `channel_members.last_read_at` — only tracks "read up to" timestamp.

**Enhanced:**

- Keep current approach for unread count (efficient)
- Add "seen by N" indicator on your own sent messages
- On hover: show list of who has read

**Implementation:**

```sql
-- No new table needed. Use channel_members.last_read_at
-- "Seen by" = count of members where last_read_at >= message.created_at
```

### 9.4 Message Forwarding Enhancement

Current: Basic forward exists. Enhance with:

- Forward to multiple channels at once
- Forward with optional quote/comment
- "Forwarded from #channel" indicator on forwarded messages

### 9.5 Channel Notification Settings

Per-channel notification control:

- **All messages** — notify on every message
- **@mentions only** — notify only when mentioned
- **Nothing** — completely muted
- **Custom schedule** — mute outside hours (future)

Store in `channel_members.notification_pref` (new column, VARCHAR, default 'all')

### 9.6 Starred/Saved Messages

Current: Bookmarks exist but basic. Enhance:

- Star messages (appears in "Saved" section in sidebar)
- Add notes to bookmarks
- Search bookmarks
- Organize by channel

### 9.7 Message Scheduling

- "Schedule message" option in send button dropdown
- Pick date/time → store in `scheduled_messages` table
- Asynq cron job checks and sends at scheduled time
- Can edit/cancel before send time

```sql
CREATE TABLE scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    channel_id UUID NOT NULL REFERENCES channels(id),
    user_id UUID NOT NULL,
    body TEXT NOT NULL,
    body_format VARCHAR(10) NOT NULL DEFAULT 'text',
    parent_message_id UUID REFERENCES messages(id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, cancelled
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.8 Channel Analytics (Admin)

Dashboard for org admins:

- Messages per day/week/month (chart)
- Most active channels
- Most active users
- Peak activity hours
- Response time metrics

### 9.9 Export & Compliance

- Export channel history as JSON/CSV
- Retention policies (auto-delete messages older than X days)
- Audit log integration (who deleted what, when)

### 9.10 Voice/Video Messages (Future)

- Record short audio/video clips
- Upload as attachment with special rendering
- Waveform visualization for audio

---

## Phase 10: Notifications & Email Digest

### 10.1 In-App Notifications

When user is mentioned or receives a DM:

1. Create entry in main backend `notifications` table
2. Push via main backend WebSocket
3. Show in notification bell (top-right, already exists)

**Cross-Service Flow:**

```
Messaging Service → NATS "chat.notification" → Main Backend → notifications table → WS push
```

### 10.2 Email Digest

For users who are offline:

- After 5 minutes of unread @mention, send email
- Daily digest: summary of unread channels
- Integrated with existing email-service (Python/SMTP)

---

## Implementation Priority & Phases

### Sprint 1 (MVP — Core Fixes) ⚡

| #   | Feature                                                 | Effort | Impact                 |
| --- | ------------------------------------------------------- | ------ | ---------------------- |
| 1   | Own messages right-aligned                              | S      | High — basic UX        |
| 2   | DM creation UI (user search + create)                   | M      | High — core feature    |
| 3   | Media upload (50MB, image preview)                      | L      | High — core feature    |
| 4   | Channel sidebar hierarchy (Teams → Channels → Projects) | L      | High — core navigation |

### Sprint 2 (Auto-Management) 🔄

| #   | Feature                                | Effort | Impact                       |
| --- | -------------------------------------- | ------ | ---------------------------- |
| 5   | NATS cross-service event bus           | M      | Critical — enables auto-sync |
| 6   | Auto-create team channels              | M      | High — key differentiator    |
| 7   | Auto-create project channels           | M      | High — key differentiator    |
| 8   | Auto-sync membership (team → channels) | L      | High — seamless experience   |
| 9   | Project channel in multiple teams      | M      | High — cross-team visibility |

### Sprint 3 (Mentions & Previews) 💬

| #   | Feature                                     | Effort | Impact                       |
| --- | ------------------------------------------- | ------ | ---------------------------- |
| 10  | @user mentions with autocomplete            | L      | High — communication         |
| 11  | Entity references (!task, !project, @@team) | L      | High — unique differentiator |
| 12  | Hover preview cards                         | M      | High — productivity          |
| 13  | Click-to-navigate from mentions             | S      | Medium — convenience         |

### Sprint 4 (Polish & Production) 🚀

| #   | Feature                               | Effort | Impact                      |
| --- | ------------------------------------- | ------ | --------------------------- |
| 14  | Presence (online/offline/away)        | M      | Medium — social awareness   |
| 15  | Admin permission controls             | M      | High — enterprise readiness |
| 16  | Per-channel notification settings     | S      | Medium — reduce noise       |
| 17  | Link previews (Open Graph)            | M      | Medium — rich content       |
| 18  | Message formatting (markdown toolbar) | M      | Medium — power users        |
| 19  | Channel analytics (admin dashboard)   | M      | Low — admin value           |
| 20  | Message scheduling                    | M      | Low — nice to have          |

**Effort Key:** S = Small (< 1 day), M = Medium (1-2 days), L = Large (2-4 days)

---

## Unique Differentiators vs Slack/Teams/Discord

| Feature                           | Slack | Teams   | Discord | OrbisPM   |
| --------------------------------- | ----- | ------- | ------- | --------- |
| Auto-create team channels         | ❌    | Partial | ❌      | ✅        |
| Auto-sync project channels        | ❌    | ❌      | ❌      | ✅        |
| @mention a task with preview      | ❌    | ❌      | ❌      | ✅        |
| @mention a project with preview   | ❌    | ❌      | ❌      | ✅        |
| Click task mention → task detail  | ❌    | ❌      | ❌      | ✅        |
| Project channel in multiple teams | ❌    | ❌      | ❌      | ✅        |
| Auto-join on project assignment   | ❌    | ❌      | ❌      | ✅        |
| RBAC inherited from project roles | ❌    | ❌      | ❌      | ✅        |
| Task status in chat context       | ❌    | Partial | ❌      | ✅        |
| Integrated project management     | ❌    | Partial | ❌      | ✅ Native |

---

## Technical Details

### New Database Migrations (Messaging Service)

```sql
-- 000003_auto_channels.up.sql
ALTER TABLE channels ADD COLUMN is_auto_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN auto_source TEXT CHECK (auto_source IN ('team', 'project'));
ALTER TABLE channels ADD COLUMN auto_source_id UUID;
ALTER TABLE channels ADD COLUMN read_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN notification_default TEXT NOT NULL DEFAULT 'all'
    CHECK (notification_default IN ('all', 'mentions', 'nothing'));
CREATE INDEX idx_channels_auto_source ON channels(auto_source, auto_source_id) WHERE auto_source IS NOT NULL;

-- 000004_entity_mentions.up.sql
ALTER TABLE messages ADD COLUMN entity_mentions JSONB DEFAULT '[]';
CREATE INDEX idx_messages_entity_mentions ON messages USING GIN (entity_mentions);

-- 000005_channel_member_prefs.up.sql
ALTER TABLE channel_members ADD COLUMN notification_pref TEXT NOT NULL DEFAULT 'all'
    CHECK (notification_pref IN ('all', 'mentions', 'nothing'));

-- 000006_scheduled_messages.up.sql
CREATE TABLE scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    body TEXT NOT NULL CHECK (char_length(body) <= 4000),
    body_format VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (body_format IN ('text', 'markdown')),
    parent_message_id UUID REFERENCES messages(id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_msg_org_isolation ON scheduled_messages
    USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE INDEX idx_scheduled_messages_due ON scheduled_messages(scheduled_for) WHERE status = 'pending';
```

### New Backend Migrations (Main Backend)

```sql
-- Add chat permissions to canonical permission set
INSERT INTO permissions (id, resource, action, scope, description) VALUES
    (gen_random_uuid(), 'chat', 'channels_create', 'org', 'Create chat channels'),
    (gen_random_uuid(), 'chat', 'channels_delete', 'org', 'Delete any chat channel'),
    (gen_random_uuid(), 'chat', 'channels_manage', 'org', 'Manage any chat channel settings'),
    (gen_random_uuid(), 'chat', 'messages_delete_any', 'org', 'Delete any message in any channel'),
    (gen_random_uuid(), 'chat', 'channels_join_any', 'org', 'Join any channel in the org');

-- Assign to admin/owner roles
```

### New Files (Messaging Service)

```
messaging-service/internal/
├── service/
│   ├── sync_service.go        # NATS subscriber for team/project events
│   ├── presence_service.go    # Redis-backed online/offline tracking
│   └── mention_service.go     # Mention resolution via NATS request-reply
├── handler/
│   └── upload_handler.go      # File upload with MinIO
├── repository/
│   └── presence_repo.go       # Redis presence operations
└── worker/
    ├── link_preview.go        # Asynq job: fetch OG data for URLs
    └── scheduled_sender.go    # Asynq job: send scheduled messages
```

### New Files (Main Backend)

```
backend/internal/
├── service/
│   └── nats_responder.go      # Answer NATS queries from messaging-service
└── handler/
    └── mention_preview_handler.go  # Preview cards for mentions
```

### New Files (Frontend)

```
frontend/src/components/chat/
├── channel-sidebar.tsx         # Hierarchical sidebar (replaces channel-list.tsx)
├── dm-create-modal.tsx         # User search + DM creation
├── file-upload.tsx             # Drag/drop + clipboard paste upload
├── file-preview.tsx            # Inline image/file preview in messages
├── mention-autocomplete.tsx    # @mention dropdown + entity search
├── mention-badge.tsx           # Styled inline mention badges
├── entity-preview-card.tsx     # Hover preview popup (user/task/project/team)
├── presence-indicator.tsx      # Online/offline/away dot
├── lightbox.tsx                # Full-size image viewer modal
└── message-bubble.tsx          # Refactored single message with alignment
```

### Environment Variables (New)

```env
# Messaging Service
MAX_UPLOAD_SIZE=52428800   # 50MB in bytes
MINIO_CHAT_BUCKET=chat-attachments
LINK_PREVIEW_ENABLED=true
PRESENCE_TTL_SECONDS=60

# Main Backend (no new vars — NATS already configured)
```

---

## Data Flow Diagrams

### Auto-Channel Creation Flow

```
User creates Team "Frontend" in UI
  → backend POST /orgs/{orgId}/teams
  → TeamService.Create()
  → Publish NATS: orbispm.team.created { org_id, team_id, name, created_by, members }
  → messaging-service SyncService receives event
  → Create channels: #general (type=team), #announcements (type=team, read_only=true)
  → Add all team members as channel_members
  → Broadcast WS: channel.created (to each member)
  → Frontend auto-updates sidebar (new team section appears)
```

### Project Channel in Multiple Teams

```
Project "Design System" linked to Team "Frontend" AND Team "Design"

Frontend Team sidebar:           Design Team sidebar:
  ▼ Frontend Team                  ▼ Design Team
    # general                        # general
    📁 Projects                      📁 Projects
      # design-system  ←──────────→   # design-system  (SAME channel)
      # mobile-app                     # branding
```

### @Mention Resolution Flow

```
User types "@jo" in message input
  → debounced API call: GET /api/v1/chat/mentions/resolve?q=jo&type=user
  → messaging-service → NATS request: orbispm.query.mentions.resolve
  → main backend → search org_members WHERE display_name ILIKE '%jo%'
  → response: [{ id: "uuid", display_name: "John Doe", avatar: "..." }]
  → frontend shows autocomplete dropdown
  → user selects "John Doe"
  → message body becomes: "Hey <@user:uuid> can you review this?"
  → on send: mentions[] = ["uuid"] (for notification routing)
  → on render: "<@user:uuid>" → styled badge "@John Doe"
  → on hover: fetch preview → show user card
  → on click: open DM with John
```

### File Upload Flow

```
User drops image onto chat area
  → Frontend: FormData with file
  → POST /api/v1/chat/channels/{channelId}/upload
  → Handler validates: size ≤ 50MB, MIME type allowed, user is channel member
  → Upload to MinIO: chat/{org_id}/{channel_id}/{uuid}_{filename}
  → Insert message_attachments row
  → Create message with attachment IDs
  → Return presigned URL
  → Frontend renders inline preview (image) or file card (document)
  → Other users receive via WS: message.created with attachments[]
```

---

## Summary

This plan transforms OrbisPM messaging from a basic chat into a **context-aware, deeply integrated communication layer** that understands your org structure. The key differentiators are:

1. **Zero-config channels** — Teams and projects automatically get channels. Members auto-join/leave as assignments change.
2. **Cross-entity references** — @mention a task, project, or team member with live preview cards. Communication and work items are linked.
3. **Multi-team project channels** — A project assigned to 2 teams shows the channel in both team sidebars. Unlink = disappear.
4. **Permission inheritance** — Channel roles derived from team/project roles. No separate permission management needed.
5. **Media-rich messaging** — 50MB file uploads, inline image previews, drag-and-drop, clipboard paste.
6. **Presence awareness** — Real-time online/offline/away indicators across the org.

Every feature builds on the existing 4-layer architecture (Handler → Service → Repository → Domain), PostgreSQL RLS for tenant isolation, NATS for cross-service communication, and the established RBAC system.
