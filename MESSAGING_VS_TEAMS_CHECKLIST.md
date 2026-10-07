# OrbisPM Messages vs Microsoft Teams — Feature Checklist

**Scope:** The Messages / chat module only (OrbisPM `messaging-service`). Task, project, and
org features elsewhere in the product are out of scope.
**Baseline:** Microsoft Teams is the reference; it supports nearly every item below.
**Basis:** Verified against the OrbisPM source code (frontend chat stack + Go messaging service)
and a live test of the running demo.

## Legend

- ✅ **Present** — built and working end-to-end in OrbisPM.
- ⚠️ **Partial** — limited, OR the backend/API/schema exists but there is **no usable UI** yet.
- ❌ **Absent** — not in the product.

## Summary

| Status | Count | Share |
|--------|------:|------:|
| ✅ Present | 33 | 24% |
| ⚠️ Partial (mostly "backend done, no UI") | 33 | 24% |
| ❌ Absent | 73 | 52% |
| **Total capabilities compared** | **139** | 100% |

**One-line read:** OrbisPM has a genuine, working core chat with real-time delivery and
per-channel permissions. The gaps versus Teams are rich text composing, calls/meetings, the
apps/bots/automation ecosystem, rich presence, and a set of already-built features that were
never given a UI.

---

## 1. Teams & Channel Structure

- ✅ Organization / team as a channel container
- ✅ Standard channels (open to all team members)
- ✅ Project-linked channels (auto-created per project) — *a Teams-plus*
- ✅ Per-channel roles & permissions (finer-grained than Teams)
- ⚠️ Private channels (member-scoped groups exist; no explicit private-channel toggle)
- ⚠️ Channel categories / sections (full backend + collapse state; no UI)
- ⚠️ Favorite / pin a channel (field + API; no UI)
- ⚠️ Mute a channel (API; no UI)
- ⚠️ Archive a channel (API; no UI)
- ⚠️ Rename / edit a channel (API; details panel read-only)
- ⚠️ Delete a channel (API; no UI)
- ⚠️ Read-only / announcement channel (schema flag; no management UI)
- ❌ Shared / cross-org channels (external B2B)
- ❌ Show / hide channels

## 2. Direct & Group Chats

- ✅ 1:1 direct message
- ✅ Group chat
- ✅ Add / remove people from a chat
- ✅ Mark as read
- ⚠️ Name a group chat (named on create; no rename)
- ⚠️ Pin a chat (field; no UI)
- ⚠️ Mute a chat (API; no UI)
- ⚠️ Leave a chat (only via member removal)
- ⚠️ Share chat history with new members (visible by membership; no explicit control)
- ❌ Meeting chat
- ❌ Hide a chat
- ❌ Mark as unread

## 3. Composing & Formatting

- ✅ Plain-text message
- ✅ Edit a sent message (shows "edited")
- ✅ Delete a sent message
- ⚠️ Schedule send (table exists; no scheduler or UI)
- ❌ Rich text (bold / italic / underline / strikethrough)
- ❌ Headings & block quotes
- ❌ Bulleted / numbered lists
- ❌ Inline code & code blocks
- ❌ Markdown support
- ❌ Tables in messages
- ❌ Message importance (Important / Urgent)
- ❌ Post subject / title
- ❌ Announcement post (banner + headline)
- ❌ Undo send / undo delete
- ❌ Draft persistence

## 4. Rich Content & Media

- ✅ File attachment upload
- ✅ Inline images & drag-drop
- ✅ Attachment download
- ⚠️ Emoji picker in composer (minimal)
- ❌ Image markup / annotate
- ❌ GIFs (Giphy)
- ❌ Stickers & memes
- ❌ Custom / org emoji
- ❌ Praise / kudos badges
- ❌ Polls
- ❌ Approvals in chat
- ❌ Loop / live collaborative components
- ❌ Video clip recording
- ❌ Audio / voice message
- ❌ Adaptive / actionable cards
- ❌ Link unfurling / preview

## 5. Reactions & Saving

- ✅ Emoji reactions
- ✅ Reaction count + who reacted
- ⚠️ Expanded emoji reaction set (any emoji via API; UI picker limited)
- ⚠️ Save / bookmark a message (works, but state is local-only and buggy)
- ❌ Saved-messages view (API exists; no screen)

## 6. Threads & Replies

- ✅ Threaded replies
- ✅ Reply in thread
- ⚠️ Reply count on parent (field exists; not updated live)
- ⚠️ Forward a message (API exists; no UI action)
- ❌ Quote reply
- ❌ Rich content in thread replies (threads are plain text only)

## 7. Mentions & Tagging

- ✅ @person mention
- ✅ Mention autocomplete
- ⚠️ @channel / @team broadcast (schema support; UI unclear/likely absent)
- ⚠️ Mentions activity view (app-wide notifications; no dedicated chat feed)
- ❌ Tags (@named groups of people)

## 8. Search & Discovery

- ✅ Search messages within a channel
- ✅ Search people
- ❌ Global message search across all chats
- ❌ Search files / attachments
- ❌ Search filters (date / from / type)
- ❌ Jump to message / copy link

## 9. Notifications

- ✅ In-app notifications / activity bell
- ✅ Unread counts & badges
- ⚠️ Per-channel notification settings (API; no UI)
- ⚠️ Mute channel / chat (API; no UI)
- ⚠️ Email notifications (app-level exists; chat-specific unclear)
- ❌ @mention-only mode
- ❌ Mobile / web push
- ❌ Do Not Disturb / quiet hours
- ❌ Custom notification sounds
- ❌ Read receipts (defined in schema, not implemented)

## 10. Presence & Status

- ✅ Online / offline presence
- ✅ Typing indicators (anonymized — "someone is typing…")
- ⚠️ Last-seen timestamp (in payload; limited surfacing)
- ❌ Rich presence (Busy / Away / Do Not Disturb / Out of Office)
- ❌ Custom status message
- ❌ Status duration / expiry
- ❌ Out-of-office / calendar sync

## 11. Message Actions & Management

- ✅ System messages (joined / left / created)
- ⚠️ Copy message text (browser copy only)
- ⚠️ Pin a message in a channel (view pins only; no Pin action)
- ❌ Copy link to a message
- ❌ Mark unread from a message
- ❌ Translate a message
- ❌ Report a message / concern
- ❌ Delivery / read status (sent / delivered / seen)

## 12. Moderation, Governance & Compliance

- ✅ Multi-tenant data isolation (strict org separation)
- ✅ Rate limiting / abuse prevention
- ✅ Input validation / injection protection
- ⚠️ Channel moderation (read-only flag + RBAC; limited UI)
- ⚠️ Delete others' messages (moderator) (RBAC supports it)
- ⚠️ Chat audit logs (app activity log; not compliance-grade)
- ❌ Retention policies
- ❌ eDiscovery / legal hold
- ❌ Data loss prevention (DLP)
- ❌ Information barriers / supervised chat

## 13. Integrations & Extensibility

- ✅ Cross-product events (task/project changes auto-sync to channels) — *a Teams-plus*
- ⚠️ Public / documented chat API (internal API exists; not public)
- ❌ Bots
- ❌ Apps / tabs in channels
- ❌ Incoming webhooks / connectors
- ❌ Outgoing webhooks
- ❌ Slash commands
- ❌ Message extensions
- ❌ Workflow automation (Power Automate-style)

## 14. Calls & Meetings from Chat

- ❌ Audio call
- ❌ Video call
- ❌ Screen sharing
- ❌ Meet now / scheduled meetings
- ❌ Recording & transcription
- ❌ Live captions

## 15. Platform, Access & Data

- ✅ Web app
- ✅ Real-time sync (WebSocket)
- ⚠️ Offline support (app-level PWA; chat caching limited)
- ⚠️ Localization / multi-language UI (user language field; UI coverage unclear)
- ❌ Desktop app (Windows / macOS)
- ❌ Mobile apps (iOS / Android)
- ❌ Guest / external access
- ❌ Cross-tenant federation
- ❌ Message export / data portability
- ❌ Accessibility (screen reader / immersive reader)

---

## Key Gaps vs Teams (for prioritization)

1. **Rich composing** — no formatting, code blocks, markdown, importance, subject lines.
2. **Calls & meetings** — entire audio / video / screen-share category is absent.
3. **Apps ecosystem** — no bots, tabs, connectors, slash commands, workflows.
4. **Rich presence** — online/offline only; no Busy/DND/status/read receipts.
5. **Built but not exposed** — pin, forward, bookmarks view, mute, archive, categories,
   per-channel notification settings all have working backends but no UI (fastest wins).

## Where OrbisPM Matches or Beats Teams

- Working core chat: send, edit, delete, react, thread, upload, search, mentions.
- Real-time delivery over WebSocket.
- **Per-channel role-based permissions** (finer-grained than Teams).
- **Auto-synced project/team channels** — chat structure follows the work automatically.
- Hardened multi-tenant isolation, rate limiting, and input validation.

*An interactive, filterable version of this checklist is also available on request.*
