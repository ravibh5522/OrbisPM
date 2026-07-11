# Daily Work Log — Messaging (Chat) — 2026-07-10

**Focus:** OrbisPM Messages module — closing the gap toward Microsoft Teams / Slack parity.
**Scope today:** correctness fixes, feature completion, one backend stability bug, and analysis docs.
All changes built clean (`next build` typecheck + lint), deployed locally, and smoke-tested against
the running stack. Nothing committed yet (local working tree).

---

## 1. Analysis & planning deliverables

- **Full feature comparison** of OrbisPM Messages vs Microsoft Teams — 139 capabilities across 15
  categories, each marked Present / Partial / Absent. (`MESSAGING_VS_TEAMS_CHECKLIST.md`)
- **Approach & feasibility document** — for every absent feature: how Teams does it, how we'd build
  it here, effort (S/M/L/XL) and feasibility, plus a phased roadmap. (`MESSAGING_TEAMS_PARITY_APPROACH.md`)

## 2. Correctness fixes

- Fixed reaction "you reacted" highlight using the wrong user id (`user.id` → `internal_id`).
- Fixed thread-reply ownership using the wrong user id.
- Added error toasts to 6 previously-silent failures (send, edit, delete, react, bookmark, thread reply).

## 3. Backend stability bug (important)

- **A single pin/unpin was crashing the entire messaging service.** Pin/unpin events publish a nil
  payload; the WebSocket hub assigned into a typed-nil map and panicked, and the NATS consumer had no
  recovery — so the whole service restarted on every pin. Fixed the hub's nil-map handling **and**
  added a `recover()` in the consumer so one bad event can never take the service down again.
  Verified: pin/list/unpin cycle clean, 0 panics.

## 4. Features completed / made usable

**Messages & reactions**
- Pin / Unpin a message (permission-gated) + inline "Pinned" label.
- **Pinned bar at the top of the channel** — expandable list, click to jump-and-highlight a pinned
  message, unpin from the bar.
- Reactions: add / remove / change, made obvious — click your chip to remove, picker highlights the
  emojis you've already used, optimistic (instant) updates, expanded to 16 emojis.
- "Who reacted" tooltip on reaction chips.
- Clickable links in messages.
- "Forwarded" indicator on forwarded messages.
- Jump-to-latest button when scrolled up.

**Forward** — reworked into a proper dialog: multi-select target channels, optional note/message,
"Forward (N)" button; posts to all selected channels.

**Saved messages** — clear "Save Message" / "Remove from Saved" in the menu, saved-messages panel
(open from the header bookmark icon) with jump-to; bookmark state now persists across reloads.

**Copy message text.**

**Composer**
- **Paste images / screenshots (Ctrl+V)** — pasted images preview in the composer and send as
  rendered image attachments (Teams/Slack-style).
- Draft persistence per channel (survives channel switches).
- Typing indicator shows real names.
- Expanded emoji picker (16).

**Channel management** (in the details panel, admin-gated where destructive)
- Mute / Unmute channel.
- Pin channel to top / Unpin.
- Rename channel.
- Archive channel.
- Delete channel (with confirmation).

## 5. Environment / setup work

- Brought the full local stack up (28 containers) and fixed a compose bootstrap issue
  (monitoring stack's external network ordering).
- Bootstrapped Zitadel auth for the fresh local instance (OIDC app + machine token wired into env);
  app login now works.
- Seeded the demo org (Acme Corp): 20 users, 5 teams, 4 projects, 200 tasks, plus 6 real login
  personas for RBAC testing.

---

## 6. Journey completion — Teams-parity (the "whole journey, not just the click")

Reframed each feature as a full user journey (trigger → preview → action → **status** →
**others see it live** → follow-ups) and closed the biggest gaps. Reference:
`MESSAGING_JOURNEYS_SPEC.md` (all 17 journeys mapped with ✅/🟡/❌).

- **B1 — Live propagation (multiplayer).** The backend already emitted pin/channel/read events; the
  frontend was ignoring them. Added WebSocket handlers so pins, channel rename/archive/delete, and
  read-receipts now update on **everyone's** screen without refresh.
- **B2 — Message status + "Seen by".** Own messages now show sent ✓ / read ✓✓ (green) and a
  **"Seen by" panel** (who saw it / who hasn't), computed from read position and updating live.
- **B3 — Link preview (unfurl).** Shared links now render as a **rich card** (title, description,
  thumbnail) like Teams/Slack. New backend endpoint fetches Open Graph data with a **strict SSRF
  guard** (internal/metadata hosts refused — verified) + Redis caching.
- **B4 — Forward, completed.** Forward now targets **people and channels**, with a
  **"Send separately" vs "Send as a group"** choice — "together" creates a group chat with those
  people. (Your exact scenario.)

All four built clean, deployed, and verified (including a two-account/live path where relevant);
messaging-service stable, 0 panics.

## Status

- All of the above are **implemented, building clean, and deployed** to the local stack for testing.
- **Backend touched:** messaging-service (hub + NATS consumer stability fix) — rebuilt, healthy.
- **Frontend touched:** chat components (message list, composer, channel header) + 2 new modal
  components (Forward, Saved messages).
- **Remaining / next:** mark-unread and rich-text composer need small backend endpoints; global
  message search can reuse the existing Meilisearch. See the approach doc for the full roadmap.
