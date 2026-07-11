# OrbisPM Messages — Teams Parity: Approach & Feasibility

For every capability marked **Absent** in the Teams comparison, this document states how
Microsoft Teams implements it and a concrete plan to build it in OrbisPM, grounded in the
existing architecture, plus an effort and feasibility rating.

**Companion doc:** `MESSAGING_VS_TEAMS_CHECKLIST.md` (the full present/partial/absent list).
**Scope:** the 73 Absent items. The 33 "Partial" items are already-built backends missing a UI
and are the cheapest wins — they are listed as **Phase 0** at the end.

## Current building blocks we reuse

- **messaging-service** (Go / chi): REST + WebSocket handlers, per-aggregate repositories,
  **NATS JetStream** fan-out, **Postgres** (RLS, 7 migrations), **Redis** (presence), **MinIO**
  (attachments), Zitadel auth.
- **Frontend** (Next.js): chat components, `chat-store` (Zustand), `use-chat-socket`,
  `api.ts` chat namespace.
- **Already in the repo, currently unused for chat:** a **Tiptap** rich-text editor, **Meilisearch**
  (search infra), a **service worker** (PWA), the app-level **webhook** and **notification/email**
  services.

## How to read the ratings

| Effort | Meaning |
|--------|---------|
| **S** | ≤ 1–2 days, mostly frontend + a small endpoint/field |
| **M** | ~1 week, new endpoint(s) + schema + UI |
| **L** | 2–4 weeks, new subsystem or external infra |
| **XL** | 1+ month, a new product pillar |

**Feasibility** — **High** = fits the current architecture, low risk · **Medium** = doable, needs
new infra or has moderate risk · **Low** = major architectural change or a hard external dependency
(recommend integrate/buy, or defer).

---

## 1. Teams & Channel Structure

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Shared / cross-org channels | Azure AD B2B "direct connect" shares a channel across tenants | Requires cross-org membership + a shared-channel ACL that relaxes org-scoped RLS, plus Zitadel cross-org identity. Breaks the single-tenant model. **Recommend defer.** | XL | Low |
| Show / hide channels | Per-user favorites/hidden list | Add `is_hidden` to `channel_members` (mirrors existing `is_muted`); filter the sidebar; add a toggle. | S | High |

## 2. Direct & Group Chats

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Meeting chat | Auto-created chat bound to a meeting | Depends on the Meetings pillar (§14). Once it exists, create a `type='meeting'` channel linked to the meeting id. | L* | Low now |
| Hide a chat | Per-user hidden list | Same `is_hidden` flag as show/hide channels. | S | High |
| Mark as unread | Moves the unread pointer back | We already track last-read per member; add an endpoint to set `last_read_at` to a chosen message's timestamp + a menu action. | S | High |

## 3. Composing & Formatting

> Most of this section is unlocked by adopting the **Tiptap editor already in the repo** for the
> composer and storing `body_format='html'` (the column exists) with server-side sanitization
> (bluemonday in Go).

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Rich text (bold/italic/underline/strike) | HTML rich compose box | Swap the plain textarea in `message-input.tsx` for Tiptap; sanitize + store HTML. | M | High |
| Headings & block quotes | Rich box | Tiptap extensions (included once rich text lands). | S | High |
| Bulleted / numbered lists | Rich box | Tiptap list extensions. | S | High |
| Inline code & code blocks | Code block w/ highlight | Tiptap code-block + highlight.js render. | S | High |
| Markdown support | Markdown → rich | Tiptap markdown paste/parse on input. | S | High |
| Tables in messages | Limited tables | Tiptap table extension. | M | Medium |
| Message importance (Important/Urgent) | Urgent re-notifies every 2 min | Add `importance` enum to `messages`; Urgent drives a repeated-notification loop; composer selector. | M | High |
| Post subject / title | Channel post headline | Add `subject` field to messages; render as a post header. | S | High |
| Announcement post (banner + headline) | Formatted announcement | `type='announcement'` message with title + banner image (MinIO). | M | High |
| Undo send / undo delete | Recall within a window | Optimistic "sending" state with a few-second undo before commit; undo-delete un-sets `is_deleted` within a grace window (soft-delete already exists). | M | High |
| Draft persistence | Keeps unsent text | Persist per-channel draft in IndexedDB/localStorage in the composer. | S | High |

## 4. Rich Content & Media

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Image markup / annotate | Draw on image pre-send | Canvas overlay to annotate before upload. | M | Medium |
| GIFs (Giphy) | Giphy picker | Integrate Giphy/Tenor API; picker inserts the GIF as an attachment. | S | High |
| Stickers & memes | Sticker library | Sticker asset library + picker. | M | Medium |
| Custom / org emoji | Tenant emoji upload | Upload to MinIO + `org_emoji` registry; render in picker and text. | M | Medium |
| Praise / kudos badges | Praise app | `type='praise'` message with a badge template + recipient. | M | Medium |
| Polls | Forms/Polly add-in | `type='poll'` + `poll_options` + `poll_votes` tables; live tally over WS. | M | High |
| Approvals in chat | Approvals app | Reuse the task change-request pattern: an approval message type with status transitions. | M | Medium |
| Loop / live collaborative components | Fluid Framework CRDT | Embed a Yjs CRDT doc in a message. Heavy. **Recommend defer.** | XL | Low |
| Video clip recording | Record & send clip | Browser `MediaRecorder` → upload as attachment; inline player. | M | High |
| Audio / voice message | Voice memo | `MediaRecorder` audio → attachment + waveform player. | M | High |
| Adaptive / actionable cards | Adaptive Cards schema | Define a JSON card schema + renderer + action callbacks. | L | Medium |
| Link unfurling / preview | Auto OG preview | Server fetches OpenGraph metadata for URLs, cache, render a preview card. | M | Medium |

## 5. Reactions & Saving

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Saved-messages view | "Saved" list | The `bookmarks.list` API already exists — build a Saved screen and fix `is_bookmarked` hydration. | S | High |

## 6. Threads & Replies

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Quote reply | Quote + respond | Add `quoted_message_id`; render the quoted snippet above the reply. | S | High |
| Rich content in thread replies | Full features in threads | Reuse the full composer + message renderer (attachments/reactions) inside the thread panel. | M | High |

## 7. Mentions & Tagging

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Tags (@named groups) | Team tags | `tags` table (name + members); resolve `@tag` to a member set at send; fan out notifications. | M | Medium |

## 8. Search & Discovery

> Meilisearch is already running in the stack — this whole section is a natural fit.

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Global message search | Cross-chat search | Index messages into **Meilisearch**; cross-channel search endpoint + UI. | M | High |
| Search files / attachments | File search | Index attachment metadata in Meili; filter by type. | M | High |
| Search filters (date/from/type) | Result facets | Meili filterable attributes + UI facets. | S | High |
| Jump to message / copy link | Deep-link | Route `/messages/{channel}?msg={id}` → scroll + highlight; copy-link action. | M | High |

## 9. Notifications

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| @mention-only mode | Per-channel level | `notification_pref` already supports levels; honor "mentions" in the fan-out + UI. | S | High |
| Mobile / web push | Push service | Web Push (VAPID) via the existing service worker; store subscriptions; push on events. | M | Medium |
| Do Not Disturb / quiet hours | Presence + schedule | User `dnd_until` / `quiet_hours` checked before delivering notifications. | M | High |
| Custom notification sounds | Sound picker | User pref + client sound assets. | S | Medium |
| Read receipts | Per-message seen state | `message_reads` table + WS `read` events + "seen by" UI (schema partly exists). | M | Medium |

## 10. Presence & Status

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Rich presence (Busy/Away/DND/OOF) | Multi-state presence | Extend Redis presence from boolean to a status enum + client setter; auto-away on idle. | M | High |
| Custom status message | Status note | `status_text` field in the presence payload + UI. | S | High |
| Status duration / expiry | Auto-reset | `status_expires_at` + auto-clear. | S | High |
| Out-of-office / calendar sync | OOF from calendar | Manual OOF now (M); calendar-synced later (needs calendar integration, L). | M / L | Medium |

## 11. Message Actions & Management

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Copy link to a message | Shareable link | Deep-link route (shared with §8 jump-to). | S | High |
| Mark unread from a message | Unread pointer | Shared with §2 mark-unread. | S | High |
| Translate a message | Inline translate | Call a translation API (DeepL/Google) on demand; cache per locale. | M | Medium |
| Report a message / concern | Report flow | `message_reports` table + moderator queue + action. | M | High |
| Delivery / read status | Sent/delivered/seen | Sent/delivered from WS acks; seen from read receipts (§9). | M | Medium |

## 12. Moderation, Governance & Compliance

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Retention policies | Purview retention | Org retention window + scheduled purge job (cron/NATS consumer). | M | High |
| eDiscovery / legal hold | Purview eDiscovery | Admin cross-message search + export + a hold flag that blocks purge. | L | Medium |
| Data loss prevention (DLP) | Purview DLP | Content scan (regex/classifier) on send; block/redact. Likely an external service. **Consider buy.** | L | Low–Med |
| Information barriers / supervised chat | Barrier policies | Policy table restricting who can DM whom; enforce at send. | M–L | Medium |

## 13. Integrations & Extensibility

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Incoming webhooks / connectors | Connector URL posts to channel | Per-channel webhook URL that posts a formatted message. **Easiest integration win.** | S | High |
| Outgoing webhooks | Push events out | POST channel events to a configured URL (reuse the app's webhook infra). | S–M | High |
| Slash commands | `/command` | Parse `/cmd` in the composer; dispatch to a command registry. | M | Medium |
| Bots | Bot Framework | Bot identity + inbound message API + outbound post API. | L | Medium |
| Workflow automation | Power Automate | Trigger→action rules on chat events (reuse the task-rule engine concept). | L | Medium |
| Apps / tabs in channels | Teams app platform | Embeddable app panels (iframe + manifest). | L | Low–Med |
| Message extensions | Compose add-ins | Compose-box action framework (builds on adaptive cards). | L | Low |

## 14. Calls & Meetings from Chat

> An entire real-time A/V pillar. **Recommendation: integrate LiveKit (self-host or cloud) or a
> provider (Daily/Twilio/Agora) rather than building an SFU.** Signaling rides the existing WebSocket.

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Audio call | WebRTC + media infra | LiveKit room per channel; join/leave signaling over WS. | L–XL | Medium |
| Video call | WebRTC video | Same LiveKit room with video tracks. | L–XL | Medium |
| Screen sharing | Screen track | LiveKit screen-share track. | M* | Medium |
| Meet now / scheduled meetings | Calendar + rooms | Create room + invite; scheduled needs a calendar module. | L | Medium |
| Recording & transcription | Cloud recording + STT | LiveKit egress recording + Whisper STT for transcripts. | L | Medium |
| Live captions | Streaming STT | Stream audio → Whisper/Deepgram → captions over WS. | L | Low–Med |

## 15. Platform, Access & Data

| Feature | In Microsoft Teams | OrbisPM approach | Effort | Feasibility |
|---|---|---|---|---|
| Desktop app (Windows/macOS) | Electron client | Wrap the web app in **Tauri**/Electron; reuse everything. | M | High |
| Mobile apps (iOS/Android) | Native apps | PWA install now (S); native via React Native later (XL). | S / XL | High / Low |
| Guest / external access | AAD guest | Zitadel external users + a guest role + restricted RLS scope. | L | Medium |
| Cross-tenant federation | AAD federation | Share identities/channels across orgs — breaks tenancy. **Recommend defer.** | XL | Low |
| Message export / data portability | Purview export | Export endpoint → JSON/HTML/CSV per channel/org. | S–M | High |
| Accessibility (screen reader / immersive reader) | Full a11y | ARIA roles, focus management, keyboard nav, labels across the chat UI. Cross-cutting. | M | High |

---

## Suggested phasing

**Phase 0 — Expose what's already built (days, not weeks).** The 33 "Partial" items: pin a message,
forward, saved/bookmarks view, mute, archive, channel rename/delete, categories, per-channel
notification settings, plus fixing the reaction/ownership id bug and adding optimistic sends + error
toasts. Highest value per hour — no new backend.

**Phase 1 — Quick wins (S / High).** Show-hide + mark-unread, quote reply, draft persistence, undo
send, copy-link / jump-to-message, @mention-only, custom status + duration, subject line, incoming
webhooks, message export, PWA install, saved-messages view.

**Phase 2 — Core parity (M / High).** Rich-text composer via Tiptap (unlocks headings, lists, code,
markdown, tables), message importance, announcement posts, GIFs + voice/video messages + polls,
global search + files/filters via Meilisearch, rich presence + custom status, read receipts,
DND/quiet hours, web push, retention, translate, report, outgoing webhooks, desktop app (Tauri),
accessibility.

**Phase 3 — Heavy / platform (L–XL).** Calls & meetings (integrate LiveKit), bots + apps/tabs +
slash commands + message extensions + workflows, eDiscovery / legal hold, DLP, information barriers,
adaptive cards, native mobile, guest access.

**Defer / buy-not-build.** Shared cross-org channels + federation (breaks single-tenant RLS), DLP
and translation/STT (integrate external services), Loop-style live components. These are large
architectural or licensing commitments with low near-term ROI.

## Bottom line on feasibility

- **~55% of the absent list is High feasibility** and fits the current architecture directly —
  much of it is frontend work over endpoints/fields we already have, or reuse of Tiptap and
  Meilisearch that already ship in the repo.
- **The genuinely hard items are few and well-known:** live calls/meetings, the full apps/bots
  platform, enterprise compliance (eDiscovery/DLP/barriers), and cross-tenant federation — all
  best delivered by integrating proven infrastructure rather than building from scratch.
- **Realistic path to "feels like Teams for chat":** Phases 0–2 close the everyday-usage gap in a
  few focused sprints; Phase 3 is where the multi-month, buy-vs-build decisions live.
