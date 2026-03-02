"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, ConfirmDialog, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import {
  Plus,
  Trash2,
  ChevronRight,
  ExternalLink,
  Copy,
  Loader2,
} from "lucide-react";
import { statusColor, priorityColor, statusLabel, formatDate, cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority, ProjectMember } from "@/types/domain";

const MAX_DEPTH = 3;

/* ═══════════════════════════════════════════════════════
   Main 5-column component
   ═══════════════════════════════════════════════════════ */

interface TaskColumnsProps {
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
}

export function TaskColumns({ orgId, orgSlug, projectId, members }: TaskColumnsProps) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<(string | null)[]>([null, null, null, null]);
  const [createDepth, setCreateDepth] = useState<number | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const selectTask = useCallback((depth: number, taskId: string | null) => {
    setSelected((prev) => {
      const next = [...prev];
      next[depth] = taskId;
      for (let i = depth + 1; i < next.length; i++) next[i] = null;
      return next;
    });
  }, []);

  /* depth of the deepest selected task */
  const focusedDepth = useMemo(() => {
    for (let i = selected.length - 1; i >= 0; i--) {
      if (selected[i]) return i;
    }
    return -1;
  }, [selected]);

  /* ── Queries for each column ── */
  const rootQ = useQuery({
    queryKey: ["tasks", orgId, projectId, "parent", "root"],
    queryFn: () => api.tasks.list(orgId, projectId, "parent_id=root"),
    enabled: !!orgId,
  });

  const d1Q = useQuery({
    queryKey: ["tasks", orgId, projectId, "parent", selected[0]],
    queryFn: () => api.tasks.list(orgId, projectId, `parent_id=${selected[0]}`),
    enabled: !!orgId && !!selected[0],
  });

  const d2Q = useQuery({
    queryKey: ["tasks", orgId, projectId, "parent", selected[1]],
    queryFn: () => api.tasks.list(orgId, projectId, `parent_id=${selected[1]}`),
    enabled: !!orgId && !!selected[1],
  });

  const d3Q = useQuery({
    queryKey: ["tasks", orgId, projectId, "parent", selected[2]],
    queryFn: () => api.tasks.list(orgId, projectId, `parent_id=${selected[2]}`),
    enabled: !!orgId && !!selected[2],
  });

  const columnData: Task[][] = [
    rootQ.data?.data || [],
    d1Q.data?.data || [],
    d2Q.data?.data || [],
    d3Q.data?.data || [],
  ];

  const focusedTask =
    focusedDepth >= 0
      ? columnData[focusedDepth]?.find((t) => t.id === selected[focusedDepth]) ?? null
      : null;

  /* ── Mutations ── */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.tasks.delete(orgId, projectId, id),
    onSuccess: (_d, deletedId) => {
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
      setSelected((prev) => {
        const idx = prev.indexOf(deletedId);
        if (idx >= 0) {
          const next = [...prev];
          for (let i = idx; i < next.length; i++) next[i] = null;
          return next;
        }
        return prev;
      });
      setDeleteTarget(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Partial<Task> }) =>
      api.tasks.update(orgId, projectId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.tasks.duplicate(orgId, projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["task-list", orgId, projectId] });
    },
  });

  const openCreate = (depth: number) => {
    setCreateDepth(depth);
    setCreateParentId(depth > 0 ? selected[depth - 1] : null);
  };

  /* ── Render ── */
  const columnMeta = [
    { depth: 0, label: "Tasks", tasks: columnData[0], loading: rootQ.isLoading, show: true },
    { depth: 1, label: "Subtasks", tasks: columnData[1], loading: d1Q.isLoading, show: !!selected[0] },
    { depth: 2, label: "Level 3", tasks: columnData[2], loading: d2Q.isLoading, show: !!selected[1] },
    { depth: 3, label: "Level 4", tasks: columnData[3], loading: d3Q.isLoading, show: !!selected[2] },
  ];

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[500px] border border-base-200 rounded-lg overflow-hidden bg-base-100">
      {/* Scrollable columns area */}
      <div className="flex flex-1 min-w-0 overflow-x-auto">
        {columnMeta.map(
          (col) =>
            col.show && (
              <TaskColumn
                key={col.depth}
                label={col.label}
                tasks={col.tasks}
                loading={col.loading}
                selectedId={selected[col.depth]}
                onSelect={(id) => selectTask(col.depth, id)}
                onAdd={() => openCreate(col.depth)}
                members={members}
              />
            ),
        )}
      </div>

      {/* Detail panel */}
      <div className="w-[380px] min-w-[340px] border-l border-base-200 overflow-y-auto">
        {focusedTask ? (
          <TaskDetailPanel
            task={focusedTask}
            orgSlug={orgSlug}
            projectId={projectId}
            members={members}
            updating={updateMutation.isPending}
            onUpdate={(data) => updateMutation.mutate({ taskId: focusedTask.id, data })}
            onDelete={() => setDeleteTarget(focusedTask)}
            onDuplicate={() => duplicateMutation.mutate(focusedTask.id)}
            onAddSubtask={() => {
              if (focusedTask.depth < MAX_DEPTH) {
                setCreateParentId(focusedTask.id);
                setCreateDepth(focusedTask.depth + 1);
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-base-content/30 p-6">
            <p className="text-sm text-center">Select a task to view details</p>
          </div>
        )}
      </div>

      {/* Create modal */}
      {createDepth !== null && (
        <CreateTaskModal
          orgId={orgId}
          projectId={projectId}
          parentId={createParentId}
          members={members}
          onClose={() => {
            setCreateDepth(null);
            setCreateParentId(null);
          }}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
            setCreateDepth(null);
            setCreateParentId(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}" and all its subtasks?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Single column
   ═══════════════════════════════════════════════════════ */

function TaskColumn({
  label,
  tasks,
  loading,
  selectedId,
  onSelect,
  onAdd,
  members,
}: {
  label: string;
  tasks: Task[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  members: ProjectMember[];
}) {
  return (
    <div className="w-56 min-w-56 flex flex-col border-r border-base-200 shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-200 flex items-center justify-between bg-base-200/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-base-content/40">{tasks.length}</span>
          <button className="btn btn-ghost btn-xs btn-square" onClick={onAdd} title={`Add ${label.toLowerCase()}`}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-base-content/30" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 px-3">
            <p className="text-xs text-base-content/30">No tasks</p>
            <button className="btn btn-ghost btn-xs mt-2" onClick={onAdd}>
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        ) : (
          <div className="py-0.5">
            {tasks.map((task) => {
              const isSelected = task.id === selectedId;
              const assignee = members.find((m) => m.user_id === task.assignee_id);
              return (
                <button
                  key={task.id}
                  onClick={() => onSelect(task.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-l-2",
                    "hover:bg-base-200/50",
                    isSelected ? "bg-primary/10 border-l-primary" : "border-l-transparent",
                  )}
                >
                  {/* Status dot */}
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      task.status === "done" && "bg-success",
                      task.status === "in_progress" && "bg-info",
                      task.status === "blocked" && "bg-error",
                      task.status === "todo" && "bg-base-content/20",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate leading-tight">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={cn(
                          "text-[10px] leading-none px-1 py-0.5 rounded",
                          task.priority === "critical" && "bg-error/10 text-error",
                          task.priority === "high" && "bg-warning/10 text-warning",
                          task.priority === "medium" && "bg-info/10 text-info",
                          task.priority === "low" && "bg-base-200 text-base-content/50",
                        )}
                      >
                        {task.priority}
                      </span>
                      {assignee && (
                        <Avatar
                          name={assignee.display_name || assignee.email || ""}
                          size="xs"
                          src={assignee.avatar_url}
                        />
                      )}
                    </div>
                  </div>
                  {task.depth < MAX_DEPTH && (
                    <ChevronRight className="w-3.5 h-3.5 text-base-content/20 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Detail panel
   ═══════════════════════════════════════════════════════ */

function TaskDetailPanel({
  task,
  orgSlug,
  projectId,
  members,
  updating,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddSubtask,
}: {
  task: Task;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
  updating: boolean;
  onUpdate: (data: Partial<Task>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubtask: () => void;
}) {
  const router = useRouter();

  /* inline-edit state */
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || "");

  /* reset drafts when focused task changes */
  const [prevId, setPrevId] = useState(task.id);
  if (task.id !== prevId) {
    setPrevId(task.id);
    setEditingTitle(false);
    setEditingDesc(false);
    setTitleDraft(task.title);
    setDescDraft(task.description || "");
  }

  return (
    <div className="p-4 space-y-4">
      {/* ── Title ── */}
      {editingTitle ? (
        <div className="space-y-1">
          <input
            type="text"
            className="input input-bordered input-sm w-full font-semibold"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && titleDraft.trim()) {
                onUpdate({ title: titleDraft.trim() });
                setEditingTitle(false);
              }
              if (e.key === "Escape") setEditingTitle(false);
            }}
          />
          <div className="flex gap-1">
            <button
              className="btn btn-primary btn-xs"
              onClick={() => {
                if (titleDraft.trim()) {
                  onUpdate({ title: titleDraft.trim() });
                  setEditingTitle(false);
                }
              }}
            >
              Save
            </button>
            <button className="btn btn-ghost btn-xs" onClick={() => setEditingTitle(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <h2
          className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors"
          onClick={() => {
            setTitleDraft(task.title);
            setEditingTitle(true);
          }}
        >
          {task.title}
        </h2>
      )}

      {/* ── Status & Priority ── */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-base-content/50 block mb-1">Status</label>
          <select
            className="select select-bordered select-sm w-full"
            value={task.status}
            onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-base-content/50 block mb-1">Priority</label>
          <select
            className="select select-bordered select-sm w-full"
            value={task.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* ── Assignee ── */}
      <div>
        <label className="text-xs text-base-content/50 block mb-1">Assignee</label>
        <select
          className="select select-bordered select-sm w-full"
          value={task.assignee_id || ""}
          onChange={(e) => onUpdate({ assignee_id: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name || m.email || m.user_id.slice(0, 12)}
            </option>
          ))}
        </select>
      </div>

      {/* ── Description ── */}
      <div>
        <label className="text-xs text-base-content/50 block mb-1">Description</label>
        {editingDesc ? (
          <div className="space-y-1">
            <textarea
              className="textarea textarea-bordered w-full text-sm"
              rows={4}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              autoFocus
            />
            <div className="flex gap-1">
              <button
                className="btn btn-primary btn-xs"
                onClick={() => {
                  onUpdate({ description: descDraft });
                  setEditingDesc(false);
                }}
              >
                Save
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setEditingDesc(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="text-sm text-base-content/70 min-h-[40px] p-2 rounded border border-transparent hover:border-base-300 cursor-pointer whitespace-pre-wrap"
            onClick={() => {
              setDescDraft(task.description || "");
              setEditingDesc(true);
            }}
          >
            {task.description || (
              <span className="text-base-content/30 italic">Click to add description…</span>
            )}
          </div>
        )}
      </div>

      <div className="divider my-1" />

      {/* ── Dates ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Start</label>
          <input
            type="date"
            className="input input-bordered input-xs w-full"
            value={task.start_date ? task.start_date.split("T")[0] : ""}
            onChange={(e) =>
              onUpdate({ start_date: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
        </div>
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Due</label>
          <input
            type="date"
            className="input input-bordered input-xs w-full"
            value={task.due_date ? task.due_date.split("T")[0] : ""}
            onChange={(e) =>
              onUpdate({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
        </div>
      </div>

      {/* ── Hours ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Est. Hours</label>
          <input
            type="number"
            className="input input-bordered input-xs w-full"
            step="0.5"
            min="0"
            placeholder="0"
            value={task.estimated_hours ?? ""}
            onChange={(e) =>
              onUpdate({ estimated_hours: e.target.value ? parseFloat(e.target.value) : null })
            }
          />
        </div>
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Actual Hours</label>
          <input
            type="number"
            className="input input-bordered input-xs w-full"
            step="0.5"
            min="0"
            placeholder="0"
            value={task.actual_hours ?? ""}
            onChange={(e) =>
              onUpdate({ actual_hours: e.target.value ? parseFloat(e.target.value) : null })
            }
          />
        </div>
      </div>

      {/* ── Labels ── */}
      {task.labels && task.labels.length > 0 && (
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Labels</label>
          <div className="flex flex-wrap gap-1">
            {task.labels.map((l) => (
              <span key={l} className="badge badge-xs badge-outline">
                {l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Meta ── */}
      <div className="text-[11px] text-base-content/40 space-y-0.5 pt-1">
        <p>Created {formatDate(task.created_at)} · Updated {formatDate(task.updated_at)}</p>
        {task.parent_task_id && <p>Depth {task.depth}</p>}
      </div>

      <div className="divider my-1" />

      {/* ── Actions ── */}
      <div className="space-y-2">
        {task.depth < MAX_DEPTH && (
          <button className="btn btn-sm btn-outline btn-primary w-full gap-1" onClick={onAddSubtask}>
            <Plus className="w-3.5 h-3.5" /> Add Subtask
          </button>
        )}
        <button
          className="btn btn-sm btn-ghost w-full gap-1"
          onClick={() => router.push(`/${orgSlug}/projects/${projectId}/tasks/${task.id}`)}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Full Details
        </button>
        <button className="btn btn-sm btn-ghost w-full gap-1" onClick={onDuplicate}>
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <button className="btn btn-sm btn-ghost text-error w-full gap-1" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      {updating && (
        <div className="text-center">
          <Loader2 className="w-4 h-4 animate-spin inline text-primary" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Create task modal
   ═══════════════════════════════════════════════════════ */

interface CreateForm {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
}

function CreateTaskModal({
  orgId,
  projectId,
  parentId,
  members,
  onClose,
  onCreated,
}: {
  orgId: string;
  projectId: string;
  parentId: string | null;
  members: ProjectMember[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<CreateForm>({
    defaultValues: { status: "todo", priority: "medium", assignee_id: "" },
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (data: CreateForm) => {
      const payload: Record<string, unknown> = {
        title: data.title,
        status: data.status,
        priority: data.priority,
      };
      if (data.assignee_id) payload.assignee_id = data.assignee_id;
      if (parentId) payload.parent_task_id = parentId;
      return api.tasks.create(orgId, projectId, payload as Partial<Task>);
    },
    onSuccess: () => onCreated(),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open onClose={onClose} title={parentId ? "New Subtask" : "New Task"} className="max-w-md">
      {error && (
        <div className="alert alert-error mb-3 text-sm">
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-3">
        <Input
          label="Title"
          placeholder="Task title"
          {...register("title", { required: "Title is required" })}
          error={formErrors.title?.message}
        />
        <div className="grid grid-cols-2 gap-3">
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
        <Select
          label="Assignee"
          options={[
            { value: "", label: "Unassigned" },
            ...members.map((m) => ({
              value: m.user_id,
              label: m.display_name || m.email || m.user_id.slice(0, 12),
            })),
          ]}
          {...register("assignee_id")}
        />
        <div className="modal-action">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
