# OrbisPM Task Tracker — Session 2026-03-18

## Overview

10 major tasks covering announcements, templates, view persistence, UI polish, org settings, member management, email pipeline optimization, and email preferences.

---

## Task 1: Announcements Full CRUD + Real-time

**Status:** 🔲 Not Started  
**Files:** `frontend/src/components/projects/project-announcements.tsx`, backend announcement handler/service/repo  
**Completion Criteria:**

- [ ] Open UI at port 3001 → navigate to project → announcements tab
- [ ] Create announcement → appears in real-time (no refresh)
- [ ] Read/list announcements works (pagination, unread count)
- [ ] Update announcement → changes reflect in real-time
- [ ] Delete announcement → removes in real-time
- [ ] Pin/unpin works correctly
- [ ] Priority levels display correctly
- [ ] Verify WebSocket events fire (announcement_created, \_updated, \_deleted)

---

## Task 2: TinyMCE Template Builder + DB Save

**Status:** 🔲 Not Started  
**Files:** `frontend/src/app/[orgSlug]/settings/_components/email-templates-tab.tsx`, `frontend/src/components/email-editor-wrapper.tsx`  
**Completion Criteria:**

- [ ] Replace Unlayer editor with TinyMCE
- [ ] Template builder uses TinyMCE rich text editor
- [ ] Templates save to database (not cache)
- [ ] Template load from DB on page open
- [ ] Template preview works
- [ ] Merge tags ({{variable}}) still work
- [ ] All 5 template types editable (notification, password_reset, otp, announcement, welcome)

---

## Task 3: Simplify Template Creation UI

**Status:** 🔲 Not Started  
**Files:** `frontend/src/app/[orgSlug]/settings/_components/email-templates-tab.tsx`  
**Completion Criteria:**

- [ ] Remove unnecessary buttons and modal windows
- [ ] Template creation is streamlined (select type → edit → save)
- [ ] No extra confirmation dialogs unless destructive
- [ ] Clean, minimal UI with only essential controls

---

## Task 4: Preserve Task View on Tab Switch

**Status:** 🔲 Not Started  
**Files:** `frontend/src/app/[orgSlug]/projects/[projectId]/page.tsx`, `frontend/src/stores/ui-store.ts`  
**Completion Criteria:**

- [ ] Switch to tree view → navigate to another tab → return → tree view preserved
- [ ] Expanded task nodes remain expanded after tab switch
- [ ] Active task view (columns/list/tree/calendar) persisted per project
- [ ] Filter state preserved on tab switch
- [ ] Works with browser back/forward navigation

---

## Task 5: 95% Blur Effect on Dropdowns/Popups/Filters

**Status:** 🔲 Not Started  
**Files:** All dropdown, context menu, filter, and popup components  
**Completion Criteria:**

- [ ] Right-click context menus have 95% backdrop blur (`backdrop-blur-[20px] bg-base-100/95`)
- [ ] Dropdown windows have 95% blur effect
- [ ] Filter cards have 95% blur effect
- [ ] All popup/modal overlays properly visible with blur
- [ ] Content behind is blurred but still partially visible
- [ ] Verified across all themes (light/dark)

---

## Task 6: Remove Roles Tab + Rename Permissions

**Status:** 🔲 Not Started  
**Files:** `frontend/src/app/[orgSlug]/settings/page.tsx`, `roles-tab.tsx`, `permissions-tab.tsx`  
**Completion Criteria:**

- [ ] Roles tab removed from org settings
- [ ] No dead code left from roles tab
- [ ] Permissions tab renamed to "Roles & Permissions"
- [ ] All navigation/links updated
- [ ] Settings page works correctly with remaining tabs

---

## Task 7: Fix Members 3-Dot Action Menu

**Status:** 🔲 Not Started  
**Files:** `frontend/src/app/[orgSlug]/settings/_components/members-tab.tsx`  
**Completion Criteria:**

- [ ] 3-dot action menu visible for ALL rows regardless of row count
- [ ] Menu doesn't shrink or get hidden with few rows
- [ ] Dropdown opens correctly (no overflow hidden issues)
- [ ] Works with 1 member, 3 members, and many members

---

## Task 8: Full Members CRUD

**Status:** 🔲 Not Started  
**Files:** members-tab.tsx, backend org_handler/org_service, Zitadel management API  
**Completion Criteria:**

- [ ] Create account (name, email, password, role)
- [ ] Update member role
- [ ] Update member email
- [ ] Update member password (admin reset)
- [ ] Force MFA on member
- [ ] Disable/enable member account
- [ ] Delete member (remove from org + optionally deactivate Zitadel account)
- [ ] All operations accessible from 3-dot action menu
- [ ] Confirmation dialogs for destructive actions
- [ ] Success/error toasts for all operations

---

## Task 9: Email Batching/Stacking Pipeline

**Status:** 🔲 Not Started  
**Files:** `backend/internal/worker/handlers.go`, `backend/internal/email/sender.go`  
**Completion Criteria:**

- [ ] Announcement emails delayed 2 minutes before sending
- [ ] Task update emails delayed 5 minutes before sending
- [ ] Multiple updates within delay window are stacked/merged
- [ ] Single consolidated email sent per user per batch window
- [ ] Email contains all stacked updates in organized format
- [ ] Immediate emails still work for critical notifications (password reset, OTP)
- [ ] Redis-backed batch queue for pending emails

---

## Task 10: Email Preferences UI in Profile

**Status:** 🔲 Not Started  
**Files:** `frontend/src/app/[orgSlug]/profile/page.tsx`, `backend/internal/handler/notifpref_handler.go`  
**Completion Criteria:**

- [ ] Email preferences section visible in user profile page
- [ ] Toggle switches for each notification type
- [ ] Categories: announcements, task updates, mentions, comments, assignments
- [ ] Changes save to backend via existing PUT endpoint
- [ ] Preferences loaded on page open via GET endpoint
- [ ] Only opted-in emails are sent (verified end-to-end)
- [ ] Default preferences set for new users (all enabled)

---

## Completion Summary

| Task | Description                   | Status |
| ---- | ----------------------------- | ------ |
| 1    | Announcements CRUD + Realtime | 🔲     |
| 2    | TinyMCE Template Builder + DB | 🔲     |
| 3    | Simplify Template UI          | 🔲     |
| 4    | Preserve Task View            | 🔲     |
| 5    | 95% Blur Effects              | 🔲     |
| 6    | Remove Roles Tab              | 🔲     |
| 7    | Fix Members Action Menu       | 🔲     |
| 8    | Full Members CRUD             | 🔲     |
| 9    | Email Batching Pipeline       | 🔲     |
| 10   | Email Preferences UI          | 🔲     |
