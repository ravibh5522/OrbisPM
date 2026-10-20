import { z } from "zod";

export function registerTools(server, api) {
  const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
  const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message || e) }] });
  const wrap = (fn) => async (args) => { try { return ok(await fn(args)); } catch (e) { return fail(e); } };

server.tool("list_projects", "List projects in the organisation.", {},
  wrap(() => api("GET", "/projects")));

server.tool("get_project", "Get one project by id.",
  { project_id: z.string().uuid() },
  wrap(({ project_id }) => api("GET", `/projects/${project_id}`)));

server.tool("list_project_members", "List members of a project.",
  { project_id: z.string().uuid() },
  wrap(({ project_id }) => api("GET", `/projects/${project_id}/members`)));

server.tool("list_tasks", "List tasks in a project.",
  { project_id: z.string().uuid() },
  wrap(({ project_id }) => api("GET", `/projects/${project_id}/tasks`)));

server.tool("get_task", "Get one task by id.",
  { project_id: z.string().uuid(), task_id: z.string().uuid() },
  wrap(({ project_id, task_id }) => api("GET", `/projects/${project_id}/tasks/${task_id}`)));

server.tool("create_task", "Create a task in a project.",
  {
    project_id: z.string().uuid(),
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    assignee_id: z.string().uuid().optional(),
    due_date: z.string().describe("RFC3339 timestamp, e.g. 2026-11-01T00:00:00Z").optional(),
    labels: z.array(z.string()).optional(),
    parent_task_id: z.string().uuid().optional(),
  },
  wrap(({ project_id, ...body }) => api("POST", `/projects/${project_id}/tasks`, body)));

server.tool("update_task", "Update fields of a task (status, priority, title, assignee, ...).",
  {
    project_id: z.string().uuid(),
    task_id: z.string().uuid(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().optional(),
    status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    assignee_id: z.string().uuid().optional(),
  },
  wrap(({ project_id, task_id, ...body }) => api("PATCH", `/projects/${project_id}/tasks/${task_id}`, body)));

server.tool("add_comment", "Add a comment to a task.",
  { project_id: z.string().uuid(), task_id: z.string().uuid(), body: z.string().min(1) },
  wrap(({ project_id, task_id, body }) => api("POST", `/projects/${project_id}/tasks/${task_id}/comments`, { body })));

server.tool("list_comments", "List comments on a task.",
  { project_id: z.string().uuid(), task_id: z.string().uuid() },
  wrap(({ project_id, task_id }) => api("GET", `/projects/${project_id}/tasks/${task_id}/comments`)));


// ---- hierarchy ------------------------------------------------------------
server.tool("list_task_tree", "List a project's tasks as a nested tree (all depths).",
  { project_id: z.string().uuid() },
  wrap(({ project_id }) => api("GET", `/projects/${project_id}/tasks/tree`)));

server.tool("get_task_tree", "Get one task with all of its descendants.",
  { project_id: z.string().uuid(), task_id: z.string().uuid() },
  wrap(({ project_id, task_id }) => api("GET", `/projects/${project_id}/tasks/${task_id}/tree`)));

server.tool("delete_task", "Delete a task (and its subtasks).",
  { project_id: z.string().uuid(), task_id: z.string().uuid() },
  wrap(({ project_id, task_id }) => api("DELETE", `/projects/${project_id}/tasks/${task_id}`)));

// ---- review workflow ------------------------------------------------------
server.tool("submit_task_for_review", "Move a task into review.",
  { project_id: z.string().uuid(), task_id: z.string().uuid() },
  wrap(({ project_id, task_id }) => api("POST", `/projects/${project_id}/tasks/${task_id}/submit-review`, {})));

server.tool("complete_task", "Mark a task complete (needs the tasks:review permission).",
  { project_id: z.string().uuid(), task_id: z.string().uuid() },
  wrap(({ project_id, task_id }) => api("POST", `/projects/${project_id}/tasks/${task_id}/complete`, {})));

// ---- change requests ------------------------------------------------------
server.tool("propose_change", "Propose changes to a task as a change request, e.g. {\"priority\":\"critical\"}. A reviewer approves or rejects it.",
  { project_id: z.string().uuid(), task_id: z.string().uuid(),
    changes: z.record(z.any()), reason: z.string().optional() },
  wrap(({ project_id, task_id, changes, reason }) =>
    api("POST", `/projects/${project_id}/tasks/${task_id}/change-requests`, { changes, reason })));

server.tool("list_change_requests", "List change requests for a project.",
  { project_id: z.string().uuid() },
  wrap(({ project_id }) => api("GET", `/projects/${project_id}/change-requests`)));

server.tool("approve_change_request", "Approve a change request (applies the proposed changes).",
  { project_id: z.string().uuid(), change_request_id: z.string().uuid(), note: z.string().optional() },
  wrap(({ project_id, change_request_id, note }) =>
    api("POST", `/projects/${project_id}/change-requests/${change_request_id}/approve`, { note: note || "" })));

server.tool("reject_change_request", "Reject a change request.",
  { project_id: z.string().uuid(), change_request_id: z.string().uuid(), note: z.string().optional() },
  wrap(({ project_id, change_request_id, note }) =>
    api("POST", `/projects/${project_id}/change-requests/${change_request_id}/reject`, { note: note || "" })));

// ---- announcements --------------------------------------------------------
server.tool("list_announcements", "List announcements.", {},
  wrap(() => api("GET", "/announcements")));

server.tool("create_announcement", "Publish an announcement (org-wide, or for one project).",
  { title: z.string().min(1), body: z.string().min(1),
    priority: z.string().optional().describe("e.g. normal, high, urgent"),
    pinned: z.boolean().optional(), project_id: z.string().uuid().optional() },
  wrap((args) => api("POST", "/announcements", args)));

server.tool("update_announcement", "Edit an announcement.",
  { announcement_id: z.string().uuid(), title: z.string().optional(), body: z.string().optional(),
    priority: z.string().optional(), pinned: z.boolean().optional() },
  wrap(({ announcement_id, ...b }) => api("PATCH", `/announcements/${announcement_id}`, b)));

server.tool("delete_announcement", "Delete an announcement.",
  { announcement_id: z.string().uuid() },
  wrap(({ announcement_id }) => api("DELETE", `/announcements/${announcement_id}`)));

// ---- dashboards & analytics -----------------------------------------------
server.tool("dashboard_stats", "Org dashboard statistics for the key owner.", {},
  wrap(() => api("GET", "/dashboard/stats")));

server.tool("my_tasks", "Tasks assigned to the key owner.", {},
  wrap(() => api("GET", "/dashboard/my-tasks")));

server.tool("project_dashboard", "Dashboard for one project.",
  { project_id: z.string().uuid() },
  wrap(({ project_id }) => api("GET", `/projects/${project_id}/dashboard`)));

server.tool("project_analytics", "Analytics for one project: summary, or 'velocity' / 'cfd'.",
  { project_id: z.string().uuid(), view: z.enum(["summary", "velocity", "cfd"]).default("summary") },
  wrap(({ project_id, view }) =>
    api("GET", `/projects/${project_id}/analytics${view === "summary" ? "" : "/" + view}`)));

server.tool("org_analytics", "Org-wide analytics.", {},
  wrap(() => api("GET", "/analytics/org")));

server.tool("list_org_members", "List organisation members.", {},
  wrap(() => api("GET", "/members")));

}
