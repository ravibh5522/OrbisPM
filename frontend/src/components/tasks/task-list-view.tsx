"use client";

import { ChangeRequestModal } from "@/components/tasks/change-request-modal";
import {
  ChangeRequestToast,
  PendingReviewBadge,
} from "@/components/tasks/change-requests";
import type { GlobalFilterState } from "@/components/tasks/global-filter-dropdown";
import { isGlobalFilterActive } from "@/components/tasks/global-filter-dropdown";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/shared";
import { useProjectPolicies } from "@/hooks/use-policies";
import { useReviewableFields } from "@/hooks/use-reviewable-fields";
import { PRIORITY_TEXT, STATUS_TEXT } from "@/lib/task-colors";
import { cn, formatDate } from "@/lib/utils";
import { useProjectTaskStore } from "@/stores/project-task-store";
import type {
  ProjectMember,
  Task,
  TaskPriority,
  TaskStatus,
  TaskUpdateResult,
} from "@/types/domain";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Copy,
  ExternalLink,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

/* ═══════════════════════════════════════════════════════
   Sortable flat task list with inline editing
   ═══════════════════════════════════════════════════════ */

type SortField =
  | "title"
  | "status"
  | "priority"
  | "due_date"
  | "created_at"
  | "updated_at";
type SortDir = "asc" | "desc";

interface TaskListViewProps {
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
  globalFilter?: GlobalFilterState;
}

export function TaskListView({
  orgId,
  orgSlug,
  projectId,
  members,
  globalFilter,
}: TaskListViewProps) {
  const send = useProjectTaskStore((s) => s.send);
  const router = useRouter();
  const policies = useProjectPolicies(projectId);
  const { hasReviewPipeline, isReviewable } = useReviewableFields(projectId);
  const canDirectUpdate = policies.canDirectUpdate;

  /* ── Sort, pagination state ── */
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const limit = 25;

  /* ── Modal state ── */
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  /* ── Multi-select state ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* ── Local task data ── */
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [pendingReviewResult, setPendingReviewResult] =
    useState<TaskUpdateResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Change request modal state
  const [crModal, setCrModal] = useState<{
    taskId: string;
    changes: Partial<Task>;
  } | null>(null);

  /* Fetch via WS */
  const fetchList = useCallback(async () => {
    if (!send) return;
    setIsFetching(true);
    try {
      const res = await send("task:list", {
        limit,
        offset: page * limit,
        sort_by: sortBy,
        sort_order: sortOrder,
        search: globalFilter?.search || undefined,
        statuses: globalFilter?.statuses?.length
          ? globalFilter.statuses
          : undefined,
        priorities: globalFilter?.priorities?.length
          ? globalFilter.priorities
          : undefined,
        assignee_ids: globalFilter?.assigneeIds?.length
          ? globalFilter.assigneeIds.filter(Boolean)
          : undefined,
        labels: globalFilter?.labels?.length ? globalFilter.labels : undefined,
        due_date_from: globalFilter?.dueDateFrom || undefined,
        due_date_to: globalFilter?.dueDateTo || undefined,
      });
      setTasks(res?.data || []);
      setTotal(res?.total || 0);
    } catch {
      // WS list failed
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [send, page, sortBy, sortOrder, globalFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Reset to page 0 when filter changes
  useEffect(() => {
    setPage(0);
  }, [globalFilter]);

  const totalPages = Math.ceil(total / limit);

  /* ── Inline update ── */
  const handleUpdate = useCallback(
    async (id: string, changes: Partial<Task>) => {
      if (!send) return;
      const currentTask = tasks.find((t) => t.id === id);
      // Optimistic
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...changes } : t)),
      );
      try {
        const result = await send("task:update", {
          task_id: id,
          base_version: currentTask?.version ?? 0,
          ...changes,
        });
        // Handle pending review — rollback optimistic update
        if (result?.pending_review) {
          fetchList();
          setPendingReviewResult(result);
        }
      } catch (e) {
        if (e instanceof Error && e.message) {
          setUpdateError(e.message);
        }
        fetchList(); // rollback by re-fetching
      }
    },
    [send, fetchList, tasks],
  );

  /** Intercepts updates — users without direct_update always go through CR modal */
  const handleUpdateWithReviewCheck = useCallback(
    (id: string, changes: Partial<Task>) => {
      if (!canDirectUpdate && Object.keys(changes).length > 0) {
        setCrModal({ taskId: id, changes });
        return;
      }
      handleUpdate(id, changes);
    },
    [canDirectUpdate, handleUpdate],
  );

  /* ── Delete ── */
  const handleDelete = useCallback(
    async (id: string) => {
      if (!send) return;
      try {
        await send("task:delete", { task_id: id });
        setDeleteTarget(null);
        fetchList();
      } catch {
        // WS delete failed
      }
    },
    [send, fetchList],
  );

  /* ── Duplicate ── */
  const handleDuplicate = useCallback(
    async (id: string) => {
      if (!send) return;
      try {
        await send("task:duplicate", { task_id: id });
        fetchList();
      } catch {
        // WS duplicate failed
      }
    },
    [send, fetchList],
  );

  /* ── Bulk update ── */
  const bulkAction = useCallback(
    async (changes: Partial<Task>) => {
      if (!send || selectedIds.size === 0) return;
      setBulkPending(true);
      try {
        await send("task:bulk-update", {
          task_ids: Array.from(selectedIds),
          changes,
        });
        setSelectedIds(new Set());
        fetchList();
      } catch {
        // WS bulk-update failed
      } finally {
        setBulkPending(false);
      }
    },
    [send, selectedIds, fetchList],
  );

  /* ── Reorder ── */
  const handleReorder = useCallback(
    async (items: { id: string; position: number }[]) => {
      if (!send || !policies.canEditTask) return;
      try {
        await send("task:reorder", { items });
        fetchList();
      } catch {
        // WS reorder failed
      }
    },
    [send, fetchList, policies.canEditTask],
  );

  /* ── DnD sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(tasks, oldIndex, newIndex);
      setTasks(reordered); // optimistic
      const items = reordered.map((t, i) => ({ id: t.id, position: i }));
      handleReorder(items);
    },
    [tasks, handleReorder],
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

  const hasFilters = !!(globalFilter && isGlobalFilterActive(globalFilter));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Floating overlays */}
      <ChangeRequestToast
        result={pendingReviewResult}
        onDismiss={() => setPendingReviewResult(null)}
      />

      {/* Update error toast */}
      {updateError && (
        <Alert
          variant="error"
          className="shadow-lg text-sm"
          onDismiss={() => setUpdateError(null)}
        >
          {updateError}
        </Alert>
      )}

      {/* Change request modal for reviewable field edits */}
      {crModal &&
        (() => {
          const crTask = tasks.find((t) => t.id === crModal.taskId);
          return crTask ? (
            <ChangeRequestModal
              open
              onClose={() => setCrModal(null)}
              task={crTask}
              changes={crModal.changes}
              orgId={orgId}
              projectId={projectId}
              onCreated={() => setCrModal(null)}
            />
          ) : null;
        })()}

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && policies.canEditTask && (
        <div className="flex flex-shrink-0 items-center gap-2 px-3 py-1.5 bg-primary/10 border-b border-primary/20">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="divider divider-horizontal mx-0" />
          {/* inline toolbar select */}
          <Select
            className="select-xs"
            defaultValue=""
            placeholder="Set Status…"
            onChange={(e) => {
              if (e.target.value)
                bulkAction({ status: e.target.value as TaskStatus });
              e.target.value = "";
            }}
            options={[
              { value: "todo", label: "Todo" },
              { value: "in_progress", label: "In Progress" },
              { value: "done", label: "Done" },
              { value: "blocked", label: "Blocked" },
            ]}
          />
          {/* inline toolbar select */}
          <Select
            className="select-xs"
            defaultValue=""
            placeholder="Set Priority…"
            onChange={(e) => {
              if (e.target.value)
                bulkAction({ priority: e.target.value as TaskPriority });
              e.target.value = "";
            }}
            options={[
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
          {/* inline toolbar select */}
          <Select
            className="select-xs"
            defaultValue=""
            placeholder="Set Assignee…"
            onChange={(e) => {
              if (e.target.value) {
                const ids =
                  e.target.value === "__none__" ? [] : [e.target.value];
                bulkAction({
                  assignee_ids: ids,
                  assignee_id: ids[0] || "",
                } as Partial<Task>);
              }
              e.target.value = "";
            }}
            options={[
              { value: "__none__", label: "Unassigned" },
              ...members.map((m) => ({
                value: m.user_id,
                label: m.display_name || m.email || m.user_id.slice(0, 8),
              })),
            ]}
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="w-3 h-3" /> Clear
          </Button>
          {bulkPending && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>
      )}

      {/* ── Toolbar: results + create ── */}
      <div className="flex flex-shrink-0 items-center justify-between px-3 py-2 border-b border-base-200/55">
        <span className="text-sm text-base-content/50 flex items-center gap-1.5">
          {total} task{total !== 1 ? "s" : ""}
          {hasFilters && " (filtered)"}
          {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
        </span>
        {policies.canCreateTask && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Task
          </Button>
        )}
      </div>

      {/* ── Table — scrollable ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="table table-sm">
            <thead className="table-header-surface [&_th]:backdrop-blur-sm [&_th]:border-b [&_th]:font-semibold [&_th:first-child]:rounded-l-xl [&_th:last-child]:rounded-r-xl">
              <tr>
                <th className="w-6"></th>
                <th className="w-8">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={
                      tasks.length > 0 && selectedIds.size === tasks.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th
                  className="cursor-pointer select-none hover:bg-base-200/35 transition-colors"
                  onClick={() => toggleSort("title")}
                >
                  <span className="flex items-center gap-1">
                    Title <SortIcon field="title" />
                  </span>
                </th>
                <th
                  className="cursor-pointer select-none hover:bg-base-200/35 transition-colors w-28"
                  onClick={() => toggleSort("status")}
                >
                  <span className="flex items-center gap-1">
                    Status <SortIcon field="status" />
                  </span>
                </th>
                <th
                  className="cursor-pointer select-none hover:bg-base-200/35 transition-colors w-28"
                  onClick={() => toggleSort("priority")}
                >
                  <span className="flex items-center gap-1">
                    Priority <SortIcon field="priority" />
                  </span>
                </th>
                <th className="w-32">Assignee</th>
                <th
                  className="cursor-pointer select-none hover:bg-base-200/35 transition-colors w-28"
                  onClick={() => toggleSort("due_date")}
                >
                  <span className="flex items-center gap-1">
                    Due Date <SortIcon field="due_date" />
                  </span>
                </th>
                <th
                  className="cursor-pointer select-none hover:bg-base-200/35 transition-colors w-28"
                  onClick={() => toggleSort("updated_at")}
                >
                  <span className="flex items-center gap-1">
                    Updated <SortIcon field="updated_at" />
                  </span>
                </th>
                <th className="w-20">Actions</th>
              </tr>
            </thead>
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
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
                    <td
                      colSpan={9}
                      className="text-center py-8 text-base-content/50"
                    >
                      {hasFilters
                        ? "No tasks match your filters"
                        : "No tasks yet — create your first!"}
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
                    onUpdate={(changes) =>
                      handleUpdateWithReviewCheck(task.id, changes)
                    }
                    onDelete={() => setDeleteTarget(task)}
                    onDuplicate={() => handleDuplicate(task.id)}
                    onNavigate={() =>
                      router.push(
                        `/${orgSlug}/projects/${projectId}?task=${task.id}`,
                      )
                    }
                    canEdit={policies.canEditTask}
                    canDelete={policies.canDeleteTask}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </div>
      </DndContext>

      {/* ── Pagination ── */}
      <div className="flex-shrink-0 px-3">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={limit}
          onPageChange={setPage}
        />
      </div>

      {/* ── Create Task Modal ── */}
      {showCreate && (
        <CreateTaskModal
          orgId={orgId}
          projectId={projectId}
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchList();
          }}
        />
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        loading={false}
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
  canEdit?: boolean;
  canDelete?: boolean;
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
  canEdit = true,
  canDelete = true,
}: TaskRowProps) {
  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date() &&
    task.status !== "done";

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
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "hover group",
        isSelected && "bg-primary/5",
        isDragging && "bg-base-200",
      )}
    >
      {/* Drag handle */}
      <td
        className="w-6 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
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
            <span
              className="text-xs text-base-content/30"
              style={{ marginLeft: task.depth * 12 }}
            >
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
          {task.review_status === "pending" && <PendingReviewBadge count={1} />}
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
        <Select
          className={cn(
            "select-ghost select-xs font-medium",
            STATUS_TEXT[task.status],
          )}
          value={task.status}
          onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
          disabled={!canEdit}
          options={[
            { value: "todo", label: "Todo" },
            { value: "in_progress", label: "In Progress" },
            { value: "done", label: "Done" },
            { value: "blocked", label: "Blocked" },
          ]}
        />
      </td>

      {/* Priority — inline dropdown */}
      <td>
        <Select
          className={cn(
            "select-ghost select-xs font-medium",
            PRIORITY_TEXT[task.priority],
          )}
          value={task.priority}
          onChange={(e) =>
            onUpdate({ priority: e.target.value as TaskPriority })
          }
          disabled={!canEdit}
          options={[
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
      </td>

      {/* Assignee — multi-select dropdown */}
      <td>
        {canEdit ? (
          <MultiAssigneeCell
            assigneeIds={task.assignee_ids || []}
            members={members}
            onChange={(next) =>
              onUpdate({
                assignee_ids: next,
                assignee_id: next.length > 0 ? next[0] : "",
              } as Partial<Task>)
            }
          />
        ) : (
          <span className="text-sm">{_memberName(task.assignee_id)}</span>
        )}
      </td>

      {/* Due date — inline input */}
      <td>
        <Input
          type="date"
          className={cn(
            "input-ghost input-xs w-full",
            isOverdue && "text-error font-medium",
          )}
          value={task.due_date ? task.due_date.slice(0, 10) : ""}
          onChange={(e) =>
            onUpdate({
              due_date: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            })
          }
          disabled={!canEdit}
        />
      </td>

      {/* Updated at */}
      <td className="text-xs text-base-content/50">
        {formatDate(task.updated_at)}
      </td>

      {/* Actions */}
      <td>
        <div className="dropdown dropdown-end">
          <label
            tabIndex={0}
            className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal className="w-4 h-4" />
          </label>
          <ul
            tabIndex={0}
            className="dropdown-content z-[999] menu p-1 shadow-lg bg-base-100/95 backdrop-blur-[20px] rounded-xl w-40 border border-base-200/55"
          >
            <li>
              <a onClick={onNavigate} className="text-sm">
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </a>
            </li>
            {canEdit && (
              <li>
                <a onClick={onDuplicate} className="text-sm">
                  <Copy className="w-3.5 h-3.5" /> Clone
                </a>
              </li>
            )}
            {canDelete && (
              <li>
                <a onClick={onDelete} className="text-sm text-error">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </a>
              </li>
            )}
          </ul>
        </div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
   Multi-Assignee Cell (inline dropdown with checkboxes)
   ═══════════════════════════════════════════════════════ */

function MultiAssigneeCell({
  assigneeIds,
  members,
  onChange,
}: {
  assigneeIds: string[];
  members: ProjectMember[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (userId: string) => {
    const next = assigneeIds.includes(userId)
      ? assigneeIds.filter((id) => id !== userId)
      : [...assigneeIds, userId];
    onChange(next);
  };

  const assignedMembers = members.filter((m) =>
    assigneeIds.includes(m.user_id),
  );
  const label =
    assignedMembers.length === 0
      ? "Unassigned"
      : assignedMembers.length === 1
        ? assignedMembers[0].display_name ||
          assignedMembers[0].email ||
          assignedMembers[0].user_id.slice(0, 8)
        : `${assignedMembers.length} assigned`;

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="xs"
        className="w-full max-w-32 justify-start truncate text-left font-normal"
        onClick={() => setOpen((p) => !p)}
      >
        {label}
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-base-100/95 backdrop-blur-[20px] border border-base-200/55 rounded-xl shadow-xl py-1 min-w-[180px] max-h-48 overflow-y-auto z-50">
          <button
            className={cn(
              "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-base-200/35 rounded-lg transition-colors",
              assigneeIds.length === 0 && "font-medium",
            )}
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            Clear All
          </button>
          {members.map((m) => {
            const checked = assigneeIds.includes(m.user_id);
            return (
              <button
                key={m.user_id}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-base-200/35 rounded-lg transition-colors"
                onClick={() => toggle(m.user_id)}
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={checked}
                  readOnly
                />
                <span className="truncate">
                  {m.display_name || m.email || m.user_id.slice(0, 8)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTaskForm>({
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      assignee_id: "",
      due_date: "",
    },
  });

  const send = useProjectTaskStore((s) => s.send);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const onSubmit = async (data: CreateTaskForm) => {
    if (!send) return;
    setCreating(true);
    setCreateError(null);
    try {
      await send("task:create", {
        title: data.title,
        description: data.description || undefined,
        status: data.status,
        priority: data.priority,
        assignee_id: data.assignee_id || undefined,
        assignee_ids: data.assignee_id ? [data.assignee_id] : [],
        due_date: data.due_date
          ? new Date(data.due_date).toISOString()
          : undefined,
      });
      onCreated();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Create Task">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
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
        {createError && <p className="text-error text-sm">{createError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={creating}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
