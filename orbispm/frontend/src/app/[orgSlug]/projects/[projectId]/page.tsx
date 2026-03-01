"use client";

import { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, Badge, ConfirmDialog, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Settings,
  Users,
  ListTodo,
  TreeDeciduous,
  Import,
  UserPlus,
  Shield,
} from "lucide-react";
import { formatDate, statusColor, priorityColor, statusLabel, formatRelative } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority, ProjectMember } from "@/types/domain";

interface TaskForm {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  due_date: string;
  start_date: string;
  estimated_hours: string;
  labels: string;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ orgSlug: string; projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
  const [activeTab, setActiveTab] = useState<"tasks" | "members" | "dashboard">("tasks");
  const [error, setError] = useState("");

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["project", currentOrg?.id, projectId],
    queryFn: () => api.projects.get(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", currentOrg?.id, projectId],
    queryFn: () => api.tasks.list(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  const { data: taskTree } = useQuery({
    queryKey: ["task-tree", currentOrg?.id, projectId],
    queryFn: () => api.tasks.tree(currentOrg!.id, projectId),
    enabled: !!currentOrg && viewMode === "tree",
  });

  const { data: members } = useQuery({
    queryKey: ["project-members", currentOrg?.id, projectId],
    queryFn: () => api.projectMembers.list(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  const { register, handleSubmit, reset, formState: { errors: formErrors } } = useForm<TaskForm>({
    defaultValues: { status: "todo", priority: "medium", due_date: "", start_date: "", estimated_hours: "", labels: "" },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: TaskForm) => {
      const payload: Record<string, unknown> = {
        title: data.title,
        description: data.description || undefined,
        status: data.status,
        priority: data.priority,
        assignee_id: data.assignee_id || undefined,
      };
      if (data.due_date) payload.due_date = new Date(data.due_date).toISOString();
      if (data.start_date) payload.start_date = new Date(data.start_date).toISOString();
      if (data.estimated_hours) payload.estimated_hours = parseFloat(data.estimated_hours);
      if (data.labels) payload.labels = data.labels.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean);
      return api.tasks.create(currentOrg!.id, projectId, payload as Partial<Task>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", currentOrg?.id, projectId] });
      qc.invalidateQueries({ queryKey: ["task-tree", currentOrg?.id, projectId] });
      setShowCreateTask(false);
      reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create task"),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.tasks.delete(currentOrg!.id, projectId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task-tree"] });
      setDeleteTarget(null);
    },
  });

  if (projLoading || tasksLoading) return <LoadingPage />;
  if (!project) return <div className="text-center py-12">Project not found</div>;

  const taskList = tasks?.data || [];

  return (
    <div>
      <div className="mb-4">
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => router.push(`/${currentOrg!.slug}/projects`)}>
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </button>
      </div>

      <PageHeader
        title={project.name}
        description={project.description || ""}
        actions={
          <div className="flex gap-2">
            {activeTab === "tasks" && (
              <>
                <div className="join">
                  <button
                    className={`join-item btn btn-sm ${viewMode === "list" ? "btn-active" : ""}`}
                    onClick={() => setViewMode("list")}
                  >
                    <ListTodo className="w-4 h-4" /> List
                  </button>
                  <button
                    className={`join-item btn btn-sm ${viewMode === "tree" ? "btn-active" : ""}`}
                    onClick={() => setViewMode("tree")}
                  >
                    <TreeDeciduous className="w-4 h-4" /> Tree
                  </button>
                </div>
                <Button onClick={() => setShowCreateTask(true)} size="sm">
                  <Plus className="w-4 h-4" /> Add Task
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-bordered mb-6">
        <button role="tab" className={`tab ${activeTab === "dashboard" ? "tab-active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          <Settings className="w-4 h-4 mr-1" /> Dashboard
        </button>
        <button role="tab" className={`tab ${activeTab === "tasks" ? "tab-active" : ""}`} onClick={() => setActiveTab("tasks")}>
          <ListTodo className="w-4 h-4 mr-1" /> Tasks
        </button>
        <button role="tab" className={`tab ${activeTab === "members" ? "tab-active" : ""}`} onClick={() => setActiveTab("members")}>
          <Users className="w-4 h-4 mr-1" /> Members
        </button>
      </div>

      {/* Project Dashboard tab */}
      {activeTab === "dashboard" && (
        <ProjectDashboard tasks={taskList} members={members?.data || []} project={project} />
      )}

      {activeTab === "tasks" && (
        <>
      {/* Stats bar */}
      <div className="stats stats-horizontal shadow-sm border border-base-200 w-full mb-6">
        <div className="stat py-3 px-4">
          <div className="stat-title text-xs">Total Tasks</div>
          <div className="stat-value text-lg">{taskList.length}</div>
        </div>
        <div className="stat py-3 px-4">
          <div className="stat-title text-xs">Todo</div>
          <div className="stat-value text-lg">{taskList.filter((t: Task) => t.status === "todo").length}</div>
        </div>
        <div className="stat py-3 px-4">
          <div className="stat-title text-xs">In Progress</div>
          <div className="stat-value text-lg">{taskList.filter((t: Task) => t.status === "in_progress").length}</div>
        </div>
        <div className="stat py-3 px-4">
          <div className="stat-title text-xs">Done</div>
          <div className="stat-value text-lg">{taskList.filter((t: Task) => t.status === "done").length}</div>
        </div>
      </div>

      {/* Task list view */}
      {viewMode === "list" && (
        taskList.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="w-16 h-16" />}
            title="No tasks yet"
            description="Create your first task to get started"
            action={<Button onClick={() => setShowCreateTask(true)}><Plus className="w-4 h-4" /> Create Task</Button>}
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Due Date</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {taskList.map((task: Task) => (
                    <tr
                      key={task.id}
                      className="hover cursor-pointer"
                      onClick={() => router.push(`/${currentOrg!.slug}/projects/${projectId}/tasks/${task.id}`)}
                    >
                      <td>
                        <div>
                          <span className="font-medium">{task.title}</span>
                          {task.labels && task.labels.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {task.labels.map((l) => (
                                <span key={l} className="badge badge-xs badge-outline">{l}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td><Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge></td>
                      <td><Badge variant={priorityColor(task.priority)}>{statusLabel(task.priority)}</Badge></td>
                      <td className="text-sm text-base-content/60">{task.due_date ? formatDate(task.due_date) : "—"}</td>
                      <td className="text-sm text-base-content/60">{formatRelative(task.created_at)}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-xs btn-square"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(task); }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      {/* Tree view */}
      {viewMode === "tree" && (
        <Card>
          {!taskTree || taskTree.length === 0 ? (
            <p className="text-center py-8 text-base-content/50">No tasks in tree view</p>
          ) : (
            <div className="space-y-1">
              {taskTree.map((node) => (
                <TaskTreeNode
                  key={node.task.id}
                  node={node}
                  depth={0}
                  orgSlug={currentOrg!.slug}
                  projectId={projectId}
                />
              ))}
            </div>
          )}
        </Card>
      )}
      </>) /* end tasks tab */}

      {/* Members tab */}
      {activeTab === "members" && (
        <ProjectMembersSection orgId={currentOrg!.id} projectId={projectId} members={members?.data || []} />
      )}

      {/* Create Task Modal */}
      <Modal open={showCreateTask} onClose={() => { setShowCreateTask(false); reset(); setError(""); }} title="New Task" className="max-w-2xl">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        <form onSubmit={handleSubmit((data) => createTaskMutation.mutate(data))} className="space-y-4">
          <Input
            label="Title"
            placeholder="Task title"
            {...register("title", { required: "Title is required" })}
            error={formErrors.title?.message}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            {...register("description")}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              options={[
                { value: "todo", label: "Todo" },
                { value: "in_progress", label: "In Progress" },
                { value: "done", label: "Done" },
                { value: "blocked", label: "Blocked" },
              ]}
              {...register("status")}
            />
            <Select
              label="Priority"
              options={[
                { value: "critical", label: "Critical" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
              {...register("priority")}
            />
          </div>
          {/* Assignee */}
          <Select
            label="Assignee"
            placeholder="Unassigned"
            options={[
              { value: "", label: "Unassigned" },
              ...(members?.data || []).map((m) => ({ value: m.user_id, label: m.display_name || m.email || m.user_id.slice(0, 12) })),
            ]}
            {...register("assignee_id")}
          />
          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" {...register("start_date")} />
            <Input label="Due Date" type="date" {...register("due_date")} />
          </div>
          {/* Hours & Labels */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Estimated Hours" type="number" step="0.5" min="0" placeholder="0" {...register("estimated_hours")} />
            <Input label="Labels" placeholder="bug, ui, backend" helperText="Comma-separated" {...register("labels")} />
          </div>
          <div className="modal-action">
            <Button type="button" variant="ghost" onClick={() => { setShowCreateTask(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createTaskMutation.isPending}>Create Task</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteTaskMutation.mutate(deleteTarget.id)}
        title="Delete Task"
        message={`Are you sure you want to delete "${deleteTarget?.title}"?`}
        loading={deleteTaskMutation.isPending}
      />
    </div>
  );
}

function TaskTreeNode({
  node,
  depth,
  orgSlug,
  projectId,
}: {
  node: { task: Task; children?: { task: Task; children?: unknown[] }[] };
  depth: number;
  orgSlug: string;
  projectId: string;
}) {
  const router = useRouter();
  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-base-200 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
        onClick={() => router.push(`/${orgSlug}/projects/${projectId}/tasks/${node.task.id}`)}
      >
        <Badge variant={statusColor(node.task.status)}>{statusLabel(node.task.status)}</Badge>
        <span className="font-medium flex-1">{node.task.title}</span>
        <Badge variant={priorityColor(node.task.priority)}>{node.task.priority}</Badge>
      </div>
      {node.children?.map((child) => (
        <TaskTreeNode
          key={child.task.id}
          node={child as { task: Task; children?: { task: Task; children?: unknown[] }[] }}
          depth={depth + 1}
          orgSlug={orgSlug}
          projectId={projectId}
        />
      ))}
    </div>
  );
}

/* ─── Project Members Section ─── */

function ProjectMembersSection({
  orgId,
  projectId,
  members,
}: {
  orgId: string;
  projectId: string;
  members: ProjectMember[];
}) {
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");

  const { data: orgMembers } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
  });

  const addMutation = useMutation({
    mutationFn: () => api.projectMembers.add(orgId, projectId, { user_id: addUserId, role: addRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] });
      setAddUserId("");
      setAddRole("member");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.projectMembers.remove(orgId, projectId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.projectMembers.update(orgId, projectId, userId, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] }),
  });

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableOrg = (orgMembers?.data || []).filter((m) => !memberIds.has(m.user_id));

  return (
    <div className="space-y-4">
      {/* Add member row */}
      <Card>
        <h3 className="font-semibold mb-3">Add Project Member</h3>
        <form
          className="flex gap-2 items-end"
          onSubmit={(e) => { e.preventDefault(); if (addUserId) addMutation.mutate(); }}
        >
          <div className="flex-1">
            <label className="label"><span className="label-text text-xs">Org Member</span></label>
            <select
              className="select select-bordered select-sm w-full"
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
            >
              <option value="">Select member…</option>
              {availableOrg.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.display_name || m.email || m.user_id.slice(0, 16)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label"><span className="label-text text-xs">Role</span></label>
            <select className="select select-bordered select-sm" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
              <option value="lead">Lead</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <Button type="submit" size="sm" loading={addMutation.isPending} disabled={!addUserId}>
            <UserPlus className="w-4 h-4" /> Add
          </Button>
        </form>
      </Card>

      {/* Members table */}
      <Card>
        {members.length === 0 ? (
          <p className="text-center py-6 text-base-content/50">No project members yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={m.display_name || m.email || m.user_id.slice(0, 4)} size="sm" />
                        <div>
                          <span className="text-sm font-medium">{m.display_name || m.email || m.user_id.slice(0, 12)}</span>
                          {m.email && m.display_name && <span className="block text-xs text-base-content/50">{m.email}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className="select select-ghost select-xs"
                        value={m.role}
                        onChange={(e) => updateRoleMutation.mutate({ userId: m.user_id, role: e.target.value })}
                      >
                        <option value="lead">Lead</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="text-sm text-base-content/60">{formatDate(m.joined_at)}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => removeMutation.mutate(m.user_id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Project Dashboard ─── */

function ProjectDashboard({
  tasks,
  members,
  project,
}: {
  tasks: Task[];
  members: ProjectMember[];
  project: { name: string; status: string; created_at: string };
}) {
  const total = tasks.length;
  const byStatus = {
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };
  const byPriority = {
    critical: tasks.filter((t) => t.priority === "critical").length,
    high: tasks.filter((t) => t.priority === "high").length,
    medium: tasks.filter((t) => t.priority === "medium").length,
    low: tasks.filter((t) => t.priority === "low").length,
  };
  const overdue = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done"
  ).length;
  const completionRate = total > 0 ? Math.round((byStatus.done / total) * 100) : 0;

  // Estimated vs actual hours
  const estHours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
  const actHours = tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Total</div>
          <div className="stat-value text-lg">{total}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Completion</div>
          <div className="stat-value text-lg text-success">{completionRate}%</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">In Progress</div>
          <div className="stat-value text-lg text-info">{byStatus.in_progress}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Blocked</div>
          <div className="stat-value text-lg text-warning">{byStatus.blocked}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Overdue</div>
          <div className="stat-value text-lg text-error">{overdue}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Members</div>
          <div className="stat-value text-lg">{members.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status distribution */}
        <Card title="Status Distribution">
          <div className="space-y-3">
            {(["todo", "in_progress", "done", "blocked"] as const).map((s) => {
              const count = byStatus[s];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-sm w-24">{statusLabel(s)}</span>
                  <progress
                    className={`progress flex-1 ${
                      s === "done" ? "progress-success" :
                      s === "in_progress" ? "progress-info" :
                      s === "blocked" ? "progress-warning" : "progress-neutral"
                    }`}
                    value={count}
                    max={total || 1}
                  />
                  <span className="text-sm font-mono w-14 text-right">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Priority distribution */}
        <Card title="Priority Distribution">
          <div className="space-y-3">
            {(["critical", "high", "medium", "low"] as const).map((p) => {
              const count = byPriority[p];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className="text-sm w-24">{statusLabel(p)}</span>
                  <progress
                    className={`progress flex-1 ${
                      p === "critical" ? "progress-error" :
                      p === "high" ? "progress-warning" :
                      p === "medium" ? "progress-info" : "progress-neutral"
                    }`}
                    value={count}
                    max={total || 1}
                  />
                  <span className="text-sm font-mono w-14 text-right">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Time tracking */}
        <Card title="Time Tracking">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/60">Estimated Hours</span>
              <span className="font-mono text-lg">{estHours.toFixed(1)}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/60">Actual Hours</span>
              <span className="font-mono text-lg">{actHours.toFixed(1)}h</span>
            </div>
            {estHours > 0 && (
              <>
                <progress className="progress progress-primary w-full" value={actHours} max={estHours} />
                <p className="text-xs text-base-content/50 text-center">
                  {Math.round((actHours / estHours) * 100)}% of estimated time used
                </p>
              </>
            )}
          </div>
        </Card>

        {/* Recently updated tasks */}
        <Card title="Recently Updated">
          <div className="space-y-2">
            {tasks
              .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
              .slice(0, 5)
              .map((task) => (
                <div key={task.id} className="flex items-center gap-2 text-sm py-1">
                  <Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
                  <span className="flex-1 truncate">{task.title}</span>
                  <span className="text-xs text-base-content/40">{formatRelative(task.updated_at)}</span>
                </div>
              ))}
            {tasks.length === 0 && (
              <p className="text-sm text-base-content/50">No tasks yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
