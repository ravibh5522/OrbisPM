# Messaging — Complete Journey Spec (every feature, end-to-end)

**How to read this:** each feature is written as the *full journey a user expects* (Teams/Slack-grade),
broken into steps. Status per step:

- ✅ done · 🟡 partial / rough · ❌ missing

The rule: **when every step here is ✅, the module is "done."** Part B at the end is the consolidated
gap backlog (every 🟡/❌), which is the build list.

---

## A. The journey lens

Every feature = a chain, not one action:

> **trigger → affordance/preview → action → my feedback → status → propagation to others → follow-ups**

I'll walk all 17 journeys through that chain.

---

## 1. Send a text message
1. Focus composer, type ✅
2. Enter = send, Shift+Enter = newline 🟡 *(verify)*
3. Optimistic "sending…" bubble ❌ *(appears only after server round-trip)*
4. My message shows immediately ✅
5. **Status: sent ✓ → delivered ✓✓ → read (green/eye)** ❌
6. Others receive it live (WS) ✅
7. Failure → toast + retry affordance 🟡 *(toast yes, no retry)*
8. Edit (shows "edited") ✅ · Delete (soft) ✅
9. **Others see edit/delete live** 🟡 *(edit/delete WS handled; verify)*

## 2. Send a link
1. URL becomes clickable ✅
2. Trailing punctuation / multiple links handled 🟡
3. **Unfurl preview card** (title, desc, thumbnail) ❌
4. **Preview shows in composer with ✕ to remove** ❌
5. Sent message renders the card ❌
6. Card image safe under CSP (proxy) ❌
7. Removed-preview stays removed ❌
8. SSRF-safe server fetch ❌ *(security-critical)*

## 3. Send an image / file (attach, drag, **paste**)
1. Attach button / drag-drop / **Ctrl+V paste** ✅
2. Composer shows thumbnail preview + remove ✅
3. Upload progress / error per file ✅
4. Sent → renders as image (thumbnail grid) ✅
5. Click → lightbox ✅ · Download ✅
6. Caption + multiple files (caption not duplicated per file) 🟡 *(known bug: caption repeats per file)*
7. Non-image files show as file chips with icon/size 🟡 *(verify)*
8. Paste of large image / many images 🟡 *(verify)*

## 4. Reactions
1. Hover → react bar / picker ✅
2. Add reaction (optimistic) ✅
3. **Remove** (click your chip) ✅ · picker highlights used ✅
4. **Change** (remove one, add another) ✅
5. Count + who-reacted tooltip ✅
6. **Others see my reaction live** 🟡 *(reaction.added handled; verify end-to-end)*
7. Reaction on a message not yet loaded 🟡

## 5. Threads / replies
1. Open thread ✅ · reply ✅
2. **Reply count on parent updates live** 🟡 *(store not incremented)*
3. Rich content in replies (attachments/reactions) ❌ *(plain text only)*
4. Quote reply ❌
5. Others see thread replies live 🟡 *(verify)*

## 6. Forward
1. ⋯ → Forward opens dialog ✅
2. Multi-select **channels** ✅ · **people** ❌
3. Optional note ✅
4. **"Send separately" vs "Send as a group"** ❌
5. **"Together" creates a group chat** with those people ❌
6. Dedup existing identical group 🟡
7. Sent → target shows **"Forwarded from <original author>"** 🟡 *(only "Forwarded" tag)* + quoted original ❌
8. Success summary ("sent to 3 / group created") 🟡

## 7. Save / bookmark
1. Save from ⋯ menu / hover icon ✅
2. Unsave ✅ · persists across reload ✅
3. Saved panel (open from header) ✅ · jump to message ✅
4. Optional note on a saved item ❌ *(backend supports note)*
5. Empty state ✅

## 8. Pins
1. Pin/unpin (gated) ✅ · inline "Pinned" label ✅
2. **Pinned bar at top** ✅ · expand ✅ · jump+highlight ✅ · unpin ✅
3. **Others' pinned bar updates live** ❌ *(no WS handler for message.pinned)*
4. Pinned count ✅ · jump when message not loaded 🟡 *(shows "scroll up" toast)*
5. Backend stability on pin (panic fixed) ✅

## 9. Mentions
1. @ autocomplete ✅ · @person ✅
2. @channel / @everyone ❌
3. Tags (@named group) ❌
4. Mention notifies the person 🟡 *(verify delivery)*
5. Mentions activity/feed ❌
6. Mentioned text edit removes the id 🟡 *(stale mention risk)*

## 10. Search
1. Search **within a channel** ✅
2. **Global search across all chats** ❌
3. Search files/attachments ❌
4. Filters (date/from/type) ❌
5. Click result → jump + highlight 🟡 *(jump exists for pins/saved; wire for search)*

## 11. Presence & typing
1. Online/offline ✅ · typing shows **names** ✅
2. Rich presence (Busy/Away/DND/OOF) ❌
3. Custom status message ❌ · duration ❌
4. Last-seen surfaced 🟡
5. Typing clears on disconnect 🟡

## 12. Notifications
1. In-app bell + unread counts ✅
2. **Read receipts** ❌ *(ties to journey 15)*
3. Per-channel level (all/mentions/off) 🟡 *(API only, no UI)*
4. **Mute channel** 🟡 *(toggle added; verify it actually suppresses)*
5. @mention-only ❌ · DND/quiet hours ❌ · push ❌ · sounds ❌

## 13. Channel lifecycle
1. Create (team/group/DM) ✅
2. Rename ✅ · Archive ✅ · Delete (confirm) ✅
3. Mute ✅ · Pin-to-top ✅ · Hide ❌
4. **Others' sidebars update live** on create/rename/archive/delete ❌ *(no WS handlers)*
5. Member add/remove/role ✅ · live 🟡
6. Read-only / moderation UI 🟡

## 14. DMs & group chats
1. Start DM ✅ · group ✅
2. **Create group from Forward "together"** ❌
3. Name a group 🟡 *(on create; no rename via DM flow)*
4. Add/remove people ✅ · leave 🟡 · hide ❌
5. Group avatar / member stack ❌

## 15. Message status & "message info"
1. **Sent ✓** ❌
2. **Delivered ✓✓** ❌ *(needs delivery tracking)*
3. **Read (green ✓✓ / eye)** ❌ *(read half is cheap: last_read_at ≥ msg time)*
4. **"Seen by" panel** (who saw / who hasn't / when) ❌
5. Live update via WS **read** event ❌
6. Privacy toggle (org can disable receipts) ❌
7. Limit seen-by to DMs/small groups ❌

## 16. Drafts
1. Draft saved per channel ✅ · restored on switch ✅
2. **"Draft" indicator in the sidebar** ❌
3. Draft cleared on send ✅

## 17. Copy / link-to-message
1. Copy text ✅
2. **Copy link to message** ❌
3. Open link → scroll + highlight the message ❌ *(scroll+highlight infra exists from pins)*
4. Mark-unread from a message ❌ *(needs small backend)*

---

## B. Consolidated gap backlog (build list)

Grouped by theme; ordered by value. Closing all of these = "boom, done."

### B1. Live propagation (WS inbound handlers) — *unblocks several journeys*
- ❌ `message.pinned/unpinned` → refresh pinned bar for everyone (8.3)
- ❌ channel `created/renamed/archived/deleted` → update sidebars (13.4)
- ❌ `read` event → drive ticks & seen-by (15.5)
- 🟡 verify reaction/edit/delete/thread propagate live (1.9, 4.6, 5.5)

### B2. Message status & seen-by (journey 15)
- ❌ Read ✓✓ + **Seen-by** panel (cheap via `last_read_at`)
- ❌ `mark-read` must broadcast a read event
- ❌ Delivered ✓✓ (phase 2, delivery tracking)
- ❌ Privacy toggle; limit to DMs/small groups

### B3. Link unfurl (journey 2)
- ❌ Backend `unfurl` endpoint with **SSRF guard** + Redis cache + image proxy
- ❌ Composer preview card with ✕ dismiss
- ❌ Render card under sent message; remember dismissed

### B4. Forward completion (journeys 6 & 14)
- ❌ Forward to **people** (via getOrCreateDM)
- ❌ **Send separately vs together**; together → **create group**
- 🟡 dedup group; ❌ quoted original; 🟡 "Forwarded from <author>"

### B5. Message follow-ups (journeys 17, 10)
- ❌ Copy link to message + jump/highlight (infra exists)
- ❌ Mark-unread (small backend)
- ❌ Global message search (reuse Meilisearch); wire search-result jump

### B6. Composer/thread polish
- 🟡 Caption-per-file bug (3.6); ❌ rich thread replies (5.3); ❌ quote reply (5.4)
- 🟡 Enter/Shift+Enter verify (1.2); ❌ optimistic "sending" bubble (1.3)

### B7. Presence & notifications depth (journeys 11, 12)
- ❌ Rich presence + custom status; 🟡 verify mute suppresses; ❌ mention-only/DND/push/sounds
- ❌ @channel/@everyone, tags, mentions feed (journey 9)

### Verify-only (already built, confirm the journey holds end-to-end)
- Reactions/edit/delete live to others; mute actually silences; delete clears active channel &
  updates others; paste of large/many images; non-image file chips; typing with 3+ users.

---

## C. Recommended execution order
1. **B1 live propagation** — foundational; makes everything multiplayer.
2. **B2 status + seen-by** — the "did they see it" journey (read half is cheap).
3. **B3 link unfurl** — the most visible polish.
4. **B4 forward-to-people/group + attribution** — your exact scenario.
5. **B5 copy-link/jump, mark-unread, global search.**
6. **B6/B7 polish & depth.**

I'll start at B1 and work down, building + verifying each journey end-to-end with two accounts so
"others see it" is actually proven — not just the actor's screen.
