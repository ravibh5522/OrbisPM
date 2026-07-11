# Messaging — Journey Analysis & Gaps

**Purpose:** Step back from "did the feature work" to "does the whole user journey work like Teams/Slack."
You're right — most of what I shipped is the **happy path** of each feature. Real features carry a
*journey* of sub-behaviours around them (preview, status, propagation, attribution, choices). This
document (1) recalls the 30+ changes and analyses each, (2) walks your link→send→forward scenario to
surface what I missed, and (3) states what I'll build next and why.

---

## Part 1 — The mindset I was missing

A "feature" is not one action; it's a chain:

> **trigger → preview/affordance → action → feedback → status → propagation to others → follow-up actions**

Example — **sending a message with a link** is not "text saved." It's: link becomes clickable → a
rich preview renders → I can remove the preview → I press Enter/Send → I see *sent* → then *delivered*
→ then *read* → I can open "message info" to see who saw it. I shipped only "text saved + clickable."

I'll apply this chain to every feature below.

---

## Part 2 — Your scenario, walked step by step

**Scenario:** paste a link → send it to a person → then forward that message to three people together.

| Step | What happens today | What a Teams-grade journey needs | Gap |
|---|---|---|---|
| Paste a link | Becomes a clickable link (I added this) | Same, but also strip tracking, don't break on trailing punctuation | Minor polish |
| Link appears | Just underlined text | **Rich preview card** — title, description, thumbnail (OG unfurl) below the message | **MISSING** |
| Before sending | Nothing | Preview shows **in the composer** with an **✕ to remove/cross** the card | **MISSING** |
| Send | Enter or Send button posts | Same — confirm Enter=send, Shift+Enter=newline | Verify |
| After send (sender view) | Message just appears | **Sent = ✓**, **Delivered = ✓✓**, **Read = green ✓✓ / eye** | **MISSING** |
| Want to know who saw it | No way | **"Message info" / Seen-by** — who read, who hasn't, when | **MISSING** |
| Forward | Multi-select **channels** + note (I added) | Forward to **people**, and choose **"send separately" vs "send together"** | **PARTIAL** |
| Forward "together" | N/A | The 3 people become a **new group chat**; the message lands there | **MISSING** |
| Forwarded message look | Shows a plain "Forwarded" tag | **"Forwarded from <original author>"** attribution + quoted original | **PARTIAL** |

So the scenario exposes **four real journeys** I under-built: link preview, message status, forward-to-people/group, and forwarded attribution — plus live propagation (below).

---

## Part 3 — What I'm going to do, and why (the things I missed)

### A. Link preview / unfurl (with composer preview + dismiss)
- **Why required:** a shared link that renders as raw text looks broken next to Teams/Slack. The point
  of sharing a link is the *card* (title, image, description).
- **What the user sees:** paste a URL → a preview card appears in the composer (thumbnail + title +
  domain) with an **✕**; the sent message shows that card below the text; clicking opens the link.
- **How it's built:** backend `GET /chat/unfurl?url=` fetches the page server-side, parses Open Graph
  tags, caches in Redis, returns `{title, description, image, site}`. Frontend shows a preview
  component in composer and in the message.
- **Side aspects / must handle:** **SSRF security** (block internal IPs/metadata endpoints, allow-list
  schemes) — critical; external image loading vs CSP (may need to **proxy the thumbnail** through the
  backend/MinIO); caching to avoid re-fetch; graceful "no preview" when a site blocks it; a stored
  flag when the user removed the card so it doesn't come back.
- **Verify:** paste common links (news, github, youtube), a link with no OG tags, an internal/private
  URL (must be refused), and a very slow site (timeout). Confirm the removed-preview stays removed.

### B. Message status — sent / delivered / read + "message info"
- **Why required:** the sender must know a message was **sent, delivered, and read** — your ticks/eye
  icon + "who saw it." This is table-stakes for 1:1 and small groups.
- **What the user sees:** on **your own** messages — `✓` sent, `✓✓` delivered, green `✓✓`/eye when
  read; right-click / info → **"Seen by"** list (who read, who hasn't, timestamps).
- **How it's built (staged):**
  - **Read (cheap, mostly no new schema):** `channel_members.last_read_at` already exists. "Seen by
    this message" = members whose `last_read_at >= message.created_at`. So **Seen-by is computable now**
    from members we already fetch. Needs live refresh via a WS **read** event (see D).
  - **Delivered:** needs per-recipient delivery tracking (WS ack / presence). Heavier — phase 2.
  - **Sent:** immediate (message persisted).
- **Side aspects / must handle:** **privacy** — read receipts are sensitive; orgs often allow disabling
  (a setting); performance is fine (timestamp compare); large channels shouldn't show per-member
  seen-by (limit to DMs/small groups like Teams); the current `mark-read` must **broadcast** so ticks
  update live (today it likely doesn't).
- **Verify:** two accounts — send, confirm sender sees sent→read as the other opens the channel; a
  third who hasn't read shows "unseen"; muted/absent user; make sure it updates without refresh.

### C. Forward to people + "separately vs together" + group creation
- **Why required:** your exact scenario — forwarding to **three people together** should create a
  **group**, not three lonely DMs; and the user must **choose** separate vs together.
- **What the user sees:** in Forward, search & multi-select **people and channels**; a toggle
  **"Send separately / Send as a group"**; on "together," a new group chat is created with those people
  and the message lands there; on "separately," it goes to each person's DM.
- **How it's built:** "forward to a person" = `getOrCreateDM(userId)` then forward. Separately = loop
  DMs. Together = `channels.create(type:"group")` + add each member, then forward into it. (All
  endpoints exist.)
- **Side aspects / must handle:** naming the group (auto from member names, editable); **dedup** — if a
  group with exactly those people exists, reuse it (Teams reuses); who can create groups (permission);
  the note applies to each target; success summary ("sent to 3 people / created group").
- **Verify:** separate to 3 → three DMs each with the message; together to 3 → one group with 4 members
  (you + 3) containing the message; forwarding to a mix of a channel + people.

### D. Live propagation to others (I only did the actor's view)
- **Why required:** when I pin/forward/rename/delete or read a message, **other people's clients**
  should update **without refresh**. Several of my features only update the actor's screen.
- **Gaps to close:** the frontend has **no inbound WS handlers** for `message.pinned/unpinned`,
  channel create/update/delete/archive, or read receipts — so pins, channel changes, and (future)
  ticks won't live-update for others. `mark-read` likely doesn't broadcast at all.
- **What I'll do:** add inbound handlers for pin/unpin (refresh the pinned bar), channel
  create/rename/archive/delete (update the sidebar), and a **read** event to drive ticks/seen-by.
- **Verify:** two browsers side by side — pin in one, bar appears in the other; rename in one, sidebar
  updates in the other.

### E. Forwarded-message attribution
- **Why required:** "Forwarded" alone loses context. Teams shows **"Forwarded from <original
  author>"** and often the quoted original.
- **What I'll do:** the backend already stores `forwarded_from_id`; resolve the original message and
  show "Forwarded from <sender>" with a quoted snippet.
- **Verify:** forward a message, confirm the target shows the original author, not just "Forwarded."

---

## Part 4 — Recall & analysis of the 30+ changes already made

For each: **why**, **what the user sees / how it's shown**, and **side aspects to verify**.

### Correctness fixes
| Change | Why | User sees / shown | Side aspects to verify |
|---|---|---|---|
| Reaction "you reacted" id fix | Wrong id → own reaction never highlighted | Your reaction chip is highlighted | Confirm across users; grouped reactions |
| Thread ownership id fix | Own replies mis-styled | Your thread replies align as "you" | DMs vs channels |
| 6× error toasts | Failures were silent | A toast explains the failure | Offline, 403, timeout each show a toast |

### Reactions
| Change | Why | User sees | Verify |
|---|---|---|---|
| Optimistic toggle | Felt laggy | Instant add/remove | Revert on server error; double-click |
| Add/remove/change clarity | Couldn't tell how to remove | Click chip = remove; picker highlights used | Others see change live (needs D) |
| Expanded set + who-reacted tooltip | Too few emojis; unknown who | 16 emojis; hover shows names | Names resolve for non-members |

### Pins
| Change | Why | User sees | Verify |
|---|---|---|---|
| Pin/unpin + gating | Built but no UI | ⋯ → Pin; "Pinned" label | Only admins/mods see it |
| **Pinned bar at top** | Pins were invisible | Top bar, expand, jump+highlight, unpin | **Live update for others (D)**; jump when message not loaded |

### Forward / Save / Copy
| Change | Why | User sees | Verify |
|---|---|---|---|
| Forward (multi + note) | Was one-shot, no dialog | Dialog: multi-select + note | **People + separately/together (C)**; attribution (E) |
| Saved view + Save in menu + persistence | Save was hidden; reset on reload | "Save Message"; Saved panel; jump | Note on save; empty state |
| Copy text | — | Toast "Copied" | Clipboard blocked → toast |

### Messages
| Change | Why | User sees | Verify |
|---|---|---|---|
| Clickable links | Raw URLs | Underlined link, new tab | **Preview card (A)**; punctuation edge cases |
| Forwarded indicator | No context | "Forwarded" tag | **Attribution (E)** |
| Jump-to-latest | Lost when scrolled | ⬇ button | Appears only when scrolled up |

### Composer
| Change | Why | User sees | Verify |
|---|---|---|---|
| **Paste image/screenshot** | Couldn't paste | Thumbnail preview → sends as image | Multiple images; large image; paste + text |
| Draft persistence | Lost text on switch | Text restored per channel | "Draft" hint in sidebar (nice-to-have) |
| Typing names | "Someone" only | Real names | 3+ typers; self excluded |
| Expanded emoji | Too few | 16 in picker | — |

### Channel management (details panel)
| Change | Why | User sees | Verify |
|---|---|---|---|
| Mute / Pin-to-top | No UI | Toggle | Mute actually suppresses notifications; sidebar reflects it |
| Rename / Archive / Delete | No UI | Actions (admin) | **Others' sidebars update (D)**; delete clears active channel; confirm dialog |

### Backend / platform
| Change | Why | Impact | Verify |
|---|---|---|---|
| Pin nil-map panic fix + consumer recover | One pin crashed the whole chat service | Chat stays up on any bad event | Pin/unpin storm; other event types |
| Zitadel bootstrap, demo seed, stack up | Local env unusable | App logins; populated demo | Covered |

---

## Part 5 — Prioritised plan (recommended order & why)

1. **Message status (sent/delivered/read) + "Seen by" message info** — highest-value, and the *read*
   half is cheap (reuse `last_read_at`). Do read+seen-by first, delivered second.
2. **Link preview / unfurl** (backend unfurl + SSRF guard + composer/message card + dismiss) — the
   most *visible* polish; your first complaint.
3. **Forward to people + separately/together + group creation** + **forwarded attribution** — completes
   your exact scenario.
4. **Live propagation (WS handlers)** — makes pins, channel changes, and ticks update for everyone;
   underpins 1 and the pin bar.

Each of these is "required, and I missed it earlier" because I built the actor's happy path and skipped
the **status, preview, propagation, and choice** layers that make it feel like Teams.

**Recommendation:** start with **#1 (read receipts + seen-by)** and **#2 (link preview)** — together they
transform the send-a-link-and-know-it-was-seen journey. Confirm and I'll begin.
