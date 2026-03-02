"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Search,
  X,
  ExternalLink,
  Copy,
  Loader2,
  GripVertical,
} from "lucide-react";
import {
  formatDate,
  cn,
} from "@/lib/utils";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  ProjectMember,
} from "@/types/domain";

/* ═══════════════════════════════════════════════════════
   Sortable flat task list with inline editing
   ═══════════════════════════════════════════════════════ */

type SortField = "title" | "status" | "priority" | "due_date" | "created_at" | "updated_at";
type SortDir = "asc" | "desc";

interface TaskListViewProps {
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
}

export function TaskListView({ orgId, orgSlug, projectId, members }: TaskListViewProps) {
  const qc = useQueryClient();
  const router = useRouter();

  /* ── Sort, filter, pagination state ── */
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortDir>("desc");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [page, setPage] = useState(0);
  const limit = 25;

  /* ── Modal state ── */
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  /* ── Multi-select state ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* Build query params */
  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("offset", String(page * limit));
    p.set("sort_by", sortBy);
    p.set("sort_order", sortOrder);
    if (filterStatus) p.set("status", filterStatus);
    if (filterPriority) p.set("priority", filterPriority);
    if (searchText.trim()) p.set("search", searchText.trim());
    return p.toString();
  }, [sortBy, sortOrder, filterStatus, filterPriority, searchText, page]);

  /* ── Query ── */
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["task-list", orgId, projectId, sortBy, sortOrder, filterStatus, filterPriority, searchText, page],
    queryFn: () => api.tasks.list(orgId, projectId, buildParams()),
    enabled: !!orgId,
  });

  const tasks = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  /* ── Inline update mutation ── */
  const updateMutation = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<Task> }) =>
      api.tasks.update(orgId, projectId, id, changes),
    onMutate: async ({ id, changes }) => {
      await qc.cancelQueries({ queryKey: ["task-list", orgId, projectId] });
      const prev = qc.getQueriesData({ queryKey: ["task-list", orgId, projectId] });
      qc.setQueriesData(
        { queryKey: ["task-list", orgId, projectId] },
        (old: { data: Task[]; total: number; limit: number; offset: number } | undefined) => {
          if (!old?.data) return old;
          return { ...old, data: old.data.map((t: Task) => (t.id === id ? { ...t, ...changes } : t)) };
        },
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        for (const [key, data] of context.prev) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["task-list", orgId, projectId] });
    },
  });

  /* ── Delete mutation ── */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.tasks.delete(orgId, projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-list", orgId, projectId] });
      setDeleteTarget(null);
    },
  });

  /* ── Duplicate mutation ── */
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.tasks.duplicate(orgId, projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-list", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
    },
  });

  /* ── Bulk update mutation ── */
  const bulkUpdateMutation = useMutation({
    mutationFn: (data: { task_ids: string[]; changes: Partial<Task> }) =>
      api.tasks.bulkUpdate(orgId, projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-list", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
      setSelectedIds(new Set());
    },
  });

  /* ── Reorder mutation ── */
  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; position: number }[]) =>
      api.tasks.reorder(orgId, projectId, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-list", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
    },
  });

  /* ── DnD sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(tasks, oldIndex, newIndex);
      const items = reordered.map((t, i) => ({ id: t.id, position: i }));
      reorderMutation.mutate(items);
    },
    [tasks, reorderMutation],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const bulkAction = (changes: Partial<Task>) => {
    if (selectedIds.size === 0) return;
    bulkUpdateMutation.mutate({
      task_ids: Array.from(selectedIds),
      changes,
    });
  };

  /* ── Sort toggler ── */
  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3 h-3 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary" />
    );
  };

  /* ── Helpers ── */
  const memberName = (userId?: string | null) => {
    if (!userId) return "—";
    const m = members.find((m) => m.user_id === userId);
    return m?.display_name || m?.email || userId.slice(0, 8);
  };

  const memberAvatar = (userId?: string | null) => {
    if (!userId) return undefined;
    return members.find((m) => m.user_id === userId)?.avatar_url;
  };

  const clearFilters = () => {
    setFilterStatus("");
    setFilterPriority("");
    setSearchText("");
    setPage(0);
  };

  const hasFilters = filterStatus || filterPriority || searchText;

  return (
    <div className="space-y-3">
      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="divider divider-horizontal mx-0" />
          <select
            className="select select-bordered select-xs"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkAction({ status: e.target.value as TaskStatus });
              e.target.value = "";
            }}
          >
            <option value="" disabled>Set Status…</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
          <select
            className="select select-bordered select-xs"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkAction({ priority: e.target.value as TaskPriority });
              e.target.value = "";
            }}
          >
            <option value="" disabled>Set Priority…</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            className="select select-bordered select-xs"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkAction({ assignee_id: e.target.value === "__none__" ? null : e.target.value });
              e.target.value = "";
            }}
          >
            <option value="" disabled>Set Assignee…</option>
            <option value="__none__">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.email || m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3 h-3" /> Clear
          </button>
          {bulkUpdateMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>
      )}

      {/* ── Toolbar: Search + Filters + Create ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search tasks…"
            className="input input-bordered input-sm w-full pl-9"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(0); }}
          />
        </div>

        {/* Status filter */}
        <select
          className="select select-bordered select-sm"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
        >
          <option value="">All Status</option>
          <option value="todo">Todo</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="blocked">Blocked</option>
        </select>

        {/* Priority filter */}
        <select
          className="select select-bordered select-sm"
          value={filterPriority}
          onChange={(e) => { setFilterPriority(e.target.value); setPage(0); }}
        >
          <option value="">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
            <X className="w-3 h-3" /> Clear
          </button>
        )}

        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New Task
        </Button>
      </div>

      {/* ── Results info ── */}
      <div className="flex items-center justify-between text-xs text-base-content/50">
        <span>
          {total} task{total !== 1 ? "s" : ""}
          {hasFilters ? " (filtered)" : ""}
        </span>
        {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto border border-base-200 rounded-lg">
        <table className="table table-sm">
          <thead className="bg-base-200/50">
            <tr>
              <th className="w-6"></th>
              <th className="w-8">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={tasks.length > 0 && selectedIds.size === tasks.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th
                className="cursor-pointer select-none hover:bg-base-200 transition-colors"
                onClick={() => toggleSort("title")}
              >
                <span className="flex items-center gap-1">
                  Title <SortIcon field="title" />
                </span>
              </th>
              <th
                className="cursor-pointer select-none hover:bg-base-200 transition-colors w-28"
                onClick={() => toggleSort("status")}
              >
                <span className="flex items-center gap-1">
                  Status <SortIcon field="status" />
                </span>
              </th>
              <th
                className="cursor-pointer select-none hover:bg-base-200 transition-colors w-28"
                onClick={() => toggleSort("priority")}
              >
                <span className="flex items-center gap-1">
                  Priority <SortIcon field="priority" />
                </span>
              </th>
              <th className="w-32">Assignee</th>
              <th
                className="cursor-pointer select-none hover:bg-base-200 transition-colors w-28"
                onClick={() => toggleSort("due_date")}
              >
                <span className="flex items-center gap-1">
                  Due Date <SortIcon field="due_date" />
                </span>
              </th>
              <th
                className="cursor-pointer select-none hover:bg-base-200 transition-colors w-28"
                onClick={() => toggleSort("updated_at")}
              >
                <span className="flex items-center gap-1">
                  Updated <SortIcon field="updated_at" />
                </span>
              </th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="text-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td>
              </tr>
            )}
            {!isLoading && tasks.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-base-content/50">
                  {hasFilters ? "No tasks match your filters" : "No tasks yet — create your first!"}
                </td>
              </tr>
            )}
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                orgSlug={orgSlug}
                projectId={projectId}
                members={members}
                memberName={memberName}
                memberAvatar={memberAvatar}
                isSelected={selectedIds.has(task.id)}
                onToggleSelect={() => toggleSelect(task.id)}
                onUpdate={(changes) => updateMutation.mutate({ id: task.id, changes })}
                onDelete={() => setDeleteTarget(task)}
                onDuplicate={() => duplicateMutation.mutate(task.id)}
                onNavigate={() =>
                  router.push(`/${orgSlug}/projects/${projectId}/tasks/${task.id}`)
                }
              />
            ))}
          </tbody>
          </SortableContext>
          </DndContext>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="btn btn-sm btn-ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-base-content/60">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-sm btn-ghost"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* ── Create Task Modal ── */}
      {showCreate && (
        <CreateTaskModal
          orgId={orgId}
          projectId={projectId}
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["task-list", orgId, projectId] });
          }}
        />
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Individual Task Row with inline editing
   ═══════════════════════════════════════════════════════ */

interface TaskRowProps {
  task: Task;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
  memberName: (id?: string | null) => string;
  memberAvatar: (id?: string | null) => string | undefined;
  isSelected: boolean;
  onToggleSelect: () => void;
  onUpdate: (changes: Partial<Task>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onNavigate: () => void;
}

function TaskRow({
  task,
  members,
  memberName: _memberName,
  memberAvatar: _memberAvatar,
  isSelected,
  onToggleSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onNavigate,
}: TaskRowProps) {
  const isOverdue =
    task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={cn("hover group", isSelected && "bg-primary/5", isDragging && "bg-base-200")}>
      {/* Drag handle */}
      <td className="w-6 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4 text-base-content/30 group-hover:text-base-content/60" />
      </td>
      {/* Checkbox */}
      <td className="w-8">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={isSelected}
          onChange={onToggleSelect}
        />
      </td>
      {/* Title */}
      <td>
        <div className="flex items-center gap-2">
          {task.depth > 0 && (
            <span className="text-xs text-base-content/30" style={{ marginLeft: task.depth * 12 }}>
              <ChevronRight className="w-3 h-3 inline" />
            </span>
          )}
          <button
            className="text-sm font-medium hover:text-primary transition-colors text-left truncate max-w-xs"
            onClick={onNavigate}
            title={task.title}
          >
            {task.title}
          </button>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onNavigate}
          >
            <ExternalLink className="w-3 h-3 text-base-content/40" />
          </button>
        </div>
      </td>

      {/* Status — inline dropdown */}
      <td>
        <select
          className={cn(
            "select select-ghost select-xs font-medium",
            task.status === "done" && "text-success",
            task.status === "in_progress" && "text-info",
            task.status === "blocked" && "text-error",
          )}
          value={task.status}
          onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
        >
          <option value="todo">Todo</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="blocked">Blocked</option>
        </select>
      </td>

      {/* Priority — inline dropdown */}
      <td>
        <select
          className={cn(
            "select select-ghost select-xs font-medium",
            task.priority === "critical" && "text-error",
            task.priority === "high" && "text-warning",
            task.priority === "medium" && "text-info",
          )}
          value={task.priority}
          onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
        >
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </td>

      {/* Assignee — inline dropdown */}
      <td>
        <select
          className="select select-ghost select-xs w-full max-w-28"
          value={task.assignee_id || ""}
          onChange={(e) =>
            onUpdate({ assignee_id: e.target.value || null })
          }
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name || m.email || m.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
      </td>

      {/* Due date — inline input */}
      <td>
        <input
          type="date"
          className={cn(
            "input input-ghost input-xs w-full",
            isOverdue && "text-error font-medium",
          )}
          value={task.due_date ? task.due_date.slice(0, 10) : ""}
          onChange={(e) =>
            onUpdate({
              due_date: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
        />
      </td>

      {/* Updated at */}
      <td className="text-xs text-base-content/50">
        {formatDate(task.updated_at)}
      </td>

      {/* Actions */}
      <td>
        <div className="flex items-center gap-0.5">
          <button
            className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onDuplicate}
            title="Duplicate task with subtree"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            className="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onDelete}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
   Create Task Modal
   ═══════════════════════════════════════════════════════ */

interface CreateTaskForm {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  due_date: string;
}

function CreateTaskModal({
  orgId,
  projectId,
  members,
  onClose,
  onCreated,
}: {
  orgId: string;
  projectId: string;
  members: ProjectMember[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateTaskForm>({
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      assignee_id: "",
      due_date: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskForm) => {
      const payload: Partial<Task> = {
        title: data.title,
        description: data.description || undefined,
        status: data.status,
        priority: data.priority,
        assignee_id: data.assignee_id || undefined,
        due_date: data.due_date ? new Date(data.due_date).toISOString() : undefined,
      };
      return api.tasks.create(orgId, projectId, payload);
    },
    onSuccess: () => onCreated(),
  });

  return (
    <Modal open onClose={onClose} title="Create Task">
      <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-3">
        <Input
          label="Title"
          {...register("title", { required: "Title is required" })}
          error={errors.title?.message}
          autoFocus
        />
        <Input label="Description" {...register("description")} />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Status"
            {...register("status")}
            options={[
              { value: "todo", label: "Todo" },
              { value: "in_progress", label: "In Progress" },
              { value: "done", label: "Done" },
              { value: "blocked", label: "Blocked" },
            ]}
          />
          <Select
            label="Priority"
            {...register("priority")}
            options={[
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Assignee"
            {...register("assignee_id")}
            options={[
              { value: "", label: "Unassigned" },
              ...members.map((m) => ({
                value: m.user_id,
                label: m.display_name || m.email || m.user_id.slice(0, 8),
              })),
            ]}
          />
          <Input label="Due Date" type="date" {...register("due_date")} />
        </div>
        {createMutation.error && (
          <p className="text-error text-sm">{(createMutation.error as Error).message}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" size="sm" loading={createMutation.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
