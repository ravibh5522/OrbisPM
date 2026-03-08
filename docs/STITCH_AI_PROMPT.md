# OrbisPM Frontend – Stitch AI Generation Prompt

> Use this prompt with Stitch AI (or any AI-powered frontend generator) to scaffold all pages, components and layout for the OrbisPM project management application.

---

## 1. Project Overview

**OrbisPM** is a multi-tenant, organization-based project management platform (like Linear, Asana, Jira). The frontend is a **Next.js 14+ App Router** application using:

- **Framework**: Next.js 14 (App Router, Server Components, Server Actions)
- **UI Library**: shadcn/ui + Tailwind CSS v4 + Radix primitives
- **State**: TanStack Query (React Query) for server state, Zustand for client state
- **Auth**: JWT Bearer tokens (GoTrue-compatible), stored in httpOnly cookies
- **Real-time**: Server-Sent Events (SSE) for live updates
- **API Base URL**: `http://localhost:8080` (dev), configurable via `NEXT_PUBLIC_API_URL`

### Authentication Flow
- Signup: `POST /auth/signup` → `{access_token, refresh_token, user}`
- Login: `POST /auth/login` → `{access_token, refresh_token}`
- Refresh: `POST /auth/refresh` → `{access_token, refresh_token}`
- Logout: `POST /auth/logout` (requires Bearer token)
- Get User: `GET /auth/user` → user profile object

All authenticated API calls require `Authorization: Bearer <access_token>` header.

---

## 2. Application Layout

### 2.1 Root Layout (`/app/layout.tsx`)
- Dark/light theme toggle (default: system preference)
- Global providers: QueryClientProvider, ThemeProvider, AuthProvider, SSE EventProvider
- Toast/notification system (sonner or shadcn toast)

### 2.2 Auth Layout (`/app/(auth)/layout.tsx`)
- Centered card layout for login/signup pages
- No sidebar, minimal branding header

### 2.3 Dashboard Layout (`/app/(dashboard)/layout.tsx`)
- **Left sidebar** (collapsible, ~260px):
  - Organization switcher dropdown (top)
  - Navigation items:
    - 📊 Dashboard (overview)
    - 📁 Projects (list)
    - 👥 Teams (list)
    - 📋 My Tasks (filtered to current user)
    - 🔔 Notifications (with unread badge count)
    - 🔍 Search (global search)
  - Organization section (bottom):
    - ⚙️ Settings
    - 👤 Members
    - 📄 Templates
    - 🔗 Webhooks
    - 🔑 API Keys
    - 🛡️ Roles
    - 💳 Billing
- **Top header bar**:
  - Breadcrumb navigation
  - Global search input (⌘K)
  - Notification bell (unread count)
  - User avatar dropdown (profile, preferences, logout)
- **Main content area** (scrollable)
- **Right panel** (optional, slide-over for task detail, 400px)

---

## 3. Pages & Routes

### 3.1 Auth Pages

#### `/login` – Login Page
- Email + password form
- "Forgot password" link
- "Don't have an account? Sign up" link
- API: `POST /auth/login`

#### `/signup` – Signup Page
- Email + password + confirm password form
- "Already have an account? Login" link
- After signup, auto-create first organization
- API: `POST /auth/signup`

---

### 3.2 Dashboard Pages

#### `/dashboard` – Overview Dashboard
- Welcome banner with user name
- Stats cards row:
  - Total Projects (count)
  - Total Tasks assigned to me (count)
  - Tasks due this week (count)
  - Overdue tasks (count)
- Recent activity feed (5-10 items) – `GET /orgs/{orgId}/activity?entity_type=org&entity_id={orgId}`
- My tasks quick list (top 10 by priority/due date)
- Projects grid (recent 6 projects)

---

### 3.3 Organization Pages

#### `/orgs` – Organization List/Switcher
- Card grid of user's organizations
- "Create Organization" button → modal
- API: `GET /orgs`

#### `/orgs/[orgId]/settings` – Organization Settings
- **General tab**: Edit org name, slug, description → `PUT /orgs/{orgId}`
- **Members tab**: 
  - Member list table with role badges → `GET /orgs/{orgId}/members`
  - "Invite Member" button → modal (email + role picker) → `POST /orgs/{orgId}/members`
  - Role dropdown per member → `PUT /orgs/{orgId}/members/{userId}`
  - Remove member button → `DELETE /orgs/{orgId}/members/{userId}`
  - Roles: `owner`, `admin`, `member`, `viewer`
- **Danger Zone**: Delete organization → `DELETE /orgs/{orgId}`

---

### 3.4 Team Pages

#### `/orgs/[orgId]/teams` – Team List
- Card grid or table view of teams
- "Create Team" button → `POST /orgs/{orgId}/teams`
- Each card shows: team name, description, member count
- API: `GET /orgs/{orgId}/teams`

#### `/orgs/[orgId]/teams/[teamId]` – Team Detail
- Team info header (name, description, edit button)
- Members tab:
  - Member list → `GET /orgs/{orgId}/teams/{teamId}/members`
  - Add member → `POST /orgs/{orgId}/teams/{teamId}/members`
  - Remove member → `DELETE /orgs/{orgId}/teams/{teamId}/members/{userId}`
- Settings: Edit/delete team

---

### 3.5 Project Pages

#### `/orgs/[orgId]/projects` – Project List
- Grid/list toggle view
- Filterable by status
- "New Project" button → modal or page
- Each card: project name, key, description, status badge, member avatars
- API: `GET /orgs/{orgId}/projects`

#### `/orgs/[orgId]/projects/[projectId]` – Project Detail (Kanban Board)
This is a **core page** with multiple views:

**Board View (default)** – Kanban board:
- Columns: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled`
- Task cards with: title, priority badge (P0-P3), assignee avatar, due date, comment count
- Drag-and-drop between columns (updates status via `PUT /orgs/{orgId}/projects/{projectId}/tasks/{taskId}`)
- Click card → opens task detail slide-over panel

**List View** – Table:
- Columns: Title, Status, Priority, Assignee, Due Date, Created
- Sortable, filterable
- Bulk actions (status change, assignee, delete)

**Table View** – Spreadsheet-like:
- Inline editing for quick updates
- All task fields visible

**Timeline View** (optional/future):
- Gantt-like chart based on start_date/due_date

**Sub-navigation tabs**:
- Board | List | Members | Settings | Imports

**Project Members** (`/orgs/[orgId]/projects/[projectId]/members`):
- Member list → `GET /orgs/{orgId}/projects/{projectId}/members`
- Add/remove members

**Project Settings**:
- Edit name, description, status → `PUT /orgs/{orgId}/projects/{projectId}`
- Delete project

**Project Imports** (`/orgs/[orgId]/projects/[projectId]/imports`):
- Upload CSV → `POST /orgs/{orgId}/projects/{projectId}/imports` (multipart/form-data)
- Import history table → `GET /orgs/{orgId}/projects/{projectId}/imports`
- Import detail → `GET /orgs/{orgId}/projects/{projectId}/imports/{importId}`

---

### 3.6 Task Pages

#### Task Detail Panel (Slide-over or Modal)
This is the **most complex component**. It opens from the board/list view.

**Task Header**:
- Task title (inline editable)
- Status dropdown (backlog → todo → in_progress → in_review → done → cancelled)
- Priority dropdown (P0 critical, P1 high, P2 medium, P3 low)
- Close button

**Left Column (main content)**:
- **Description**: Rich text / markdown editor (inline editable)
- **Subtasks**: 
  - Nested task list with add/toggle
  - "View subtask tree" → `GET /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/tree`
- **Checklists**:
  - Checklist items with checkboxes → `GET/POST/PUT/DELETE .../checklists`
  - Add item, toggle complete, reorder, delete
- **Comments**:
  - Threaded comment list → `GET /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/comments`
  - New comment form (markdown support) → `POST .../comments`
  - Delete own comments → `DELETE .../comments/{commentId}`
- **Attachments**:
  - File list with download links → `GET .../attachments`
  - Upload button → `POST .../attachments` (gets presigned URL)
  - Download → `GET .../attachments/{attachmentId}/download`
  - Delete → `DELETE .../attachments/{attachmentId}`
- **Activity log**: Timeline of changes → `GET /orgs/{orgId}/activity?entity_type=task&entity_id={taskId}`

**Right Column (sidebar metadata)**:
- **Assignee**: User picker dropdown → updates task
- **Due Date**: Date picker → updates task
- **Start Date**: Date picker → updates task
- **Story Points**: Number input → updates task
- **Parent Task**: Task picker (for subtask hierarchy)
- **Dependencies**:
  - "Blocked by" list → `GET .../dependencies`
  - "Blocking" list → `GET .../dependents`
  - Add dependency → `POST .../dependencies`
  - Remove → `DELETE .../dependencies/{depId}`
- **Watchers**:
  - Watcher avatars → `GET .../watchers`
  - Watch/Unwatch toggle → `POST/DELETE .../watchers`
- **Rules**:
  - Automation rules list → `GET .../rules`
  - Add rule (auto_assign, require_review, auto_close) → `POST .../rules`
  - Delete rule → `DELETE .../rules/{ruleId}`

**Action buttons**:
- "Submit for Review" → `POST .../review`
- "Mark Complete" → `POST .../complete`
- Delete task → `DELETE /orgs/{orgId}/projects/{projectId}/tasks/{taskId}`

---

### 3.7 Search Page

#### `/orgs/[orgId]/search` – Global Search
- Search input with tabs: All | Tasks | Projects
- Results list with highlighted matches
- APIs:
  - `GET /orgs/{orgId}/search/tasks?q={query}`
  - `GET /orgs/{orgId}/search/projects?q={query}`
- Also integrate with ⌘K command palette for quick search

---

### 3.8 Notification Pages

#### `/notifications` – Notification Center
- Notification list with unread indicators
- "Mark all read" button → `POST /notifications/read-all`
- Click notification → marks read + navigates to entity → `POST /notifications/{id}/read`
- Filter: All | Unread
- API: `GET /notifications?limit=50&offset=0`

#### Notification Bell (Header Component)
- Badge with unread count
- Dropdown with latest 5 notifications
- "View all" link to `/notifications`

---

### 3.9 Template Pages

#### `/orgs/[orgId]/templates` – Task Templates
- Template list/grid → `GET /orgs/{orgId}/templates`
- "Create Template" → modal/page → `POST /orgs/{orgId}/templates`
- Template detail → `GET /orgs/{orgId}/templates/{templateId}`
- Edit template → `PUT /orgs/{orgId}/templates/{templateId}`
- Delete → `DELETE /orgs/{orgId}/templates/{templateId}`
- Template fields: name, description, default_status, default_priority, default_assignee_id, checklist_json (JSON array of default checklist items)

---

### 3.10 Webhook Pages

#### `/orgs/[orgId]/webhooks` – Webhook Management
- Webhook list table: URL, events, active toggle → `GET /orgs/{orgId}/webhooks`
- "Create Webhook" modal:
  - URL input
  - Event type multi-select (task.created, task.updated, project.created, etc.)
  - Secret key display
  - API: `POST /orgs/{orgId}/webhooks`
- Edit → `PUT /orgs/{orgId}/webhooks/{webhookId}`
- Delete → `DELETE /orgs/{orgId}/webhooks/{webhookId}`

---

### 3.11 API Key Pages

#### `/orgs/[orgId]/api-keys` – API Key Management
- Key list table: name, prefix, created date → `GET /orgs/{orgId}/api-keys`
- "Create API Key" button → modal:
  - Name input
  - Shows raw key ONCE after creation (copyable)
  - API: `POST /orgs/{orgId}/api-keys`
- Revoke/delete → `DELETE /orgs/{orgId}/api-keys/{keyId}`

---

### 3.12 Custom Roles Page

#### `/orgs/[orgId]/roles` – RBAC Role Management
- Role list with permissions summary → `GET /orgs/{orgId}/roles`
- "Create Role" modal:
  - Name + permissions JSON editor
  - API: `POST /orgs/{orgId}/roles`
- Edit role → `PUT /orgs/{orgId}/roles/{roleId}`
- Delete role → `DELETE /orgs/{orgId}/roles/{roleId}`
- Built-in roles shown as non-editable: owner, admin, member, viewer

---

### 3.13 Billing Page

#### `/orgs/[orgId]/billing` – Billing & Subscription
- Current plan card: plan name, features, price → `GET /orgs/{orgId}/billing/subscription`
- Available plans grid → `GET /orgs/{orgId}/billing/plans`
- Upgrade/downgrade buttons (future: Stripe checkout)
- Billing history table (future)

---

### 3.14 Notification Preferences Page

#### `/orgs/[orgId]/notification-preferences` – Notification Settings
- Toggle table:
  - Rows: Event types (task_assigned, task_completed, comment_added, etc.)
  - Columns: Email, In-App, Push
  - Toggle switches for each
- API: 
  - `GET /orgs/{orgId}/notification-preferences`
  - `PUT /orgs/{orgId}/notification-preferences` (upsert)

---

## 4. Shared Components

### Data Display
- `DataTable` – shadcn data table with sorting, filtering, pagination
- `KanbanBoard` – Drag-and-drop board with customizable columns
- `EmptyState` – Illustration + CTA for empty lists
- `LoadingSkeleton` – Skeleton loaders for all data views
- `Avatar` / `AvatarGroup` – User avatars with fallback initials
- `Badge` – Status, priority, role badges with color coding
- `Card` – Content cards for grid views

### Forms & Inputs
- `FormField` – Label + input + error message wrapper
- `RichTextEditor` – Markdown editor for descriptions/comments
- `DatePicker` – Date/time picker
- `UserSelect` – Searchable user picker dropdown
- `MultiSelect` – Multi-value select for tags/events
- `FileUpload` – Drag-and-drop file upload with presigned URL flow

### Navigation
- `Sidebar` – Collapsible navigation sidebar
- `OrgSwitcher` – Organization picker dropdown
- `Breadcrumbs` – Dynamic breadcrumb trail
- `CommandPalette` – ⌘K global search/action palette
- `Tabs` – View switcher tabs

### Feedback
- `ConfirmDialog` – Destructive action confirmation
- `Toast` – Success/error toast notifications
- `NotificationBell` – Header notification dropdown

### Real-time
- `SSEProvider` – Connects to `GET /orgs/{orgId}/events` SSE stream
- Auto-refreshes relevant queries when events arrive
- Event types: task.created, task.updated, task.deleted, project.updated, comment.created, etc.

---

## 5. Data Models (TypeScript Interfaces)

```typescript
// === Core Entities ===

interface Org {
  id: string;           // UUID
  name: string;
  slug: string;
  created_at: string;   // ISO 8601
  updated_at: string;
}

interface OrgMember {
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
}

interface Team {
  id: string;
  org_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

interface Project {
  id: string;
  org_id: string;
  team_id: string;       // UUID, references a team
  name: string;
  key: string;           // Short project key e.g. "PROJ"
  description: string;
  status: 'active' | 'archived' | 'completed';
  created_at: string;
  updated_at: string;
}

interface ProjectMember {
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;    // UUID for subtask hierarchy
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  priority: 'p0' | 'p1' | 'p2' | 'p3';
  assignee_id: string | null;  // UUID
  reporter_id: string;         // UUID
  due_date: string | null;     // ISO date
  start_date: string | null;
  story_points: number | null;
  position: number;
  review_status: 'none' | 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

interface TaskTree {
  task: Task;
  children: TaskTree[];
}

interface Checklist {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;           // Markdown
  created_at: string;
  updated_at: string;
}

interface TaskRule {
  id: string;
  task_id: string;
  rule_type: 'auto_assign' | 'require_review' | 'auto_close';
  config: Record<string, any>;  // JSON
  created_at: string;
}

interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;  // UUID of blocking task
  created_at: string;
}

interface TaskWatcher {
  task_id: string;
  user_id: string;
  created_at: string;
}

interface Attachment {
  id: string;
  task_id: string;
  uploader_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
}

interface TaskTemplate {
  id: string;
  org_id: string;
  name: string;
  description: string;
  default_status: string;
  default_priority: string;
  default_assignee_id: string | null;
  checklist_json: any;     // JSON array
  created_at: string;
  updated_at: string;
}

interface Webhook {
  id: string;
  org_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface APIKey {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
}

interface BillingPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_members: number;
  max_projects: number;
  features: Record<string, any>;
  stripe_price_id: string | null;
  created_at: string;
}

interface OrgSubscription {
  id: string;
  org_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  current_period_start: string;
  current_period_end: string;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CustomRole {
  id: string;
  org_id: string;
  name: string;
  permissions: Record<string, any>;  // JSON permissions object
  created_at: string;
  updated_at: string;
}

interface Notification {
  id: string;
  user_id: string;
  org_id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  read: boolean;
  created_at: string;
}

interface NotificationPreference {
  id: string;
  user_id: string;
  org_id: string;
  event_type: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
}

interface ActivityLog {
  id: string;
  org_id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, any>;
  created_at: string;
}

interface ImportJob {
  id: string;
  project_id: string;
  uploaded_by: string;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  error_message: string;
  created_at: string;
  updated_at: string;
}

// === Paginated List Response ===
interface ListResponse<T> {
  items: T[];
  total: number;
}
```

---

## 6. API Client Setup

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken(); // from cookie/store
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error || 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
```

---

## 7. Color & Design Tokens

### Priority Colors
| Priority | Color | Badge |
|----------|-------|-------|
| P0 (Critical) | `red-500` | 🔴 |
| P1 (High) | `orange-500` | 🟠 |
| P2 (Medium) | `yellow-500` | 🟡 |
| P3 (Low) | `blue-500` | 🔵 |

### Status Colors
| Status | Color |
|--------|-------|
| Backlog | `gray-400` |
| Todo | `blue-400` |
| In Progress | `yellow-500` |
| In Review | `purple-500` |
| Done | `green-500` |
| Cancelled | `red-400` |

### Role Badges
| Role | Color |
|------|-------|
| Owner | `purple-600` |
| Admin | `blue-600` |
| Member | `gray-600` |
| Viewer | `gray-400` |

---

## 8. Key UX Patterns

1. **Optimistic Updates**: Update UI immediately on mutation, rollback on error
2. **Infinite Scroll**: Use cursor-based pagination for large lists
3. **Keyboard Navigation**: Arrow keys in lists, Enter to open, Escape to close
4. **Command Palette** (⌘K): Quick access to search, navigation, and actions
5. **Toast Notifications**: Success/error feedback for all mutations
6. **Real-time Updates**: SSE events auto-refresh relevant React Query caches
7. **Responsive**: Collapse sidebar on mobile, stack columns on tablet
8. **Empty States**: Helpful illustrations and CTAs for first-time users
9. **Loading States**: Skeleton loaders matching content shape
10. **Error Boundaries**: Graceful error handling with retry buttons

---

## 9. File Structure

```
frontend/
├── app/
│   ├── layout.tsx                          # Root layout with providers
│   ├── (auth)/
│   │   ├── layout.tsx                      # Auth layout (centered)
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                      # Dashboard layout with sidebar
│   │   ├── dashboard/page.tsx              # Overview dashboard
│   │   ├── notifications/page.tsx
│   │   └── orgs/
│   │       ├── page.tsx                    # Org list/switcher
│   │       └── [orgId]/
│   │           ├── layout.tsx              # Org context provider
│   │           ├── settings/page.tsx
│   │           ├── teams/
│   │           │   ├── page.tsx
│   │           │   └── [teamId]/page.tsx
│   │           ├── projects/
│   │           │   ├── page.tsx
│   │           │   └── [projectId]/
│   │           │       ├── page.tsx        # Board/list view
│   │           │       ├── members/page.tsx
│   │           │       ├── settings/page.tsx
│   │           │       └── imports/page.tsx
│   │           ├── search/page.tsx
│   │           ├── templates/page.tsx
│   │           ├── webhooks/page.tsx
│   │           ├── api-keys/page.tsx
│   │           ├── roles/page.tsx
│   │           ├── billing/page.tsx
│   │           └── notification-preferences/page.tsx
├── components/
│   ├── ui/                                # shadcn/ui components
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── breadcrumbs.tsx
│   │   └── org-switcher.tsx
│   ├── tasks/
│   │   ├── task-card.tsx
│   │   ├── task-detail-panel.tsx
│   │   ├── task-form.tsx
│   │   ├── kanban-board.tsx
│   │   ├── task-list-view.tsx
│   │   ├── checklist-section.tsx
│   │   ├── comment-section.tsx
│   │   ├── attachment-section.tsx
│   │   ├── dependency-section.tsx
│   │   └── watcher-section.tsx
│   ├── projects/
│   │   ├── project-card.tsx
│   │   └── project-form.tsx
│   ├── teams/
│   │   └── team-card.tsx
│   ├── shared/
│   │   ├── data-table.tsx
│   │   ├── empty-state.tsx
│   │   ├── loading-skeleton.tsx
│   │   ├── confirm-dialog.tsx
│   │   ├── user-select.tsx
│   │   ├── date-picker.tsx
│   │   ├── file-upload.tsx
│   │   ├── badge.tsx
│   │   └── command-palette.tsx
│   └── notifications/
│       ├── notification-bell.tsx
│       └── notification-list.tsx
├── lib/
│   ├── api.ts                             # API client
│   ├── auth.ts                            # Auth helpers
│   ├── sse.ts                             # SSE connection manager
│   ├── utils.ts                           # Utility functions
│   └── constants.ts                       # Status/priority enums
├── hooks/
│   ├── use-orgs.ts
│   ├── use-teams.ts
│   ├── use-projects.ts
│   ├── use-tasks.ts
│   ├── use-notifications.ts
│   ├── use-search.ts
│   └── use-auth.ts
├── stores/
│   ├── auth-store.ts                      # Zustand auth state
│   └── ui-store.ts                        # Sidebar, modals, etc.
├── types/
│   └── index.ts                           # All TypeScript interfaces
└── styles/
    └── globals.css                        # Tailwind + custom tokens
```

---

## 10. Full API Reference (93 Endpoints)

### Auth (no token required)
```
POST   /auth/signup              – Register new user
POST   /auth/login               – Login
POST   /auth/refresh             – Refresh token
POST   /auth/logout              – Logout (requires token)
GET    /auth/user                – Get current user (requires token)
```

### Health
```
GET    /health                   – Health check
GET    /health/ready             – Readiness check (DB + Redis)
```

### Organizations
```
GET    /orgs                     – List user's organizations
POST   /orgs                     – Create organization
GET    /orgs/{orgId}             – Get organization
PUT    /orgs/{orgId}             – Update organization
DELETE /orgs/{orgId}             – Delete organization
GET    /orgs/{orgId}/members     – List members (paginated)
POST   /orgs/{orgId}/members     – Invite member (email + role)
PUT    /orgs/{orgId}/members/{userId}  – Update member role
DELETE /orgs/{orgId}/members/{userId}  – Remove member
```

### Teams
```
GET    /orgs/{orgId}/teams                          – List teams
POST   /orgs/{orgId}/teams                          – Create team
GET    /orgs/{orgId}/teams/{teamId}                 – Get team
PUT    /orgs/{orgId}/teams/{teamId}                 – Update team
DELETE /orgs/{orgId}/teams/{teamId}                 – Delete team
GET    /orgs/{orgId}/teams/{teamId}/members         – List team members
POST   /orgs/{orgId}/teams/{teamId}/members         – Add team member
DELETE /orgs/{orgId}/teams/{teamId}/members/{userId} – Remove team member
```

### Projects
```
GET    /orgs/{orgId}/projects                            – List projects
POST   /orgs/{orgId}/projects                            – Create project
GET    /orgs/{orgId}/projects/{projectId}                – Get project
PUT    /orgs/{orgId}/projects/{projectId}                – Update project
DELETE /orgs/{orgId}/projects/{projectId}                – Delete project
GET    /orgs/{orgId}/projects/{projectId}/members        – List project members
POST   /orgs/{orgId}/projects/{projectId}/members        – Add project member
DELETE /orgs/{orgId}/projects/{projectId}/members/{userId} – Remove member
```

### Tasks
```
GET    /orgs/{orgId}/projects/{projectId}/tasks              – List tasks (filterable)
POST   /orgs/{orgId}/projects/{projectId}/tasks              – Create task
GET    /orgs/{orgId}/projects/{projectId}/tasks/{taskId}     – Get task
PUT    /orgs/{orgId}/projects/{projectId}/tasks/{taskId}     – Update task
DELETE /orgs/{orgId}/projects/{projectId}/tasks/{taskId}     – Delete task
GET    /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/tree – Get task tree
POST   /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/review   – Submit for review
POST   /orgs/{orgId}/projects/{projectId}/tasks/{taskId}/complete – Mark complete
```

### Checklists
```
GET    .../tasks/{taskId}/checklists                    – List checklist items
POST   .../tasks/{taskId}/checklists                    – Create checklist item
PUT    .../tasks/{taskId}/checklists/{checklistId}      – Update item
DELETE .../tasks/{taskId}/checklists/{checklistId}      – Delete item
```

### Comments
```
GET    .../tasks/{taskId}/comments                      – List comments
POST   .../tasks/{taskId}/comments                      – Create comment
DELETE .../tasks/{taskId}/comments/{commentId}           – Delete comment
```

### Rules
```
GET    .../tasks/{taskId}/rules                         – List rules
POST   .../tasks/{taskId}/rules                         – Create rule
DELETE .../tasks/{taskId}/rules/{ruleId}                 – Delete rule
```

### Dependencies
```
GET    .../tasks/{taskId}/dependencies                  – List dependencies
POST   .../tasks/{taskId}/dependencies                  – Add dependency
DELETE .../tasks/{taskId}/dependencies/{depId}           – Remove dependency
GET    .../tasks/{taskId}/dependents                     – List dependents
```

### Watchers
```
GET    .../tasks/{taskId}/watchers                      – List watchers
POST   .../tasks/{taskId}/watchers                      – Watch task
DELETE .../tasks/{taskId}/watchers                       – Unwatch task
```

### Attachments
```
GET    .../tasks/{taskId}/attachments                         – List attachments
POST   .../tasks/{taskId}/attachments                         – Create (get upload URL)
GET    .../tasks/{taskId}/attachments/{attachmentId}/download  – Get download URL
DELETE .../tasks/{taskId}/attachments/{attachmentId}           – Delete attachment
```

### Templates
```
GET    /orgs/{orgId}/templates                    – List templates
POST   /orgs/{orgId}/templates                    – Create template
GET    /orgs/{orgId}/templates/{templateId}       – Get template
PUT    /orgs/{orgId}/templates/{templateId}       – Update template
DELETE /orgs/{orgId}/templates/{templateId}       – Delete template
```

### Webhooks
```
GET    /orgs/{orgId}/webhooks                     – List webhooks
POST   /orgs/{orgId}/webhooks                     – Create webhook
GET    /orgs/{orgId}/webhooks/{webhookId}         – Get webhook
PUT    /orgs/{orgId}/webhooks/{webhookId}         – Update webhook
DELETE /orgs/{orgId}/webhooks/{webhookId}         – Delete webhook
```

### API Keys
```
GET    /orgs/{orgId}/api-keys                     – List API keys
POST   /orgs/{orgId}/api-keys                     – Create API key (returns raw key once)
DELETE /orgs/{orgId}/api-keys/{keyId}             – Delete/revoke API key
```

### Custom Roles
```
GET    /orgs/{orgId}/roles                        – List roles
POST   /orgs/{orgId}/roles                        – Create custom role
GET    /orgs/{orgId}/roles/{roleId}               – Get role
PUT    /orgs/{orgId}/roles/{roleId}               – Update role
DELETE /orgs/{orgId}/roles/{roleId}               – Delete role
```

### Billing
```
GET    /orgs/{orgId}/billing/plans                – List billing plans
GET    /orgs/{orgId}/billing/subscription         – Get current subscription
```

### Notification Preferences
```
GET    /orgs/{orgId}/notification-preferences     – List preferences
PUT    /orgs/{orgId}/notification-preferences     – Upsert preference
```

### Imports
```
GET    /orgs/{orgId}/projects/{projectId}/imports              – List imports
POST   /orgs/{orgId}/projects/{projectId}/imports              – Create import (CSV upload)
GET    /orgs/{orgId}/projects/{projectId}/imports/{importId}   – Get import status
```

### Search
```
GET    /orgs/{orgId}/search/tasks?q=...           – Search tasks
GET    /orgs/{orgId}/search/projects?q=...        – Search projects
```

### Activity
```
GET    /orgs/{orgId}/activity?entity_type=...&entity_id=...  – List activity logs
```

### Notifications
```
GET    /notifications                             – List user notifications
POST   /notifications/{notificationId}/read       – Mark notification read
POST   /notifications/read-all                    – Mark all read
```

### Events (SSE)
```
GET    /orgs/{orgId}/events                       – SSE stream of real-time events
```

---

## 11. Swagger Documentation

The backend has auto-generated Swagger documentation available at:
- **Swagger UI**: `http://localhost:8080/swagger/index.html`
- **OpenAPI JSON**: `http://localhost:8080/swagger/doc.json`

Use the Swagger UI to explore all endpoints, request/response schemas, and try out API calls directly.

---

## Summary

Generate a complete Next.js 14 application with:
- 20+ pages covering all features above
- Responsive dashboard layout with collapsible sidebar
- Kanban board as the primary task management view
- Slide-over task detail panel with all sub-features
- Real-time updates via SSE
- Full CRUD for all entities
- shadcn/ui + Tailwind CSS styling with dark mode support
- TanStack Query for data fetching with optimistic updates
- ⌘K command palette for power users
- Proper error handling, loading states, and empty states
