"use client";

import { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, Badge, ConfirmDialog } from "@/components/ui/shared";
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
} from "lucide-react";
import { formatDate, statusColor, priorityColor, statusLabel, formatRelative } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority } from "@/types/domain";

interface TaskForm {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ orgSlug: string; projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
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
    defaultValues: { status: "todo", priority: "medium" },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: TaskForm) =>
      api.tasks.create(currentOrg!.id, projectId, {
        ...data,
        assignee_id: data.assignee_id || undefined,
      }),
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
          </div>
        }
      />

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

      {/* Create Task Modal */}
      <Modal open={showCreateTask} onClose={() => { setShowCreateTask(false); reset(); setError(""); }} title="New Task">
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
