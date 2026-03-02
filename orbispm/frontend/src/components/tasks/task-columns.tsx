"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ConfirmDialog, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAuthStore } from "@/stores/auth-store";
import { TaskPreviewPanel } from "@/components/tasks/task-preview-panel";
import {
  Plus,
  ChevronRight,
  Loader2,
  GripVertical,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority, ProjectMember, OrgMember } from "@/types/domain";

const MAX_DEPTH = 3;
const DEFAULT_COL_WIDTHS = [220, 220, 200, 200];
const DEFAULT_COL_NAMES = ["TASKS", "SUBTASKS", "LEVEL 3", "LEVEL 4"];
const LS_WIDTHS_KEY = "task-column-widths";
const LS_NAMES_KEY = "task-column-names";

/* ═══════════════════════════════════════════════════════
   Main 5-column component
   ═══════════════════════════════════════════════════════ */

interface TaskColumnsProps {
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
  orgMembers?: OrgMember[];
}

export function TaskColumns({ orgId, orgSlug, projectId, members, orgMembers }: TaskColumnsProps) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id || "";
  const [selected, setSelected] = useState<(string | null)[]>([null, null, null, null]);
  const [createDepth, setCreateDepth] = useState<number | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [autoExpanded, setAutoExpanded] = useState(false);

  // Column customization: widths and names (persisted per project)
  const [columnWidths, setColumnWidths] = useState<number[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COL_WIDTHS;
    try {
      const stored = localStorage.getItem(`${LS_WIDTHS_KEY}-${projectId}`);
      return stored ? JSON.parse(stored) : DEFAULT_COL_WIDTHS;
    } catch { return DEFAULT_COL_WIDTHS; }
  });
  const [columnNames, setColumnNames] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COL_NAMES;
    try {
      const stored = localStorage.getItem(`${LS_NAMES_KEY}-${projectId}`);
      return stored ? JSON.parse(stored) : DEFAULT_COL_NAMES;
    } catch { return DEFAULT_COL_NAMES; }
  });

  // Get user's project role
  const userProjectRole = members.find((m) => m.user_id === currentUserId)?.role;
  const canEditColumns = userProjectRole === "lead" || userProjectRole === "admin" || userProjectRole === "owner";

  // Convert ProjectMember to OrgMember format if orgMembers not provided
  const effectiveMembers: OrgMember[] = orgMembers || members.map((m) => ({
    org_id: orgId,
    user_id: m.user_id,
    email: m.email || "",
    display_name: m.display_name || m.email || "",
    avatar_url: m.avatar_url,
    role: "member" as const, // ProjectMember role is different from OrgRole, default to member
    joined_at: m.joined_at,
  }));

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

  // Auto-expand first task when project loads (select first task and its subtasks)
  useEffect(() => {
    if (!autoExpanded && rootQ.data?.data && rootQ.data.data.length > 0) {
      const firstTask = rootQ.data.data[0];
      selectTask(0, firstTask.id);
      setAutoExpanded(true);
    }
  }, [rootQ.data, autoExpanded, selectTask]);

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
    onMutate: async ({ taskId, data }) => {
      // Cancel ongoing refetches
      await qc.cancelQueries({ queryKey: ["tasks", orgId, projectId] });
      // Snapshot all task queries for rollback
      const previousData = qc.getQueriesData({ queryKey: ["tasks", orgId, projectId] });
      // Optimistically update the task in all matching queries
      qc.setQueriesData(
        { queryKey: ["tasks", orgId, projectId] },
        (old: { data: Task[]; total: number; limit: number; offset: number } | undefined) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((t: Task) => (t.id === taskId ? { ...t, ...data } : t)),
          };
        },
      );
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      // Rollback on failure
      if (context?.previousData) {
        for (const [key, data] of context.previousData) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
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

  /* ── Column resize handlers ── */
  const handleResizeStart = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[colIndex];
    let currentWidths = [...columnWidths];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(120, Math.min(400, startWidth + delta));
      currentWidths = [...currentWidths];
      currentWidths[colIndex] = newWidth;
      setColumnWidths(currentWidths);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Save directly to localStorage with current widths
      if (typeof window !== "undefined") {
        localStorage.setItem(`${LS_WIDTHS_KEY}-${projectId}`, JSON.stringify(currentWidths));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths, projectId]);

  /* ── Column rename handlers ── */
  const [editingColumn, setEditingColumn] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const startEditingName = useCallback((colIndex: number) => {
    if (!canEditColumns) return;
    setEditingColumn(colIndex);
    setEditingName(columnNames[colIndex]);
  }, [canEditColumns, columnNames]);

  const confirmEditName = useCallback((colIndex: number) => {
    if (editingName.trim()) {
      const updatedNames = [...columnNames];
      updatedNames[colIndex] = editingName.trim();
      setColumnNames(updatedNames);
      // Save directly to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(`${LS_NAMES_KEY}-${projectId}`, JSON.stringify(updatedNames));
      }
    }
    setEditingColumn(null);
    setEditingName("");
  }, [editingName, columnNames, projectId]);

  const cancelEditName = useCallback(() => {
    setEditingColumn(null);
    setEditingName("");
  }, []);

  /* ── Render ── */
  const columnMeta = [
    { depth: 0, label: columnNames[0], tasks: columnData[0], loading: rootQ.isLoading, show: true },
    { depth: 1, label: columnNames[1], tasks: columnData[1], loading: d1Q.isLoading, show: !!selected[0] },
    { depth: 2, label: columnNames[2], tasks: columnData[2], loading: d2Q.isLoading, show: !!selected[1] },
    { depth: 3, label: columnNames[3], tasks: columnData[3], loading: d3Q.isLoading, show: !!selected[2] },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-180px)] min-h-[500px] border border-base-200 rounded-lg overflow-hidden bg-base-100">
      {/* Columns area — scrollable, takes 75% of available width */}
      <div className="flex flex-row flex-1 min-w-0 overflow-x-auto">
        {columnMeta.map(
          (col) =>
            col.show && (
              <TaskColumn
                key={col.depth}
                depth={col.depth}
                label={col.label}
                tasks={col.tasks}
                loading={col.loading}
                selectedId={selected[col.depth]}
                onSelect={(id) => selectTask(col.depth, id)}
                onAdd={() => openCreate(col.depth)}
                members={members}
                width={columnWidths[col.depth]}
                canEdit={canEditColumns}
                isEditing={editingColumn === col.depth}
                editingName={editingName}
                onEditingNameChange={setEditingName}
                onStartEdit={() => startEditingName(col.depth)}
                onConfirmEdit={() => confirmEditName(col.depth)}
                onCancelEdit={cancelEditName}
                onResizeStart={(e) => handleResizeStart(col.depth, e)}
              />
            ),
        )}
      </div>

      {/* Detail panel — fixed 25% width, no gap */}
      <div className="w-full lg:w-1/4 lg:min-w-[280px] lg:max-w-[480px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-base-200 overflow-hidden flex flex-col max-h-[50vh] lg:max-h-none">
        {focusedTask ? (
          <TaskPreviewPanel
            task={focusedTask}
            orgId={orgId}
            orgSlug={orgSlug}
            projectId={projectId}
            members={effectiveMembers}
            projectMembers={members}
            currentUserId={currentUserId}
            userProjectRole={userProjectRole}
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
   Single column with Virtual Scrolling
   ═══════════════════════════════════════════════════════ */

function TaskColumn({
  depth: _depth,
  label,
  tasks,
  loading,
  selectedId,
  onSelect,
  onAdd,
  members,
  width,
  canEdit,
  isEditing,
  editingName,
  onEditingNameChange,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onResizeStart,
}: {
  depth: number;
  label: string;
  tasks: Task[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  members: ProjectMember[];
  width: number;
  canEdit: boolean;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (name: string) => void;
  onStartEdit: () => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52, // approximate row height
    overscan: 5,
  });

  return (
    <div 
      className="flex flex-col border-r border-base-200 shrink-0 relative"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-200 flex items-center justify-between bg-base-200/30">
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              className="input input-xs input-bordered flex-1 min-w-0 text-xs uppercase tracking-wide font-semibold"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirmEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <button className="btn btn-ghost btn-xs btn-square text-success" onClick={onConfirmEdit}>
              <Check className="w-3 h-3" />
            </button>
            <button className="btn btn-ghost btn-xs btn-square text-error" onClick={onCancelEdit}>
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <span 
            className={cn(
              "text-xs font-semibold uppercase tracking-wide text-base-content/60",
              canEdit && "cursor-pointer hover:text-base-content"
            )}
            onDoubleClick={onStartEdit}
            title={canEdit ? "Double-click to rename" : undefined}
          >
            {label}
          </span>
        )}
        <div className="flex items-center gap-1">
          {canEdit && !isEditing && (
            <button 
              className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 hover:opacity-100"
              onClick={onStartEdit}
              title="Rename column"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <span className="text-xs text-base-content/40">{tasks.length}</span>
          <button className="btn btn-ghost btn-xs btn-square" onClick={onAdd} title={`Add ${label.toLowerCase()}`}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List with Virtual Scrolling */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
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
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const task = tasks[virtualItem.index];
              const isSelected = task.id === selectedId;
              const assignee = members.find((m) => m.user_id === task.assignee_id);
              return (
                <button
                  key={task.id}
                  onClick={() => onSelect(task.id)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
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

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10 group"
        onMouseDown={onResizeStart}
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <GripVertical className="w-3 h-3 text-base-content/40" />
        </div>
      </div>
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
