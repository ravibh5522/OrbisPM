# OrbisPM — Orbis Drive Design Doc

> **Version**: 1.0 — Phase 1 (upload, view, share across all pages).
> **Primary goals**: (1) One file store for the whole org: org-wide docs, team docs, project docs and personal docs.
> (2) Access derived from the existing RBAC (org → team → project roles), plus explicit shares to users, teams, projects or the whole org.
> (3) Reachable from everywhere: a global right-side Drive panel, a full Drive page, and a Drive tab on every Team and Project page.
> **Out of scope for Phase 1**: live co-editing, "attach from Drive" in chat, version history, public links, virus scanning. These are designed for in [§11](#11-future-phases) so Phase 1 does not block them.

---

## 1. Current State Analysis

### 1.1 What already exists

| Concept | Current State | Gap for Drive |
|---------|---------------|---------------|
| **Object storage** | `internal/storage/minio.go` S3-compatible client (`Upload`, `Download`, `PresignedGetURL`, `PresignedPutURL`, `Delete`, `Stat`) | `NewClient` sets a **public-read policy on the whole bucket** (`minio.go:69-83`). Drive files must never be public. |
| **Task attachments** | `attachments` table, `AttachmentService.DirectUpload` (backend-proxied upload), `StreamContent`, presigned GET (1h). Key `orgs/{orgId}/attachments/{uuid}/{filename}`. Max 30 MB. | Scoped to a task/comment/CR only. `attachmentRepo.GetByID` filters on `id` only, so it has no org check. |
| **Generic uploads** | `POST /orgs/{orgId}/uploads`, images only, 5 MB, public URL (avatars, logos) | Not for documents. |
| **Chat attachments** | `message_attachments` in messaging-service, proxied via `/api/v1/chat/attachments/{id}/file`, 50 MB | Bound to a message; no reuse. Stream/URL endpoints do not check channel membership. |
| **RBAC** | DB-driven `permissions` / `roles` / `role_permissions` per org and scope (`000006`). `PermissionResolver.HasPermission(ctx, user, org, scope, scopeID, resource, action)` with team → project inheritance via `project_teams`. Route shorthand `prm(scope, param, resource, action)` in `cmd/api/main.go:527`. | No `drive` resource. No per-object (item-level) grants anywhere in the system. |
| **Tenancy** | `org_id` on every row. RLS policies exist, but most reads run on the pool outside a tx as the table owner. | **App-level `org_id` filtering is the real guard.** Every Drive query must filter `org_id`. |
| **Realtime** | Org WebSocket (`websocket/org_hub.go`). `OrgHub.Start` broadcasts **every** domain event to **every** connection in the org. | Drive events would leak private file names. Needs per-user delivery. |
| **Activity / notifications** | `activity_log` via asynq `activity:log`; `notification:send` worker (in-app + email) | Reusable as is. |
| **Quotas** | `billing_plans.limits.storage_gb` (free 1, pro 50, enterprise -1); `domain.ErrPlanLimitHit` (402) | **Nothing enforces storage limits.** |
| **Invitations** | No invite entity. `InviteByEmail` adds existing users straight to `org_members`. | Drive shares only target existing org members in Phase 1. |
| **"Platform" scope** | No platform/super-admin concept in the backend. | "Platform docs" = **org-wide space** (`scope_type = 'org'`). |

### 1.2 Frontend building blocks we'll leverage
- Next.js 15 App Router, Tailwind v4 + DaisyUI v5, lucide-react, sonner. Hand-rolled primitives in `components/ui/` (`modal.tsx`, `tabs.tsx`, `shared.tsx` → `Avatar`, `EmptyState`, `ConfirmDialog`; `form-fields.tsx` → `Combobox`).
- TanStack Query v5 (persisted to IndexedDB), Zustand stores (`ui-store.ts`, `auth-store.ts`).
- `lib/api.ts` fetch wrapper with `upload(path, FormData)` and `downloadBlob`.
- Policies: `lib/policies.ts` (`computeOrgPolicies` :110, `computeProjectPolicies` :166, `computeTeamPolicies` :188) + `hooks/use-policies.ts`.
- `@tanstack/react-virtual` for long lists; native HTML5 drag-and-drop (already used in `components/chat/message-input.tsx:134-149`).
- File preview lightbox exists **three times** (task `AttachmentsSection` `tasks/[taskId]/page.tsx:1383-1620`, `CRDetailAttachments` in `change-requests.tsx:891`, chat `message-list.tsx:600-630`). Drive extracts a shared `FilePreview`.

### 1.3 Pre-existing issues found during research (not fixed by this doc)
These are outside Drive's scope but affect its trust model. Each should get its own ticket.

| Issue | Location | Severity |
|-------|----------|----------|
| AWS keys committed in plain text; `.env*` files tracked despite `.gitignore` | `backend/s3.txt`, repo root | **Critical: rotate keys** |
| Whole bucket is public-read, including task attachments | `internal/storage/minio.go:69-83` | High |
| Attachment lookup by `id` only (cross-org IDOR) | `repository/attachment_repo.go:39-43` | High |
| Chat attachment stream/URL without membership check | `messaging-service/internal/service/upload_service.go:158,193` | High |
| Org hub broadcasts all events to all org connections | `internal/websocket/org_hub.go:95-112` | Medium (Drive fixes this for `drive.*` events) |

---

## 2. Core Concepts

```
Org
 ├─ Org space            (scope_type = org)       "Company docs" — everyone in org can read
 ├─ Team spaces          (scope_type = team)      one per team
 ├─ Project spaces       (scope_type = project)   one per project
 └─ Personal spaces      (scope_type = user)      "My files" — private to the owner

Every space is a tree of items:   folder ─┬─ folder ─── file
                                          └─ file
```

- **Space**: implicit; there is no `drive_spaces` table. A space is the pair `(scope_type, scope_id)` and exists as soon as its team/project/user exists.
- **Item**: a folder or a file. Belongs to exactly one space. `parent_id = NULL` means the space root.
- **Share**: an explicit grant of an item role (`viewer` / `editor` / `manager`) on one item to a grantee (`user` / `team` / `project` / `org`). It applies to the item **and all its descendants**.
- **Grants only, no denies.** Access to a child is always ≥ access to its parent. This is what keeps listing O(1) permission checks per folder instead of per item (§4.4).

### 2.1 Item roles

| Item role | View / download | Upload into folder, new folder, rename, move (same space) | Share | Delete / restore any item | Manage shares |
|-----------|:---:|:---:|:---:|:---:|:---:|
| `viewer`  | ✅ | — | — | — | — |
| `editor`  | ✅ | ✅ | up to `editor` | own uploads only | own shares |
| `manager` | ✅ | ✅ | up to `manager` | ✅ | ✅ |

The uploader of a file can always delete or trash it (unless the space itself was removed).

---

## 3. Data Model

All tables live in the main backend DB. Migration **`000029_drive`**, using the same structure as `000017_announcements` (tables → indexes → RLS → grants → permission seed → backfill).

### 3.1 `drive_items` — Folders and files

The space is written as real nullable FKs instead of a polymorphic `scope_id`. That way, deleting a team or project cascades in Postgres, and a `CHECK` makes a mismatched scope impossible.

```sql
CREATE TABLE drive_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    scope_type    TEXT NOT NULL CHECK (scope_type IN ('org', 'team', 'project', 'user')),
    team_id       UUID REFERENCES teams(id)    ON DELETE CASCADE,
    project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
    owner_user_id UUID,                         -- personal space owner (scope_type = 'user')
    parent_id     UUID REFERENCES drive_items(id) ON DELETE CASCADE,
    ancestor_ids  UUID[] NOT NULL DEFAULT '{}', -- root → parent, for share lookup + breadcrumbs
    kind          TEXT NOT NULL CHECK (kind IN ('folder', 'file')),
    name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 255 AND name !~ '[/\\]'),
    mime_type     TEXT,
    size_bytes    BIGINT,
    storage_key   TEXT,                          -- NULL for folders
    sha256        TEXT,
    created_by    UUID NOT NULL,                 -- uploader / creator
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    trashed_at    TIMESTAMPTZ,
    trashed_by    UUID,

    CHECK (
        (scope_type = 'org'     AND team_id IS NULL AND project_id IS NULL AND owner_user_id IS NULL) OR
        (scope_type = 'team'    AND team_id IS NOT NULL AND project_id IS NULL AND owner_user_id IS NULL) OR
        (scope_type = 'project' AND project_id IS NOT NULL AND team_id IS NULL AND owner_user_id IS NULL) OR
        (scope_type = 'user'    AND owner_user_id IS NOT NULL AND team_id IS NULL AND project_id IS NULL)
    ),
    CHECK ((kind = 'folder') = (storage_key IS NULL)),
    CHECK (kind = 'folder' OR (size_bytes IS NOT NULL AND mime_type IS NOT NULL))
);

-- One live name per folder (case-insensitive). The service auto-renames "Spec.pdf" → "Spec (1).pdf".
CREATE UNIQUE INDEX ux_drive_items_name ON drive_items (
    org_id, scope_type,
    COALESCE(team_id, project_id, owner_user_id, org_id),
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
) WHERE trashed_at IS NULL;

CREATE INDEX idx_drive_items_children ON drive_items (parent_id) WHERE trashed_at IS NULL;
CREATE INDEX idx_drive_items_ancestors ON drive_items USING gin (ancestor_ids);   -- subtree trash / move
CREATE INDEX idx_drive_items_team     ON drive_items (team_id)    WHERE team_id IS NOT NULL;
CREATE INDEX idx_drive_items_project  ON drive_items (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_drive_items_owner    ON drive_items (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX idx_drive_items_recent   ON drive_items (org_id, created_by, updated_at DESC);
CREATE INDEX idx_drive_items_trash    ON drive_items (org_id, trashed_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX idx_drive_items_name_trgm ON drive_items USING gin (lower(name) gin_trgm_ops); -- needs pg_trgm
```

**Moves.** Moving a folder rewrites `ancestor_ids` for its subtree in the same tx (`UPDATE … WHERE $id = ANY(ancestor_ids)`). Phase 1 allows moves **within one space** only. A cross-space move changes who can access the file, so it is a separate, explicit "copy to" in Phase 2.

### 3.2 `drive_shares` — Explicit grants

```sql
CREATE TABLE drive_shares (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    item_id       UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
    grantee_type  TEXT NOT NULL CHECK (grantee_type IN ('user', 'team', 'project', 'org')),
    grantee_id    UUID NOT NULL,       -- user_id / team_id / project_id / org_id
    role          TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'manager')),
    created_by    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ,
    UNIQUE (item_id, grantee_type, grantee_id)
);
CREATE INDEX idx_drive_shares_grantee ON drive_shares (org_id, grantee_type, grantee_id);
```

Shares are resolved by **joining live membership** (`org_members`, `team_members`, effective project members). A user who leaves a team loses that team's shares immediately, with no cleanup job. Rows for a deleted team or project become inert, and the team/project delete service removes them.

### 3.3 `drive_usage` and `drive_purge_queue`

```sql
-- Per-org byte counter, updated in the same tx as insert / purge. Read for quota checks.
CREATE TABLE drive_usage (
    org_id      UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    bytes_used  BIGINT NOT NULL DEFAULT 0 CHECK (bytes_used >= 0)
);

-- Objects whose rows are gone (cascade from team/project delete, or trash purge).
-- Filled by trigger so FK cascades can never orphan S3 objects.
CREATE TABLE drive_purge_queue (
    storage_key TEXT PRIMARY KEY,
    org_id      UUID NOT NULL,
    size_bytes  BIGINT NOT NULL,
    queued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION drive_items_after_delete() RETURNS trigger AS $$
BEGIN
    IF OLD.kind = 'file' THEN
        INSERT INTO drive_purge_queue (storage_key, org_id, size_bytes)
        VALUES (OLD.storage_key, OLD.org_id, OLD.size_bytes)
        ON CONFLICT DO NOTHING;
        UPDATE drive_usage SET bytes_used = bytes_used - OLD.size_bytes WHERE org_id = OLD.org_id;
    END IF;
    RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_drive_items_after_delete
    AFTER DELETE ON drive_items FOR EACH ROW EXECUTE FUNCTION drive_items_after_delete();
```

Trashed items still count toward usage until they are purged. That matches what users expect from Google Drive and Dropbox.

### 3.4 RLS and grants
Add `org_isolation` policies on all four tables, the same as `000002_rls_policies`, and `GRANT ALL … TO orbispm_api`. As §1.1 notes, RLS is defense in depth only: **every repo query also takes `org_id`**.

### 3.5 Go domain (`internal/domain/drive.go`)

```go
type DriveScope string // "org" | "team" | "project" | "user"
type DriveRole  string // "viewer" | "editor" | "manager"

type DriveItem struct {
    ID, OrgID      uuid.UUID
    Scope          DriveScope
    ScopeID        uuid.UUID   // derived from team_id / project_id / owner_user_id / org_id on scan
    ParentID       *uuid.UUID
    AncestorIDs    []uuid.UUID
    Kind           string      // "folder" | "file"
    Name           string
    MimeType       *string
    SizeBytes      *int64
    StorageKey     *string     `json:"-"`
    CreatedBy      uuid.UUID
    CreatedAt, UpdatedAt time.Time
    TrashedAt      *time.Time
    MyRole         DriveRole   `json:"my_role"` // filled by the service, never stored
}

type DriveShare struct {
    ID, OrgID, ItemID uuid.UUID
    GranteeType       string
    GranteeID         uuid.UUID
    GranteeName       string    // joined for display
    Role              DriveRole
    CreatedBy         uuid.UUID
    CreatedAt         time.Time
    ExpiresAt         *time.Time
}
```

---

## 4. Access Control

### 4.1 New permissions (`resource = 'drive'`)

| Action | Scopes | Meaning | Maps to item role on the space |
|--------|--------|---------|------|
| `read`   | org, team, project | See and download everything in that space | `viewer` |
| `upload` | org, team, project | Add files and folders, rename, move | `editor` |
| `manage` | org, team, project | Share, delete anything, manage shares | `manager` |

### 4.2 Default grants (seeded + backfilled in `000029`)

| Scope | Role | `drive:read` | `drive:upload` | `drive:manage` |
|-------|------|:---:|:---:|:---:|
| org | `owner`, `admin` | ✅ | ✅ | ✅ |
| org | `member` | ✅ | — | — |
| org | `viewer`, `billing_admin` | ✅ | — | — |
| team | `team_lead` | ✅ | ✅ | ✅ |
| team | `member` | ✅ | ✅ | — |
| team | `viewer` | ✅ | — | — |
| project | `lead` | ✅ | ✅ | ✅ |
| project | `contributor`, `reviewer` | ✅ | ✅ | — |
| project | `observer` | ✅ | — | — |

`seed_org_roles()` (`000006`) uses broad predicates such as "member → action = 'read' OR resource IN (…)". The migration must **re-check every predicate against the new `drive` rows** and replace the function where the defaults above differ, so new orgs and backfilled orgs end up with the same grants. Admins can change all of this later in Settings → Roles, because the grants are ordinary rows.

### 4.3 Effective item role

```
effectiveRole(user, item)                                         → none | viewer | editor | manager
  │
  ├─ 1. Not an org member?                                        → none   (RequireOrgMember already 403s)
  ├─ 2. Org owner / admin?                                        → manager
  │
  ├─ 3. Space role
  │     ├─ org      → PermissionResolver(org,  -,         drive, manage|upload|read)
  │     ├─ team     → PermissionResolver(team, team_id,   drive, …)
  │     ├─ project  → PermissionResolver(project, project_id, drive, …)   (includes team inheritance)
  │     └─ user     → owner_user_id == user ? manager : none
  │
  ├─ 4. Share role = max(role) FROM drive_shares
  │        WHERE item_id = ANY(item.ancestor_ids || item.id)
  │          AND (expires_at IS NULL OR expires_at > now())
  │          AND grantee matches user:
  │                user    → grantee_id = user
  │                team    → grantee_id IN (user's team_members.team_id)
  │                project → grantee_id IN (user's effective projects)
  │                org     → grantee_id = org
  │
  ├─ 5. Uploader bonus: item.created_by == user → may trash/delete that item
  │
  └─ return max(space role, share role)
```

- The space role uses the existing Redis-cached `PermissionResolver`, so one call per space per request is cheap.
- The share role is **one SQL query** for any item, thanks to `ancestor_ids`.
- All of this lives in `service/drive_access.go` as `DriveAccess.Role(ctx, userID, orgID, item) (DriveRole, error)` and `DriveAccess.Require(ctx, …, min DriveRole) error`.

### 4.4 Listing without N+1
Grants never deny, so **all children of a folder inherit at least the folder's role**. To list a folder:
1. Compute `effectiveRole(user, folder)` once. If it is none, fall through to step 3.
2. Return every child with `my_role = max(folderRole, directShareRole(child))`. The direct share roles for all children come from one batched `drive_shares` query.
3. If the user has no access to the folder, they may still have been shared a single child. The UI never browses into a folder like that: such items appear under **Shared with me**, with a breadcrumb that stops at the shared root.

### 4.5 Who can share what
- The actor needs `editor` or higher on the item. A share can grant at most the actor's own role.
- `manager` can change or revoke any share on the item. `editor` can revoke only shares they created.
- Grantees must be valid in the same org: an org member, a team or project in `org_id`, or the org itself. This is validated in the service. **Never trust a client-provided `org_id`.**
- Sharing to a **team** or **project** is how a doc is offered to "more teams/projects". Sharing to **org** puts it in front of everyone.

### 4.6 Route guards
Drive routes are mounted inside the existing `RequireOrgMember` group. Space-level actions with no item yet (list space root, upload to root) use `DriveAccess` with the space role. Item routes use `DriveAccess.Require(item, min)`. The `prm(...)` middleware is **not** used on item routes, because the scope is known only after the item is loaded.

---

## 5. Storage & Upload Pipeline

### 5.1 Bucket
- **New private bucket**: `MINIO_DRIVE_BUCKET` (default `orbispm-drive`). It never gets the public-read policy.
  - Change `storage.NewClient` to take a `public bool` option. Today the public policy is unconditional.
  - Construct a second `*storage.Client` for Drive in `main.go`.
- Object key: `orgs/{orgId}/drive/{itemId}`. The filename is never part of the key: renames are free and user input never reaches object paths.
- Content type and size are stored on the row. Downloads set them explicitly instead of trusting object metadata.

### 5.2 Upload (Phase 1: streamed through the API)
This reuses the proven `AttachmentService.DirectUpload` pattern. It avoids S3 CORS setup in prod and lets the server hash and sniff the bytes. The limit is 100 MB per file in Phase 1. Larger files move to presigned multipart in Phase 2.

```
Browser                         API (drive_handler)                      MinIO               Postgres
  │ POST /drive/files (multipart: file, scope, scope_id, parent_id)
  │────────────────────────────►│
  │                              │ 1. DriveAccess: space/parent role ≥ editor
  │                              │ 2. Quota: drive_usage + Content-Length ≤ plan.storage_gb
  │                              │ 3. Stream part via multipart.Reader (no ParseMultipartForm),
  │                              │    tee → sha256 + first 512 bytes → http.DetectContentType
  │                              │──────── PutObject(orgs/{org}/drive/{id}) ──►│
  │                              │ 4. TX: INSERT drive_items (auto-rename on name clash)
  │                              │        UPDATE drive_usage += size ───────────────────────────►│
  │                              │    on TX error → Delete object (best effort, same as attachments)
  │                              │ 5. Enqueue activity:log, publish drive.item.created (§8)
  │◄──────────── 201 DriveItem ──│
```

- Uploads use `http.MaxBytesReader(w, r.Body, maxDriveFileSize+1MB)`. Streaming with `r.MultipartReader()` means a 100 MB upload never lands in memory or temp files.
- The MIME type stored is the **sniffed** type when the declared one is risky (§9.2).
- Multi-file upload means N parallel requests from the client, with at most 3 in flight. Each file succeeds or fails on its own, which keeps the server simple.

### 5.3 View / download
- `GET /drive/items/{id}/url?disposition=inline|attachment` returns a **presigned GET valid for 5 minutes**, with `response-content-type` and `response-content-disposition` overrides. The browser loads it directly in `<img>`, `<video>`, `<iframe>` or `<a download>`, so no bytes pass through the API.
- Inline is allowed only for safe preview types (§9.2). Everything else is forced to `attachment`.
- Every download URL issued is logged as `drive.item.downloaded` in `activity_log`.

### 5.4 Trash and purge
- `DELETE /items/{id}` sets `trashed_at` on the item and its whole subtree in one statement (`id = $1 OR $1 = ANY(ancestor_ids)`).
- `POST /items/{id}/restore` clears it. If the original name is now taken, it auto-renames.
- New asynq periodic task **`drive:purge`** (hourly) runs two steps:
  1. Hard-delete rows where `trashed_at < now() - 30 days`. The trigger queues their objects and decrements usage.
  2. Drain `drive_purge_queue` in batches of 500 with `storage.Delete`.

  The same queue covers team/project deletes that cascade.

---

## 6. API Design

All routes are under `/api/v1/orgs/{orgId}/drive` and mounted inside the `RequireOrgMember` group in `cmd/api/main.go`. `DriveHandler.Routes()` returns a `chi.Router`, the same as `AttachmentHandler`.

### 6.1 Endpoints

| Method | Path | Min role | Purpose |
|--------|------|----------|---------|
| GET | `/spaces` | — | Spaces the user can open: org, my files, each team and project where `drive:read` holds. Includes item counts. |
| GET | `/items?scope=&scope_id=&parent_id=&cursor=&limit=` | viewer (space/folder) | List a folder (folders first, then name). Cursor-paged, limit ≤ 200. |
| GET | `/items/{id}` | viewer | Item + `my_role` + breadcrumbs (`ancestor_ids` → names, cut at the first ancestor the user can't see) |
| POST | `/folders` `{scope, scope_id, parent_id, name}` | editor | Create folder |
| POST | `/files` (multipart) | editor | Upload one file (§5.2) |
| PATCH | `/items/{id}` `{name}` | editor | Rename |
| POST | `/items/{id}/move` `{parent_id: uuid\|null}` | editor (item + target) | Move within the same space (`null` = space root) |
| DELETE | `/items/{id}` | manager, or uploader | Move to trash |
| POST | `/items/{id}/restore` | manager, or uploader | Restore from trash |
| GET | `/items/{id}/url?disposition=` | viewer | Presigned GET (§5.3) |
| GET | `/items/{id}/shares` | viewer | List shares on the item and inherited from ancestors (the latter marked `inherited: true`) |
| POST | `/items/{id}/shares` `{grantees:[{type,id}], role, expires_at?}` | editor (cap = own role) | Create or upsert shares in bulk |
| PATCH | `/shares/{shareId}` `{role?, expires_at?}` | manager, or share creator | Change share |
| DELETE | `/shares/{shareId}` | manager, or share creator | Revoke |
| GET | `/shared-with-me?cursor=` | — | Items with a share matching the user, excluding items the user already reaches through their own spaces |
| GET | `/recent?limit=` | — | The user's recently uploaded or updated items |
| GET | `/search?q=&scope=&scope_id=` | — | Name search (`pg_trgm`), filtered by access. Phase 2 moves this to Meilisearch. |
| GET | `/trash` | — | Trashed items the user may restore |
| GET | `/usage` | org `drive:read` | `{bytes_used, bytes_limit}` |

Team and project pages call `/items?scope=team&scope_id={teamId}`. They get no separate endpoints.

### 6.2 Key response shapes

```json
// DriveItem
{
  "id": "…", "scope": "project", "scope_id": "…", "parent_id": null,
  "kind": "file", "name": "Q3 roadmap.pdf", "mime_type": "application/pdf", "size_bytes": 482113,
  "created_by": "…",
  "creator": { "id": "…", "display_name": "…", "avatar_url": "…" },
  "created_at": "…", "updated_at": "…", "trashed_at": null,
  "my_role": "editor",
  "shared": true,
  "space_name": null            // set only in shared-with-me / recent / search / trash lists
}

// GET /items/{id}
{ "item": DriveItem, "breadcrumbs": [{ "id": "…", "name": "Specs" }], "space": { "scope": "project", "scope_id": "…", "name": "Apollo" } }

// GET /items list — my_role is the caller's role on the listed folder (or space root)
{ "items": [DriveItem], "next_cursor": "…", "my_role": "editor", "breadcrumbs": [{ "id": "…", "name": "Specs" }] }

// GET /spaces
{ "spaces": [{ "scope": "user", "scope_id": "…", "name": "My files", "my_role": "manager" }] }
```

### 6.3 Errors
The handler reuses `handler.Error` and `domain.AppError`:
- `403` not enough role
- `404` item missing, **or** the user has no access to it (never leak existence)
- `409` name clash on an explicit rename
- `402 ErrPlanLimitHit` quota exceeded
- `413` file too large
- `422` invalid name or grantee

---

## 7. Frontend UX

### 7.1 Surfaces

```
┌ Sidebar ┐┌──────────────── TopBar ───── [Search] [Drive ⬚] [Notes] [Bell] ┐
│ …       ││                                                                  │
│ Drive ◄─┼┼── nav item → /[orgSlug]/drive (full page)                         │
│ …       ││                                              ┌─ DrivePanel ──────┤
│         ││   Any page (dashboard, tasks, messages…)     │ [My][Shared][Org] │
│         ││                                              │ [Teams▾][Projects▾]│
│         ││                                              │  Breadcrumb  [⬆]  │
│         ││                                              │  📁 Specs         │
│         ││                                              │  📄 Roadmap.pdf   │
│         ││                                              │  drop files here  │
│         ││                                              │ [Open full page ↗]│
└─────────┘└──────────────────────────────────────────────┴───────────────────┘

Team page tabs:    Overview | Calendar | Members | Drive          (scope=team)
Project page tabs: Dashboard | Tasks | … | Canvas | Drive | Settings  (scope=project)
```

| Surface | Where | Scope |
|---------|-------|-------|
| **Drive panel** | New fixed right drawer (`w-[380px]`, full screen on mobile), mounted in `OrgLayout` (`app/[orgSlug]/layout.tsx:962-1105`), toggled from a TopBar button next to `StickyNotesPanel` / `NotificationBell` (:652-653). Open state + last space in `ui-store`. Closes on Escape; stays open across route changes so files can be dragged in from anywhere. | Space switcher: My files, Shared with me, Org, Teams ▾, Projects ▾, Recent |
| **Drive page** | `app/[orgSlug]/drive/page.tsx` + sidebar item in **both** `getSidebarItems()` (:54-112) and the duplicated `MobileSidebar` list (:675-726) | Same as panel, with a wider table view (name, owner, modified, size) and a left space list |
| **Team tab** | `app/[orgSlug]/teams/[teamId]/page.tsx`: add `"drive"` to the tab union (:114-116) and an `activeTab === "drive"` block | Locked to `scope=team` |
| **Project tab** | `app/[orgSlug]/projects/[projectId]/page.tsx`: add `"drive"` to the union (:102-121) and tabs array (:249-305), body at :513-568. **Also add to `ProjectTab` in `stores/ui-store.ts:10-17`** (note `"canvas"` is already missing there). | Locked to `scope=project` |

When the panel is opened from a team or project page, it defaults to that space.

### 7.2 Components (`components/drive/`)
One `DriveBrowser` serves all four surfaces, which justifies the abstraction.

| Component | Responsibility |
|-----------|----------------|
| `drive-browser.tsx` | `{ scope?, scopeId?, lockScope?, density: "panel" \| "page" }`. Breadcrumb, toolbar (Upload, New folder), list, empty state, drop zone. |
| `drive-item-list.tsx` | Virtualized list (`@tanstack/react-virtual`) with row actions: Open, Download, Share, Rename, Move, Trash. The actions shown follow `item.my_role`. |
| `drive-dropzone.tsx` | Native HTML5 drag-and-drop over the browser area (same approach as `message-input.tsx`) and a hidden `<input type="file" multiple>` |
| `upload-queue.tsx` | Bottom-docked progress list. Uses `XMLHttpRequest` because `fetch` has no upload progress. Up to 3 concurrent uploads, with retry and cancel per file. |
| `share-dialog.tsx` | `Modal` with a `Combobox` over members, teams and projects (existing APIs), a role select, the current shares list (inherited ones shown read-only with their source folder), and Copy link (an internal deep link `/{orgSlug}/drive?item={id}` that still requires login) |
| `components/files/file-preview.tsx` | **Shared** lightbox pulled out of the three copies (§1.2): image, PDF (`<iframe>`), video/audio, text/markdown/code (fetched as text, rendered in `<pre>`), and a download fallback for everything else. Phase 1 adopts it in Drive only; moving the task, CR and chat call sites over is a follow-up. |
| `new-folder-dialog.tsx`, `move-dialog.tsx` | Small modals. Move offers only folders in the same space. |

### 7.3 Data layer
- `lib/api.ts` gets an `api.drive.*` namespace mirroring §6.1. Uploads use XHR with the same `Authorization` / `X-Org-ID` headers as `request<T>()`.
- `types/domain.ts` gets `DriveItem`, `DriveShare`, `DriveSpace`, `DriveRole`.
- `hooks/use-drive.ts` provides `useDriveSpaces`, `useDriveItems(scope, scopeId, parentId)`, `useDriveItem(id)`, `useDriveShares(id)` and mutations.
  - Query keys: `["drive", orgId, "items", scope, scopeId, parentId]`, `["drive", orgId, "item", id]`, `["drive", orgId, "shared"]`.
- **Presigned URLs are never cached in React Query.** They are fetched just in time when a file is opened. The cache is persisted to IndexedDB (`lib/offline/persister.ts`), so a cached URL would outlive its 5-minute TTL.
- `lib/policies.ts` gets `canViewDrive`, `canUploadDrive` and `canManageDrive` on Org, Team and Project policies, from `can("drive", …)`. These control whether tabs and toolbar buttons appear. **Item-level buttons always follow `item.my_role`**, never the scope policy.

### 7.4 Realtime
`hooks/use-org-socket.ts` `handleOrgEvent` (:191-400) gets a `drive.*` case. Each event invalidates `["drive", orgId, …]` for the affected folder and `"shared"`. The event carries IDs only, never names (§8).

---

## 8. Events, Activity & Notifications

| Event | Published when | Delivered to (WS) | Side effects |
|-------|----------------|-------------------|--------------|
| `drive.item.created` | upload / new folder | users with access to the parent | `activity_log` |
| `drive.item.updated` | rename / move | same | `activity_log` |
| `drive.item.trashed` / `restored` | trash / restore | same | `activity_log` |
| `drive.item.shared` | share created / role raised | grantee users | `activity_log` + `notification:send` ("{actor} shared {name} with you") honoring `notification_preferences` |
| `drive.share.revoked` | share removed | former grantee users | `activity_log` |
| `drive.item.downloaded` | presigned URL issued | — | `activity_log` only |

**Targeted delivery (required).** `OrgHub.Start` broadcasts to the whole org today, which would leak file names in team, project and personal spaces. Phase 1 adds:
- An `audience` field in the Drive event payload, holding the resolved user IDs. The service computes it from space members plus share grantees, capped at 500. Over the cap it falls back to `audience = null`, which means space-level invalidation for subscribed rooms only.
- `OrgHub.SendToUsers(orgID, userIDs, msg)`. In `Start`, events whose type starts with `drive.` go through it instead of `BroadcastOrg`.
- The WS payload is `{type, item_id, parent_id, scope, scope_id}` only. Clients refetch through the authorized API.

---

## 9. Security, Audit & Quotas

### 9.1 Authorization invariants (tested)
1. Every repo method takes `orgID` and puts it in `WHERE`. No `GetByID(id)` without an org.
2. Any item the user can't access returns `404`, not `403`.
3. Share grantees are validated as belonging to the same `org_id`.
4. A share can never grant more than the actor's role.
5. Moves stay inside one space. `parent_id` must be a folder in the same space and not the item itself or one of its descendants.

### 9.2 Content safety
- **Inline preview allowlist:** `image/png|jpeg|gif|webp`, `application/pdf`, `video/mp4|webm`, `audio/*`, `text/plain`, `text/markdown`, `text/csv`, and code types rendered as text.
- `text/html`, `image/svg+xml`, `application/xhtml+xml` and any type outside the allowlist are always served `Content-Disposition: attachment`. The client still shows them as text where useful, after fetching and rendering them in `<pre>`.
- Presigned URLs live on the MinIO/S3 origin, not the app origin, so even a mistakenly inline HTML file cannot read app tokens. The tokens live in `localStorage` on the app origin.
- File names are sanitized on display (React escaping) and in `Content-Disposition` (RFC 5987 `filename*`).
- Phase 1 has no virus scanning. It is called out in the UI ("files are not scanned") and planned for Phase 2.

### 9.3 Limits
| Limit | Phase 1 value | Config |
|-------|---------------|--------|
| Max file size | 100 MB | `DRIVE_MAX_FILE_MB` |
| Org storage | `billing_plans.limits.storage_gb` (free 1 GB, pro 50 GB, enterprise unlimited) | DB |
| Concurrent uploads per client | 3 | frontend const |
| Upload rate | 60 files / min / user | Redis token bucket in the handler; Kong already applies route-level rate limiting |
| Folder depth | 20 | service const |

Quota check: `bytes_used + incoming_size ≤ limit`. It runs before streaming (using `Content-Length`) and again inside the insert tx with `SELECT … FOR UPDATE` on `drive_usage`, so two parallel uploads cannot overshoot.

### 9.4 Audit
Every create, rename, move, trash, restore, share, revoke and download URL goes to `activity_log` with `entity_type = 'drive_item'`. Admins see it in the existing Activity page (`app/[orgSlug]/activity`).

---

## 10. Implementation Tasks (Phase 1)

### Phase 1A: Database & storage (Tasks 1–4)
- [ ] **1.** `000029_drive.up.sql` / `.down.sql`: tables, indexes, trigger, RLS, grants (§3), `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- [ ] **2.** Same migration: `drive` permissions seed, backfill for existing orgs, and a `seed_org_roles()` update checked against §4.2
- [ ] **3.** `storage.NewClient(..., public bool)`; private Drive client in `main.go`; config `MINIO_DRIVE_BUCKET`, `DRIVE_MAX_FILE_MB` in `config.go` + `docker-compose.yaml`
- [ ] **4.** `domain/drive.go` (§3.5) + `domain/events.go` Drive event constants

### Phase 1B: Backend core (Tasks 5–10)
- [ ] **5.** `repository/drive_repo.go` + interfaces in `repository/interfaces.go` (items CRUD, children page, subtree trash/restore, ancestor rewrite, shares CRUD, shared-with-me, usage)
- [ ] **6.** `service/drive_access.go`: `Role` / `Require` (§4.3), batched child share roles (§4.4)
- [ ] **7.** `service/drive_service.go`: folders, streamed upload with quota and sniffing, rename/move, trash/restore, presigned URLs
- [ ] **8.** `service/drive_share_service.go`: grantee validation, role cap, upsert, revoke, notifications
- [ ] **9.** `handler/drive_handler.go` + mount in `cmd/api/main.go`, plus Swagger annotations (swaggo)
- [ ] **10.** `worker`: `TypeDrivePurge` periodic task + handler registration in `Handlers.RegisterAll`

### Phase 1C: Realtime (Task 11)
- [ ] **11.** `OrgHub.SendToUsers` + `drive.*` routing in `Start` (§8)

### Phase 1D: Frontend foundation (Tasks 12–15)
- [ ] **12.** `types/domain.ts` Drive types; `api.drive.*` in `lib/api.ts` with XHR upload + progress
- [ ] **13.** `hooks/use-drive.ts`; Drive policies in `lib/policies.ts` + `hooks/use-policies.ts`
- [ ] **14.** `components/files/file-preview.tsx` (shared lightbox)
- [ ] **15.** `components/drive/*` (§7.2)

### Phase 1E: Frontend surfaces (Tasks 16–19)
- [ ] **16.** Drive panel in `OrgLayout` + TopBar toggle + `ui-store` state
- [ ] **17.** `/[orgSlug]/drive` page + sidebar items (desktop + mobile lists)
- [ ] **18.** Team page Drive tab
- [ ] **19.** Project page Drive tab + `ProjectTab` type fix (`drive`, and the missing `canvas`)
- [ ] **20.** `use-org-socket.ts` `drive.*` invalidation

### Phase 1F: Tests & hardening (Tasks 21–24)
- [ ] **21.** Repo/service tests: access matrix (every role × space × share combination in §4), cross-org isolation, move-into-descendant rejected, name auto-rename, quota race
- [ ] **22.** Handler tests: 404-not-403, size limit 413, inline-disposition allowlist
- [ ] **23.** Playwright: upload from the panel on a project page → visible in the project Drive tab → share to a team → visible under Shared with me for a team member → revoke → gone
- [ ] **24.** Load check: list a folder with 5k items in under 150 ms p95; upload 100 MB without API RSS growth

Exit criteria for Phase 1: tasks 1–24 done, the access matrix test green, and an upload/view/share round trip working from every surface in §7.1.

---

## 11. Future Phases

Phase 1 choices that keep these open are noted in the right-hand column.

| Phase | Feature | Design sketch | Phase 1 hook |
|-------|---------|---------------|--------------|
| 2 | **Large uploads** | Presigned multipart PUT direct to S3 (bucket CORS), `status = 'pending'` + `complete` endpoint, pending cleanup job | `storage.PresignedPutURL` exists; add `status` column then |
| 2 | **Versions** | `drive_file_versions(item_id, version, storage_key, size, created_by)`; item points to current; "Upload new version", restore | Object key is per item ID, so versions become `orgs/{org}/drive/{item}/{version}` |
| 2 | **Thumbnails & Office preview** | asynq `drive:thumbnail` (images via Go `image`, Office/PDF via Gotenberg/LibreOffice container) | Worker + purge queue already in place |
| 2 | **Virus scan** | ClamAV sidecar; new uploads are `scanning` until clean; infected → quarantined | Upload path is server-side, so the scan hook sits in `drive_service` |
| 2 | **Search** | Index `drive_items` names (and later extracted text) in Meilisearch, filtered by access | `search:index` task exists |
| 2 | **Copy across spaces, zip download** | "Copy to…" duplicates the object; zip streamed by worker | Moves deliberately limited to one space |
| 3 | **Live collaboration** | New `kind = 'doc'`: native rich docs on TipTap (already installed) + Yjs; a Hocuspocus-style collab service behind Kong `/ws/collab` that authorizes through `DriveAccess` (editor = write, viewer = read-only awareness); Yjs updates persisted to Postgres, snapshots to S3 | `kind` CHECK is extended; access model already per item |
| 3 | **Comments on files** | `drive_comments` anchored to item (and to page/region for PDFs) | — |
| 4 | **Pick from Drive in chat** | `message_attachments.drive_item_id` (nullable). Composer gets "From Drive" next to the Paperclip (`message-input.tsx:447-467`), which opens `DriveBrowser` in picker mode. Sending creates a `drive_shares` row with `grantee_type = 'channel'` (role viewer). messaging-service checks access by calling the backend's `DriveAccess` over gRPC (`proto/` already holds service contracts). Plus "Save to Drive" on any chat attachment. | Grantee types are a CHECK list that can be extended; WS events are ID-only |
| 4 | **Task attachments from Drive** | Link a Drive item to a task instead of uploading a copy | Same picker component |
| 5 | **Guests & external links** | Real invitation entity (token + email via email-service) for outside collaborators; public links with expiry/password served by a signed redirect endpoint | Shares already have `expires_at` |

---

## 12. Migration Strategy

### 12.1 Migration 000029 (additive only)
- New tables and permissions only. No existing table is altered, so rollback is `000029_drive.down.sql`, which drops the four tables, the trigger and function, and the `drive` permissions and their `role_permissions`.
- Run on staging, then check the backfill: every org role has the grants from §4.2.

### 12.2 Feature gating
There is no feature flag. The Drive UI is gated by the `drive:*` permissions, so an admin can hide Drive for a role in Settings → Roles. Ship backend first, then frontend, in the same release train.

### 12.3 Existing files
Phase 1 migrates no existing task or chat attachments into Drive. They stay where they are. "Show task attachments in project Drive" is a possible Phase 2 read-only view.

---

## 13. Performance Considerations

| Path | Cost | Mitigation |
|------|------|------------|
| Folder list | 1 space-role check (Redis-cached resolver) + 1 children query + 1 batched share query | `idx_drive_items_children`; cursor paging; limit 200 |
| Item access | 1 resolver call + 1 share query using `ancestor_ids` | `UNIQUE (item_id, …)` btree serves `item_id = ANY(...)`; depth ≤ 20 caps the array |
| Shared-with-me | Join `drive_shares` on the user's grantee set (user + teams + projects + org) | `idx_drive_shares_grantee`; the grantee set comes from the cached membership data that `PermissionResolver` already loads |
| Move folder | Rewrite `ancestor_ids` of the subtree | Single `UPDATE`; folders above 10k descendants are rejected with 422 in Phase 1 |
| Upload | Streams through API; no buffering | `MultipartReader`, `MaxBytesReader`; 3 concurrent per client |
| Download | Zero API bandwidth | Presigned GET |

---

## 14. Open Questions & Risks

### 14.1 Open questions
- [ ] Should org **members** be able to upload to the org space by default, or only admins (current proposal)?
- [ ] When a **team** is deleted, should its Drive be deleted (current cascade) or moved to the org space? The same question applies to projects, given `status = archived` exists for teams.
- [ ] When a user **leaves the org**, what happens to their personal files: delete after 30 days, or transfer to an admin?
- [ ] Is 100 MB per file enough for Phase 1, or do we need multipart from day one?
- [ ] Does storage quota count chat and task attachments too (currently unenforced everywhere), or Drive only?

### 14.2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Access bug leaks private files | High | Single `DriveAccess` choke point; exhaustive matrix test (Task 21); 404-not-403 |
| WS event leak via `BroadcastOrg` | High | `SendToUsers` + ID-only payloads (§8), shipped in the same release |
| Shared bucket misconfig makes Drive public | High | Separate bucket + `public=false`; startup log asserts no bucket policy on the Drive bucket |
| Orphaned S3 objects after cascades | Medium | Trigger-filled `drive_purge_queue` |
| `seed_org_roles()` predicates grant Drive more broadly than §4.2 | Medium | Migration test asserting the role × permission matrix for a freshly created org |
| API bandwidth from proxied uploads | Medium | 100 MB cap; Phase 2 multipart direct-to-S3 |
| Persisted query cache serving expired presigned URLs | Low | URLs fetched just in time, never cached (§7.3) |

---

## 15. File Change Summary

### Backend (`backend/`)
| File | Change |
|------|--------|
| `db/migrations/000029_drive.up.sql` / `.down.sql` | **New**: schema, trigger, RLS, permissions, backfill |
| `internal/domain/drive.go` | **New**: `DriveItem`, `DriveShare`, `DriveRole`, `DriveScope` |
| `internal/domain/events.go` | Add `drive.*` event types |
| `internal/repository/drive_repo.go`, `interfaces.go` | **New** repo + interface |
| `internal/service/drive_access.go` | **New**: effective role resolution |
| `internal/service/drive_service.go`, `drive_share_service.go` | **New** |
| `internal/handler/drive_handler.go` | **New**: `Routes()` |
| `internal/storage/minio.go` | `public bool` option on `NewClient` (existing callers pass `true`) |
| `internal/config/config.go` | `MINIO_DRIVE_BUCKET`, `DRIVE_MAX_FILE_MB` |
| `internal/worker/worker.go`, `handlers.go` | `drive:purge` task + periodic schedule |
| `internal/websocket/org_hub.go` | `SendToUsers`; route `drive.*` events |
| `cmd/api/main.go` | Wire repo → service → handler; mount `/drive`; second storage client |
| `docker-compose.yaml`, `.env.example` | New env vars (names only) |

### Frontend (`frontend/src/`)
| File | Change |
|------|--------|
| `types/domain.ts` | Drive types |
| `lib/api.ts` | `api.drive.*` + XHR upload with progress |
| `hooks/use-drive.ts` | **New**: queries + mutations |
| `lib/policies.ts`, `hooks/use-policies.ts` | Drive policies |
| `components/drive/*` | **New**: browser, list, dropzone, upload queue, share/move/new-folder dialogs, panel |
| `components/files/file-preview.tsx` | **New** shared preview |
| `app/[orgSlug]/layout.tsx` | Mount `DrivePanel`; TopBar toggle; sidebar items (desktop + mobile) |
| `app/[orgSlug]/drive/page.tsx` | **New** full page |
| `app/[orgSlug]/teams/[teamId]/page.tsx` | Drive tab |
| `app/[orgSlug]/projects/[projectId]/page.tsx` | Drive tab |
| `stores/ui-store.ts` | `drivePanelOpen`, `driveLastSpace`; `ProjectTab` += `drive`, `canvas` |
| `hooks/use-org-socket.ts` | `drive.*` invalidation |
