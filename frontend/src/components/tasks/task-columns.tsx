"use client";

import { ChangeRequestModal } from "@/components/tasks/change-request-modal";
import {
  ChangeRequestToast,
  PendingReviewBadge,
} from "@/components/tasks/change-requests";
import {
  isGlobalFilterActive,
  type GlobalFilterState,
} from "@/components/tasks/global-filter-dropdown";
import { TaskContextMenu } from "@/components/tasks/task-context-menu";
import { TaskPreviewPanel } from "@/components/tasks/task-preview-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { AvatarStack, ConfirmDialog } from "@/components/ui/shared";
import { useProjectPolicies } from "@/hooks/use-policies";
import { useReviewableFields } from "@/hooks/use-reviewable-fields";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectTaskStore } from "@/stores/project-task-store";
import type {
  DeadlineConflict,
  OrgMember,
  ProjectMember,
  Task,
  TaskPriority,
  TaskStatus,
  TaskUpdateResult,
} from "@/types/domain";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  ChevronRight,
  Filter,
  GripVertical,
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  Tags,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";

const MAX_DEPTH = 3;
const DEFAULT_COL_WIDTHS = [220, 220, 200, 200];
const DEFAULT_COL_NAMES = ["TASKS", "SUBTASKS", "LEVEL 3", "LEVEL 4"];
const LS_WIDTHS_KEY = "task-column-widths";
const LS_NAMES_KEY = "task-column-names";

/* ─── Column Filter Types ─── */

interface ColumnFilterState {
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  assigneeIds: string[];
  labels: string[];
  dueDateFrom: string;
  dueDateTo: string;
  search: string;
}

const EMPTY_FILTER: ColumnFilterState = {
  statuses: [],
  priorities: [],
  assigneeIds: [],
  labels: [],
  dueDateFrom: "",
  dueDateTo: "",
  search: "",
};

function isFilterActive(f: ColumnFilterState | undefined): boolean {
  if (!f) return false;
  return (
    f.statuses.length > 0 ||
    f.priorities.length > 0 ||
    f.assigneeIds.length > 0 ||
    f.labels.length > 0 ||
    f.dueDateFrom !== "" ||
    f.dueDateTo !== "" ||
    f.search !== ""
  );
}

/**
 * Returns true if task t passes the given column filter AND global filter directly.
 * No ancestor/descendant logic — this is the per-task predicate.
 */
function taskPassesCriteria(
  t: Task,
  f: ColumnFilterState | undefined,
  gf?: GlobalFilterState,
): boolean {
  // Global filter
  if (gf && isGlobalFilterActive(gf)) {
    if (gf.assigneeIds.length > 0) {
      const ids = t.assignee_ids?.length
        ? t.assignee_ids
        : t.assignee_id
          ? [t.assignee_id]
          : [];
      const matchesUnassigned = gf.assigneeIds.includes("") && ids.length === 0;
      const matchesAny = ids.some((id) => gf.assigneeIds.includes(id));
      if (!matchesUnassigned && !matchesAny) return false;
    }
    if (gf.statuses.length > 0 && !gf.statuses.includes(t.status)) return false;
    if (gf.priorities.length > 0 && !gf.priorities.includes(t.priority))
      return false;
    if (gf.labels.length > 0) {
      if (!t.labels || !t.labels.some((l) => gf.labels.includes(l)))
        return false;
    }
    if (gf.dueDateFrom && (!t.due_date || t.due_date < gf.dueDateFrom))
      return false;
    if (gf.dueDateTo && (!t.due_date || t.due_date > gf.dueDateTo))
      return false;
    if (gf.search) {
      const q = gf.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q)) return false;
    }
  }
  // Column-level filter
  if (f && isFilterActive(f)) {
    if (f.statuses.length > 0 && !f.statuses.includes(t.status)) return false;
    if (f.priorities.length > 0 && !f.priorities.includes(t.priority))
      return false;
    if (f.assigneeIds.length > 0) {
      const ids = t.assignee_ids?.length
        ? t.assignee_ids
        : t.assignee_id
          ? [t.assignee_id]
          : [];
      if (!ids.some((id) => f.assigneeIds.includes(id))) return false;
    }
    if (f.labels.length > 0) {
      if (!t.labels || !t.labels.some((l) => f.labels.includes(l)))
        return false;
    }
    if (f.dueDateFrom && (!t.due_date || t.due_date < f.dueDateFrom))
      return false;
    if (f.dueDateTo && (!t.due_date || t.due_date > f.dueDateTo)) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q)) return false;
    }
  }
  return true;
}

/**
 * Filters multiple columns with ancestor-inclusion:
 * a task is kept if it directly matches the filter OR it is an ancestor of
 * any task in any column that directly matches.
 * This ensures parent tasks remain visible when only their descendants match,
 * letting users navigate down to the matching items.
 */
function applyFilterWithAncestors(
  columns: Task[][],
  columnFilters: Map<number, ColumnFilterState>,
  globalFilter?: GlobalFilterState,
  allProjectTasks?: Task[],
): Task[][] {
  const anyActive =
    columnFilters.size > 0 ||
    (!!globalFilter && isGlobalFilterActive(globalFilter));
  if (!anyActive) return columns;

  // Build id → task lookup from ALL available tasks (columns + full project list)
  const taskById = new Map<string, Task>();
  for (const col of columns) {
    for (const t of col) taskById.set(t.id, t);
  }
  // Merge in full project tasks for complete ancestry resolution
  if (allProjectTasks) {
    for (const t of allProjectTasks) {
      if (!taskById.has(t.id)) taskById.set(t.id, t);
    }
  }

  // Find all tasks that directly match the global filter across ALL known tasks
  const directMatchIds = new Set<string>();
  // Check tasks visible in columns (with column-specific filter)
  for (let depth = 0; depth < columns.length; depth++) {
    const colFilter = columnFilters.get(depth);
    for (const task of columns[depth]) {
      if (taskPassesCriteria(task, colFilter, globalFilter)) {
        directMatchIds.add(task.id);
      }
    }
  }
  // Also check ALL project tasks (global filter only, no column filter)
  if (allProjectTasks && globalFilter && isGlobalFilterActive(globalFilter)) {
    for (const task of allProjectTasks) {
      if (taskPassesCriteria(task, undefined, globalFilter)) {
        directMatchIds.add(task.id);
      }
    }
  }

  // Walk up each matching task's parent chain; mark every ancestor for inclusion
  const keepIds = new Set<string>(directMatchIds);
  for (const id of directMatchIds) {
    let cur = taskById.get(id);
    while (cur?.parent_task_id) {
      keepIds.add(cur.parent_task_id);
      const parent = taskById.get(cur.parent_task_id);
      if (!parent) break;
      cur = parent;
    }
  }

  // Filter each column: keep direct matches + ancestors
  return columns.map((tasks) => tasks.filter((t) => keepIds.has(t.id)));
}

/** Legacy single-column wrapper (kept for any external callers). */
function applyFilter(
  tasks: Task[],
  f: ColumnFilterState | undefined,
  gf?: GlobalFilterState,
): Task[] {
  if (!isFilterActive(f) && (!gf || !isGlobalFilterActive(gf))) return tasks;
  return tasks.filter((t) => taskPassesCriteria(t, f, gf));
}

/* ═══════════════════════════════════════════════════════
   Main 5-column component
   ═══════════════════════════════════════════════════════ */

interface TaskColumnsProps {
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
  orgMembers?: OrgMember[];
  /** Optional task ID to auto-focus on mount */
  focusTaskId?: string;
  /** If provided, toolbar buttons are portaled into this element instead of rendered inline */
  toolbarPortal?: HTMLElement | null;
  /** Global filter state from the toolbar */
  globalFilter?: GlobalFilterState;
}

export function TaskColumns({
  orgId,
  orgSlug,
  projectId,
  members,
  orgMembers,
  focusTaskId,
  toolbarPortal,
  globalFilter,
}: TaskColumnsProps) {
  const send = useProjectTaskStore((s) => s.send);
  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id || "";
  const [selected, setSelected] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [createDepth, setCreateDepth] = useState<number | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [bulkCreateDepth, setBulkCreateDepth] = useState<number | null>(null);
  const [bulkCreateParentId, setBulkCreateParentId] = useState<string | null>(
    null,
  );
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [deepLinkProcessed, setDeepLinkProcessed] = useState(false);
  const [prevFocusTaskId, setPrevFocusTaskId] = useState(focusTaskId);

  // Multi-select state
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    task: Task;
    depth: number;
  } | null>(null);

  // Drag-and-drop reparenting state
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  // Split view state
  const [splitView, setSplitView] = useState(false);
  const [splitSelected, setSplitSelected] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [splitColumnData, setSplitColumnData] = useState<Task[][]>([
    [],
    [],
    [],
    [],
  ]);
  const [splitColumnLoading, setSplitColumnLoading] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);

  // Track which pane was last focused (for preview panel)
  const [lastFocusedPane, setLastFocusedPane] = useState<"top" | "bottom">(
    "top",
  );

  // Column data state (one per depth)
  const [columnData, setColumnData] = useState<Task[][]>([[], [], [], []]);
  const [columnLoading, setColumnLoading] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);

  // Track previous selection to detect which depth actually changed
  const prevSelectedRef = useRef<(string | null)[]>([null, null, null, null]);

  // Mutation state
  const [updatePending, setUpdatePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  // Pending review state for change requests
  const [pendingReviewResult, setPendingReviewResult] =
    useState<TaskUpdateResult | null>(null);

  // Update error state (e.g. blocked non-reviewable fields)
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Change request modal state (for reviewable field edits)
  const [crModal, setCrModal] = useState<{
    taskId: string;
    changes: Partial<Task>;
  } | null>(null);

  // Deadline conflict state for updates
  const [updateDeadlineConflicts, setUpdateDeadlineConflicts] = useState<
    DeadlineConflict[]
  >([]);
  const pendingUpdateRef = useRef<{
    taskId: string;
    data: Partial<Task>;
    baseVersion: number;
  } | null>(null);

  // Reset deep-link state when focusTaskId changes
  if (focusTaskId !== prevFocusTaskId) {
    setPrevFocusTaskId(focusTaskId);
    setDeepLinkProcessed(false);
  }

  // Fetch column tasks via WS (soft: don't show loading if we already have cached data)
  const fetchColumn = useCallback(
    async (depth: number, parentId: string | null, soft = false) => {
      if (!send) return;
      const param = parentId ?? "root";
      // Check store for cached data first — show it instantly (no loading state)
      const cached = useProjectTaskStore.getState().tasks.get(param);
      if (cached && cached.length > 0) {
        setColumnData((prev) => {
          const n = [...prev];
          n[depth] = cached;
          return n;
        });
      }
      // Only show loading spinner if we have NO cached data and soft mode is off
      if (!soft && (!cached || cached.length === 0)) {
        setColumnLoading((prev) => {
          const n = [...prev];
          n[depth] = true;
          return n;
        });
      }
      try {
        const res = await send("task:list", { parent_id: param });
        const data = res?.data || [];
        setColumnData((prev) => {
          const n = [...prev];
          n[depth] = data;
          return n;
        });
        useProjectTaskStore
          .getState()
          .setTasks(param, data, res?.total ?? data.length);
      } catch {
        // Only clear if we had no cached fallback
        if (!cached || cached.length === 0) {
          setColumnData((prev) => {
            const n = [...prev];
            n[depth] = [];
            return n;
          });
        }
      } finally {
        setColumnLoading((prev) => {
          const n = [...prev];
          n[depth] = false;
          return n;
        });
      }
    },
    [send],
  );

  // Refetch a single column silently (no loading state)
  const softRefetch = useCallback(
    (depth: number, parentId: string | null) => {
      fetchColumn(depth, parentId, true);
    },
    [fetchColumn],
  );

  // Fetch for split view pane
  const fetchSplitColumn = useCallback(
    async (depth: number, parentId: string | null) => {
      if (!send) return;
      const param = parentId ?? "root";
      const cached = useProjectTaskStore.getState().tasks.get(param);
      if (cached && cached.length > 0) {
        setSplitColumnData((prev) => {
          const n = [...prev];
          n[depth] = cached;
          return n;
        });
      }
      if (!cached || cached.length === 0) {
        setSplitColumnLoading((prev) => {
          const n = [...prev];
          n[depth] = true;
          return n;
        });
      }
      try {
        const res = await send("task:list", { parent_id: param });
        const data = res?.data || [];
        setSplitColumnData((prev) => {
          const n = [...prev];
          n[depth] = data;
          return n;
        });
        useProjectTaskStore
          .getState()
          .setTasks(param, data, res?.total ?? data.length);
      } catch {
        if (!cached || cached.length === 0) {
          setSplitColumnData((prev) => {
            const n = [...prev];
            n[depth] = [];
            return n;
          });
        }
      } finally {
        setSplitColumnLoading((prev) => {
          const n = [...prev];
          n[depth] = false;
          return n;
        });
      }
    },
    [send],
  );

  // Load root column on connect
  useEffect(() => {
    if (send) fetchColumn(0, null);
  }, [send, fetchColumn]);

  // When global filter is active, fetch ALL project tasks into a separate ref
  // so applyFilterWithAncestors can resolve full ancestry chains across all depths.
  // This does NOT change columnData — columns still load based on selection.
  const globalFilterActive =
    !!globalFilter && isGlobalFilterActive(globalFilter);
  const allProjectTasksRef = useRef<Task[]>([]);
  const [allProjectTasksVersion, setAllProjectTasksVersion] = useState(0);
  useEffect(() => {
    if (!globalFilterActive || !send) {
      if (allProjectTasksRef.current.length > 0) {
        allProjectTasksRef.current = [];
        setAllProjectTasksVersion((v) => v + 1);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await send("task:list", { limit: 5000 });
        if (cancelled) return;
        const allTasks: Task[] = res?.data || [];
        allProjectTasksRef.current = allTasks;
        setAllProjectTasksVersion((v) => v + 1);
      } catch {
        // Fall back to column-only filtering
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [globalFilterActive, send]);

  // Load split view root when split is activated
  useEffect(() => {
    if (splitView && send) {
      fetchSplitColumn(0, null);
    }
  }, [splitView, send, fetchSplitColumn]);

  // Split view selection changes
  const prevSplitSelectedRef = useRef<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  useEffect(() => {
    if (!splitView) return;
    const prev = prevSplitSelectedRef.current;
    for (let i = 0; i < splitSelected.length; i++) {
      if (splitSelected[i] !== prev[i]) {
        if (splitSelected[i] && i + 1 < 4) {
          fetchSplitColumn(i + 1, splitSelected[i]);
        }
        for (let j = i + 1; j < 4; j++) {
          if (!splitSelected[j - 1]) {
            setSplitColumnData((p) => {
              const n = [...p];
              n[j] = [];
              return n;
            });
          }
        }
        break;
      }
    }
    prevSplitSelectedRef.current = [...splitSelected];
  }, [splitSelected, splitView, fetchSplitColumn]);

  const splitSelectTask = useCallback(
    (depth: number, taskId: string | null) => {
      setLastFocusedPane("bottom");
      setSplitSelected((prev) => {
        const next = [...prev];
        next[depth] = taskId;
        for (let i = depth + 1; i < next.length; i++) next[i] = null;
        return next;
      });
    },
    [],
  );

  // Load ONLY the changed child column when selection changes (not all)
  useEffect(() => {
    const prev = prevSelectedRef.current;
    for (let i = 0; i < selected.length; i++) {
      if (selected[i] !== prev[i]) {
        if (selected[i] && i + 1 < 4) {
          fetchColumn(i + 1, selected[i], true);
        }
        // Clear all deeper columns when a selection changes
        for (let j = i + 1; j < 4; j++) {
          if (!selected[j - 1]) {
            setColumnData((p) => {
              const n = [...p];
              n[j] = [];
              return n;
            });
          }
        }
        break; // Only one depth changes per selection click
      }
    }
    prevSelectedRef.current = [...selected];
  }, [selected, fetchColumn]);

  // Deep-link: fetch the target task via WS
  useEffect(() => {
    if (!focusTaskId || !send || deepLinkProcessed) return;
    (async () => {
      try {
        const task = await send("task:get", { task_id: focusTaskId });
        if (!task) return;
        const path = (task as Task & { path?: string[] }).path || [];
        const newSelected: (string | null)[] = [null, null, null, null];
        for (let i = 0; i < path.length && i < 4; i++) newSelected[i] = path[i];
        if (task.depth < 4) newSelected[task.depth] = task.id;
        setSelected(newSelected);
        setDeepLinkProcessed(true);
        setAutoExpanded(true);
      } catch {
        /* ignore */
      }
    })();
  }, [focusTaskId, send, deepLinkProcessed]);

  // Auto-expand first root task on initial load
  useEffect(() => {
    if (!autoExpanded && columnData[0].length > 0) {
      const firstTask = columnData[0][0];
      selectTask(0, firstTask.id);
      setAutoExpanded(true);
    }
  }, [columnData, autoExpanded]);

  // Column customization: widths and names (persisted per project)
  const [columnWidths, setColumnWidths] = useState<number[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COL_WIDTHS;
    try {
      const stored = localStorage.getItem(`${LS_WIDTHS_KEY}-${projectId}`);
      return stored ? JSON.parse(stored) : DEFAULT_COL_WIDTHS;
    } catch {
      return DEFAULT_COL_WIDTHS;
    }
  });
  const [columnNames, setColumnNames] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COL_NAMES;
    try {
      const stored = localStorage.getItem(`${LS_NAMES_KEY}-${projectId}`);
      return stored ? JSON.parse(stored) : DEFAULT_COL_NAMES;
    } catch {
      return DEFAULT_COL_NAMES;
    }
  });

  const policies = useProjectPolicies(projectId);
  const { hasReviewPipeline, isReviewable } = useReviewableFields(projectId);
  const canDirectUpdate = policies.canDirectUpdate;

  // Use policy-based permission instead of hardcoded role checks
  const canEditColumns = policies.canEditTask;

  // Convert ProjectMember to OrgMember format if orgMembers not provided
  const effectiveMembers: OrgMember[] =
    orgMembers ||
    members.map((m) => ({
      org_id: orgId,
      user_id: m.user_id,
      email: m.email || "",
      display_name: m.display_name || m.email || "",
      avatar_url: m.avatar_url,
      role: "member" as const, // ProjectMember role is different from OrgRole, default to member
      joined_at: m.joined_at,
    }));

  const selectTask = useCallback((depth: number, taskId: string | null) => {
    setLastFocusedPane("top");
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

  /* ── Sync columnData from Zustand store broadcasts (does NOT depend on `selected`) ── */
  const storeTasks = useProjectTaskStore((s) => s.tasks);
  useEffect(() => {
    setColumnData((prev) => {
      const next = [...prev];
      let changed = false;
      // Build keys from the current selected ref to avoid depending on selected state
      const sel = prevSelectedRef.current;
      const keys = ["root", sel[0] || "", sel[1] || "", sel[2] || ""];
      for (let i = 0; i < 4; i++) {
        const key = keys[i];
        if (!key) continue;
        const storeList = storeTasks.get(key);
        if (!storeList) continue;
        if (storeList !== prev[i]) {
          next[i] = storeList;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Also sync split view columns
    if (splitView) {
      setSplitColumnData((prev) => {
        const next = [...prev];
        let changed = false;
        const sel = prevSplitSelectedRef.current;
        const keys = ["root", sel[0] || "", sel[1] || "", sel[2] || ""];
        for (let i = 0; i < 4; i++) {
          const key = keys[i];
          if (!key) continue;
          const storeList = storeTasks.get(key);
          if (!storeList) continue;
          if (storeList !== prev[i]) {
            next[i] = storeList;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [storeTasks, splitView]);

  // Helper: refetch all visible columns
  const refetchAll = useCallback(() => {
    softRefetch(0, null);
    const sel = prevSelectedRef.current;
    for (let i = 0; i < sel.length; i++) {
      if (sel[i]) softRefetch(i + 1, sel[i]);
    }
  }, [softRefetch]);

  /* ── Mutations via WS ── */
  const handleDelete = useCallback(
    async (id: string) => {
      if (!send) return;
      // Capture snapshot for undo
      const deletedTask = columnData.flat().find((t) => t.id === id);
      setDeletePending(true);
      // Optimistic: remove immediately from BOTH local state AND store
      setColumnData((prev) =>
        prev.map((col) => col.filter((t) => t.id !== id)),
      );
      useProjectTaskStore.getState().removeTask(id);
      setSelected((prev) => {
        const idx = prev.indexOf(id);
        if (idx >= 0) {
          const next = [...prev];
          for (let i = idx; i < next.length; i++) next[i] = null;
          return next;
        }
        return prev;
      });
      setDeleteTarget(null);
      try {
        await send("task:delete", { task_id: id });
      } catch {
        refetchAll();
      } finally {
        setDeletePending(false);
      }
    },
    [send, refetchAll, columnData],
  );

  const handleUpdate = useCallback(
    async (taskId: string, data: Partial<Task>) => {
      if (!send) return;
      // Find current task to get version for optimistic concurrency
      const currentTask = columnData.flat().find((t) => t.id === taskId);
      // Optimistic update in column data — instant, no loading
      setColumnData((prev) =>
        prev.map((col) =>
          col.map((t) => (t.id === taskId ? { ...t, ...data } : t)),
        ),
      );
      // Also update Zustand store optimistically
      if (currentTask) {
        useProjectTaskStore
          .getState()
          .upsertTask({ ...currentTask, ...data } as Task);
      }
      setUpdatePending(true);
      try {
        const payload = {
          task_id: taskId,
          base_version: currentTask?.version ?? 0,
          ...data,
        };
        const updated = await send("task:update", payload);
        // Check for deadline warning (no applied_changes, only conflicts)
        if (
          updated?.deadline_conflicts?.length &&
          !updated?.applied_changes?.length
        ) {
          // Revert optimistic update
          if (currentTask) {
            useProjectTaskStore.getState().upsertTask(currentTask);
            setColumnData((prev) =>
              prev.map((col) =>
                col.map((t) => (t.id === taskId ? currentTask : t)),
              ),
            );
          }
          pendingUpdateRef.current = {
            taskId,
            data,
            baseVersion: currentTask?.version ?? 0,
          };
          setUpdateDeadlineConflicts(updated.deadline_conflicts);
          return;
        }
        // Handle pending review — open modal so user can submit the CR properly
        if (updated?.pending_review) {
          if (currentTask) {
            useProjectTaskStore.getState().upsertTask(currentTask);
            setColumnData((prev) =>
              prev.map((col) =>
                col.map((t) => (t.id === taskId ? currentTask : t)),
              ),
            );
          }
          setCrModal({ taskId, changes: data });
          return;
        }
        // Reconcile with server response — handle both direct task and wrapped result
        const task = updated?.task ?? updated;
        if (task?.id) {
          useProjectTaskStore.getState().upsertTask(task);
          setColumnData((prev) =>
            prev.map((col) => col.map((t) => (t.id === taskId ? task : t))),
          );
        }
        // Handle ancestor updates from deadline cascade
        if (updated?.ancestors_updated?.length) {
          for (const anc of updated.ancestors_updated) {
            useProjectTaskStore.getState().upsertTask(anc);
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message) {
          setUpdateError(e.message);
        }
        refetchAll();
      } finally {
        setUpdatePending(false);
      }
    },
    [send, refetchAll, columnData],
  );

  /**
   * Wraps handleUpdate to intercept reviewable-field edits:
   * - If the review pipeline is active AND user lacks direct_update AND
   *   ALL changed fields are reviewable → open the modal instead of sending WS.
   * - If ANY field is non-reviewable in that context → let handleUpdate proceed
   *   (the backend will return 403 with an error message).
   */
  const handleUpdateWithReviewCheck = useCallback(
    (taskId: string, data: Partial<Task>) => {
      if (!canEditColumns) return;
      if (!canDirectUpdate && Object.keys(data).length > 0) {
        setCrModal({ taskId, changes: data });
        return;
      }
      handleUpdate(taskId, data);
    },
    [canEditColumns, canDirectUpdate, handleUpdate],
  );

  const confirmExtendDeadlinesOnUpdate = useCallback(async () => {
    const pending = pendingUpdateRef.current;
    if (!pending || !send) return;
    const conflicts = updateDeadlineConflicts;
    setUpdateDeadlineConflicts([]);
    pendingUpdateRef.current = null;
    setUpdatePending(true);
    try {
      const hasAncestor = conflicts.some((c) => c.direction === "ancestor");
      const hasDescendant = conflicts.some((c) => c.direction === "descendant");
      const updated = await send("task:update", {
        task_id: pending.taskId,
        base_version: pending.baseVersion,
        ...pending.data,
        ...(hasAncestor && { extend_parent_deadlines: true }),
        ...(hasDescendant && { adjust_child_deadlines: true }),
      });
      const task = updated?.task ?? updated;
      if (task?.id) {
        useProjectTaskStore.getState().upsertTask(task);
        setColumnData((prev) =>
          prev.map((col) =>
            col.map((t) => (t.id === pending.taskId ? task : t)),
          ),
        );
      }
      if (updated?.ancestors_updated?.length) {
        for (const anc of updated.ancestors_updated) {
          useProjectTaskStore.getState().upsertTask(anc);
        }
        refetchAll();
      }
    } catch {
      refetchAll();
    } finally {
      setUpdatePending(false);
    }
  }, [send, refetchAll, updateDeadlineConflicts]);

  const handleDuplicate = useCallback(
    async (id: string) => {
      if (!send) return;
      try {
        const task = await send("task:duplicate", { task_id: id });
        // Broadcast excludes sender, so add duplicate to store directly
        if (task?.id) {
          const store = useProjectTaskStore.getState();
          const parentKey = task.parent_task_id || "root";
          const existing = store.tasks.get(parentKey) || [];
          if (!existing.find((t: Task) => t.id === task.id)) {
            store.setTasks(
              parentKey,
              [...existing, task],
              (store.totals.get(parentKey) ?? 0) + 1,
            );
          }
        }
      } catch {
        /* ignore */
      }
    },
    [send],
  );

  // Multi-select handlers (must be before drop handlers that reference them)
  const toggleMultiSelect = useCallback((taskId: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const clearMultiSelection = useCallback(() => {
    setMultiSelected(new Set());
    setBulkActionMode(false);
  }, []);

  const toggleBulkActionMode = useCallback(() => {
    setBulkActionMode((prev) => {
      if (prev) setMultiSelected(new Set());
      return !prev;
    });
  }, []);

  // Select all tasks in a specific column
  const selectAllInColumn = useCallback((tasks: Task[]) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      for (const t of tasks) next.add(t.id);
      return next;
    });
  }, []);

  const handleDropOnTask = useCallback(
    async (targetTask: Task) => {
      if (!canEditColumns) return;
      if (!send || !draggedTask || draggedTask.id === targetTask.id) return;
      if (targetTask.depth >= MAX_DEPTH) return;
      if (draggedTask.parent_task_id === targetTask.id) return;

      // Prevent circular: target must NOT be a descendant of the dragged task
      // Walk the loaded column data to check if targetTask is inside draggedTask's subtree
      const allTasks = columnData.flat();
      const isDescendant = (ancestorId: string, checkId: string): boolean => {
        let cur = allTasks.find((t) => t.id === checkId);
        while (cur?.parent_task_id) {
          if (cur.parent_task_id === ancestorId) return true;
          cur = allTasks.find((t) => t.id === cur!.parent_task_id);
        }
        return false;
      };
      if (isDescendant(draggedTask.id, targetTask.id)) return;

      // Depth overflow: calculate max subtree depth of dragged task
      const getSubtreeHeight = (taskId: string): number => {
        const children = allTasks.filter((t) => t.parent_task_id === taskId);
        if (children.length === 0) return 0;
        return 1 + Math.max(...children.map((c) => getSubtreeHeight(c.id)));
      };
      const subtreeHeight = getSubtreeHeight(draggedTask.id);
      const newDepth = targetTask.depth + 1;
      if (newDepth + subtreeHeight > MAX_DEPTH) return;

      // Determine tasks to move (multi-select support)
      const tasksToMove: Task[] =
        bulkActionMode && multiSelected.has(draggedTask.id)
          ? columnData
              .flat()
              .filter((t) => multiSelected.has(t.id) && t.id !== targetTask.id)
          : [draggedTask];
      if (tasksToMove.length === 0) return;

      // Review pipeline check: reparent always needs review for users without direct_update
      if (!canDirectUpdate) {
        // Only single-task reparent goes through review
        if (tasksToMove.length === 1) {
          setCrModal({
            taskId: tasksToMove[0].id,
            changes: { parent_task_id: targetTask.id },
          });
          setDraggedTask(null);
          setDragOverTaskId(null);
          return;
        }
      }

      // Optimistic: remove moved tasks from BOTH local state AND store BEFORE await
      const movedIds = new Set(tasksToMove.map((t) => t.id));
      setColumnData((prev) =>
        prev.map((col) => col.filter((t) => !movedIds.has(t.id))),
      );
      for (const tid of movedIds)
        useProjectTaskStore.getState().removeTask(tid);

      try {
        const reorderItems = tasksToMove.map((t, i) => ({
          id: t.id,
          parent_id: targetTask.id,
          position: i,
        }));
        await send("task:reorder", { items: reorderItems });

        // Refetch all columns to get fresh data from server
        refetchAll();

        if (bulkActionMode) clearMultiSelection();
      } catch (e) {
        if (e instanceof Error && e.message) {
          setUpdateError(e.message);
        }
        refetchAll();
      }
      setDraggedTask(null);
      setDragOverTaskId(null);
    },
    [
      send,
      draggedTask,
      columnData,
      refetchAll,
      canEditColumns,
      canDirectUpdate,
      bulkActionMode,
      multiSelected,
      clearMultiSelection,
    ],
  );

  // Drop on blank column space → reparent to that column's parent
  const handleDropOnColumn = useCallback(
    async (depth: number) => {
      if (!canEditColumns) return;
      if (!send || !draggedTask) return;
      // Column at depth N shows children of selected[depth-1]. Dropping here means reparent to selected[depth-1].
      const newParentId = depth > 0 ? (selected[depth - 1] ?? null) : null;
      // Don't reparent to same parent
      if ((draggedTask.parent_task_id || null) === newParentId) return;

      // Prevent circular: if dropping into a column whose parent is a descendant of draggedTask
      if (newParentId) {
        const allTasks = columnData.flat();
        const isDescendant = (ancestorId: string, checkId: string): boolean => {
          let cur = allTasks.find((t) => t.id === checkId);
          while (cur?.parent_task_id) {
            if (cur.parent_task_id === ancestorId) return true;
            cur = allTasks.find((t) => t.id === cur!.parent_task_id);
          }
          return false;
        };
        if (
          newParentId === draggedTask.id ||
          isDescendant(draggedTask.id, newParentId)
        )
          return;
      }

      // Depth overflow: calculate max subtree depth of dragged task
      const allTasks = columnData.flat();
      const getSubtreeHeight = (taskId: string): number => {
        const children = allTasks.filter((t) => t.parent_task_id === taskId);
        if (children.length === 0) return 0;
        return 1 + Math.max(...children.map((c) => getSubtreeHeight(c.id)));
      };
      const subtreeHeight = getSubtreeHeight(draggedTask.id);
      // newDepth is the depth the task will land at
      const newDepth = depth;
      if (newDepth + subtreeHeight > MAX_DEPTH) return;

      const tasksToMove: Task[] =
        bulkActionMode && multiSelected.has(draggedTask.id)
          ? columnData.flat().filter((t) => multiSelected.has(t.id))
          : [draggedTask];
      if (tasksToMove.length === 0) return;

      // Review pipeline check: reparent always needs review for users without direct_update
      if (!canDirectUpdate) {
        if (tasksToMove.length === 1) {
          setCrModal({
            taskId: tasksToMove[0].id,
            changes: { parent_task_id: newParentId ?? null },
          });
          setDraggedTask(null);
          setDragOverTaskId(null);
          return;
        }
      }

      // Optimistic: remove from BOTH local state AND store BEFORE await
      const movedIds = new Set(tasksToMove.map((t) => t.id));
      setColumnData((prev) =>
        prev.map((col) => col.filter((t) => !movedIds.has(t.id))),
      );
      for (const tid of movedIds)
        useProjectTaskStore.getState().removeTask(tid);

      try {
        const reorderItems = tasksToMove.map((t, i) => ({
          id: t.id,
          parent_id: newParentId,
          position: i,
        }));
        await send("task:reorder", { items: reorderItems });
        refetchAll();

        if (bulkActionMode) clearMultiSelection();
      } catch (e) {
        if (e instanceof Error && e.message) {
          setUpdateError(e.message);
        }
        refetchAll();
      }
      setDraggedTask(null);
      setDragOverTaskId(null);
    },
    [
      send,
      draggedTask,
      selected,
      columnData,
      refetchAll,
      canEditColumns,
      canDirectUpdate,
      bulkActionMode,
      multiSelected,
      clearMultiSelection,
    ],
  );

  const focusedTask = useMemo(() => {
    if (splitView && lastFocusedPane === "bottom") {
      // Find focused in split pane
      for (let i = splitSelected.length - 1; i >= 0; i--) {
        if (splitSelected[i]) {
          return (
            splitColumnData[i]?.find((t) => t.id === splitSelected[i]) ?? null
          );
        }
      }
      return null;
    }
    return focusedDepth >= 0
      ? (columnData[focusedDepth]?.find(
          (t) => t.id === selected[focusedDepth],
        ) ?? null)
      : null;
  }, [
    splitView,
    lastFocusedPane,
    splitSelected,
    splitColumnData,
    focusedDepth,
    columnData,
    selected,
  ]);

  const openCreate = (depth: number) => {
    setCreateDepth(depth);
    setCreateParentId(depth > 0 ? selected[depth - 1] : null);
  };

  // Resolve parent task for create modal (inherits fields)
  const createParentTask = useMemo(() => {
    if (!createParentId) return null;
    for (const tasks of columnData) {
      const found = tasks?.find((t) => t.id === createParentId);
      if (found) return found;
    }
    for (const tasks of splitColumnData) {
      const found = tasks?.find((t) => t.id === createParentId);
      if (found) return found;
    }
    return null;
  }, [createParentId, columnData, splitColumnData]);

  const openBulkCreate = (depth: number) => {
    setBulkCreateDepth(depth);
    setBulkCreateParentId(depth > 0 ? selected[depth - 1] : null);
  };

  // Get all selected tasks as objects (from all columns)
  const selectedTasks = useMemo(() => {
    if (multiSelected.size === 0) return [];
    const allTasks = columnData.flat();
    return allTasks.filter((t) => multiSelected.has(t.id));
  }, [multiSelected, columnData]);

  // Bulk update selected tasks
  const handleBulkUpdate = useCallback(
    async (changes: Record<string, unknown>) => {
      if (!send || multiSelected.size === 0) return;
      try {
        const taskIds = Array.from(multiSelected);
        const result = await send("task:bulk-update", {
          task_ids: taskIds,
          changes,
        });
        // Broadcast excludes sender, update store directly
        const tasks: Task[] = Array.isArray(result) ? result : [];
        if (tasks.length > 0) {
          const store = useProjectTaskStore.getState();
          store.bulkUpsertTasks(tasks);
        }
        clearMultiSelection();
      } catch {
        /* ignore */
      }
    },
    [send, multiSelected, clearMultiSelection],
  );

  // Bulk delete selected tasks
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const handleBulkDelete = useCallback(async () => {
    if (!send || multiSelected.size === 0) return;
    try {
      for (const id of multiSelected) {
        await send("task:delete", { task_id: id });
        useProjectTaskStore.getState().removeTask(id);
      }
      setColumnData((prev) =>
        prev.map((col) => col.filter((t) => !multiSelected.has(t.id))),
      );
      clearMultiSelection();
      setBulkDeleteConfirm(false);
    } catch {
      /* ignore */
    }
  }, [send, multiSelected, clearMultiSelection]);

  /* ── Column resize handlers ── */
  const handleResizeStart = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = columnWidths[colIndex];
      let currentWidths = [...columnWidths];

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(80, Math.min(600, startWidth + delta));
        currentWidths = [...currentWidths];
        currentWidths[colIndex] = newWidth;
        setColumnWidths(currentWidths);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        // Save directly to localStorage with current widths
        if (typeof window !== "undefined") {
          localStorage.setItem(
            `${LS_WIDTHS_KEY}-${projectId}`,
            JSON.stringify(currentWidths),
          );
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [columnWidths, projectId],
  );

  /* ── Column rename handlers ── */
  const [editingColumn, setEditingColumn] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const startEditingName = useCallback(
    (colIndex: number) => {
      if (!canEditColumns) return;
      setEditingColumn(colIndex);
      setEditingName(columnNames[colIndex]);
    },
    [canEditColumns, columnNames],
  );

  const confirmEditName = useCallback(
    (colIndex: number) => {
      if (editingName.trim()) {
        const updatedNames = [...columnNames];
        updatedNames[colIndex] = editingName.trim();
        setColumnNames(updatedNames);
        // Save directly to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem(
            `${LS_NAMES_KEY}-${projectId}`,
            JSON.stringify(updatedNames),
          );
        }
      }
      setEditingColumn(null);
      setEditingName("");
    },
    [editingName, columnNames, projectId],
  );

  const cancelEditName = useCallback(() => {
    setEditingColumn(null);
    setEditingName("");
  }, []);

  /* ── Column Filters ── */
  const [columnFilters, setColumnFilters] = useState<
    Map<number, ColumnFilterState>
  >(new Map());

  const setFilterForColumn = useCallback(
    (depth: number, filter: ColumnFilterState) => {
      setColumnFilters((prev) => {
        const next = new Map(prev);
        if (isFilterActive(filter)) {
          next.set(depth, filter);
        } else {
          next.delete(depth);
        }
        return next;
      });
    },
    [],
  );

  const filteredColumnData = useMemo(
    () =>
      applyFilterWithAncestors(
        columnData,
        columnFilters,
        globalFilter,
        allProjectTasksRef.current,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnData, columnFilters, globalFilter, allProjectTasksVersion],
  );

  const filteredSplitColumnData = useMemo(
    () =>
      applyFilterWithAncestors(
        splitColumnData,
        columnFilters,
        globalFilter,
        allProjectTasksRef.current,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [splitColumnData, columnFilters, globalFilter, allProjectTasksVersion],
  );

  /* ── Render ── */
  const columnMeta = [
    {
      depth: 0,
      label: columnNames[0],
      tasks: filteredColumnData[0],
      loading: columnLoading[0],
      show: true,
    },
    {
      depth: 1,
      label: columnNames[1],
      tasks: filteredColumnData[1],
      loading: columnLoading[1],
      show: !!selected[0],
    },
    {
      depth: 2,
      label: columnNames[2],
      tasks: filteredColumnData[2],
      loading: columnLoading[2],
      show: !!selected[1],
    },
    {
      depth: 3,
      label: columnNames[3],
      tasks: filteredColumnData[3],
      loading: columnLoading[3],
      show: !!selected[2],
    },
  ];

  const splitColumnMeta = [
    {
      depth: 0,
      label: columnNames[0],
      tasks: filteredSplitColumnData[0],
      loading: splitColumnLoading[0],
      show: true,
    },
    {
      depth: 1,
      label: columnNames[1],
      tasks: filteredSplitColumnData[1],
      loading: splitColumnLoading[1],
      show: !!splitSelected[0],
    },
    {
      depth: 2,
      label: columnNames[2],
      tasks: filteredSplitColumnData[2],
      loading: splitColumnLoading[2],
      show: !!splitSelected[1],
    },
    {
      depth: 3,
      label: columnNames[3],
      tasks: filteredSplitColumnData[3],
      loading: splitColumnLoading[3],
      show: !!splitSelected[2],
    },
  ];

  /* Toolbar buttons (rendered inline or portaled) */
  const toolbarContent = (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant={bulkActionMode ? "primary" : "ghost"}
          size="xs"
          className="gap-1"
          onClick={toggleBulkActionMode}
        >
          <Check className="w-3 h-3" />
          {bulkActionMode ? `Select (${multiSelected.size})` : "Select"}
        </Button>
        {bulkActionMode && multiSelected.size > 0 && (
          <Button variant="ghost" size="xs" onClick={clearMultiSelection}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          variant={splitView ? "secondary" : "ghost"}
          size="xs"
          className="gap-1"
          onClick={() => setSplitView((p) => !p)}
          title="Toggle split view"
        >
          {splitView ? "Unsplit" : "Split"}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
      {/* Pending review toast */}
      <ChangeRequestToast
        result={pendingReviewResult}
        onDismiss={() => setPendingReviewResult(null)}
      />

      {/* Update error toast (e.g. blocked non-reviewable fields) */}
      {updateError && (
        <Alert
          variant="error"
          className="shadow-lg mx-3 mt-2 text-sm"
          onDismiss={() => setUpdateError(null)}
        >
          {updateError}
        </Alert>
      )}

      {/* Change request modal for reviewable field edits */}
      {crModal &&
        (() => {
          const crTask = columnData.flat().find((t) => t.id === crModal.taskId);
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

      {/* Toolbar: portal to parent row if available, otherwise render inline */}
      {toolbarPortal ? (
        createPortal(toolbarContent, toolbarPortal)
      ) : (
        <div className="flex items-center justify-between px-3 py-1 border-b border-base-200/55">
          {toolbarContent}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Columns area — scrollable, fills space beside preview panel */}
        <div
          className={cn(
            "flex flex-col flex-1 min-w-0",
            splitView && "divide-y divide-base-300",
          )}
        >
          {/* Top row — always shown */}
          <div
            className={cn(
              "flex flex-row min-w-0 overflow-hidden",
              splitView ? "flex-1 min-h-0" : "flex-1",
            )}
          >
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
                    onAdd={
                      policies.canCreateTask
                        ? () => openCreate(col.depth)
                        : undefined
                    }
                    onBulkAdd={
                      policies.canCreateTask
                        ? () => openBulkCreate(col.depth)
                        : undefined
                    }
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
                    bulkMode={bulkActionMode}
                    multiSelected={multiSelected}
                    onToggleSelect={toggleMultiSelect}
                    onSelectAll={selectAllInColumn}
                    filter={columnFilters.get(col.depth)}
                    onFilterChange={(f) => setFilterForColumn(col.depth, f)}
                    onTaskContextMenu={(e, task) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        task,
                        depth: col.depth,
                      });
                    }}
                    onDragStart={(task) => setDraggedTask(task)}
                    onDragEnd={() => {
                      setDraggedTask(null);
                      setDragOverTaskId(null);
                    }}
                    onDropOnTask={handleDropOnTask}
                    onDropOnColumn={() => handleDropOnColumn(col.depth)}
                    dragOverTaskId={dragOverTaskId}
                    onDragOverTask={setDragOverTaskId}
                  />
                ),
            )}
          </div>
          {/* Bottom row — split view only */}
          {splitView && (
            <div className="flex flex-row flex-1 min-w-0 min-h-0 overflow-hidden">
              {splitColumnMeta.map(
                (col) =>
                  col.show && (
                    <TaskColumn
                      key={`split-${col.depth}`}
                      depth={col.depth}
                      label={col.label}
                      tasks={col.tasks}
                      loading={col.loading}
                      selectedId={splitSelected[col.depth]}
                      onSelect={(id) => splitSelectTask(col.depth, id)}
                      onAdd={
                        policies.canCreateTask
                          ? () => openCreate(col.depth)
                          : undefined
                      }
                      onBulkAdd={
                        policies.canCreateTask
                          ? () => openBulkCreate(col.depth)
                          : undefined
                      }
                      members={members}
                      width={columnWidths[col.depth]}
                      canEdit={canEditColumns}
                      isEditing={false}
                      editingName=""
                      onEditingNameChange={() => {}}
                      onStartEdit={() => {}}
                      onConfirmEdit={() => {}}
                      onCancelEdit={() => {}}
                      onResizeStart={(e) => handleResizeStart(col.depth, e)}
                      bulkMode={bulkActionMode}
                      multiSelected={multiSelected}
                      onToggleSelect={toggleMultiSelect}
                      onSelectAll={selectAllInColumn}
                      filter={columnFilters.get(col.depth)}
                      onFilterChange={(f) => setFilterForColumn(col.depth, f)}
                      onTaskContextMenu={(e, task) => {
                        e.preventDefault();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          task,
                          depth: col.depth,
                        });
                      }}
                      onDragStart={(task) => setDraggedTask(task)}
                      onDragEnd={() => {
                        setDraggedTask(null);
                        setDragOverTaskId(null);
                      }}
                      onDropOnTask={handleDropOnTask}
                      onDropOnColumn={() => handleDropOnColumn(col.depth)}
                      dragOverTaskId={dragOverTaskId}
                      onDragOverTask={setDragOverTaskId}
                    />
                  ),
              )}
            </div>
          )}
        </div>

        {/* Detail panel — flexible width, shrinks with viewport */}
        <div className="w-full lg:w-[320px] lg:min-w-[200px] lg:max-w-[400px] shrink border-t lg:border-t-0 lg:border-l border-base-200/55 overflow-hidden flex flex-col max-h-[50vh] lg:max-h-none">
          {focusedTask ? (
            <TaskPreviewPanel
              task={focusedTask}
              orgId={orgId}
              orgSlug={orgSlug}
              projectId={projectId}
              members={effectiveMembers}
              projectMembers={members}
              currentUserId={currentUserId}
              updating={updatePending}
              onUpdate={(data) =>
                handleUpdateWithReviewCheck(focusedTask.id, data)
              }
              onDelete={() => setDeleteTarget(focusedTask)}
              onDuplicate={() => handleDuplicate(focusedTask.id)}
              onAddSubtask={
                policies.canCreateTask
                  ? () => {
                      if (focusedTask.depth < MAX_DEPTH) {
                        setCreateParentId(focusedTask.id);
                        setCreateDepth(focusedTask.depth + 1);
                      }
                    }
                  : undefined
              }
            />
          ) : (
            <div className="h-full flex items-center justify-center text-base-content/30 p-6">
              <p className="text-sm text-center">
                Select a task to view details
              </p>
            </div>
          )}
        </div>

        {/* Create modal */}
        {createDepth !== null && (
          <CreateTaskModal
            orgId={orgId}
            projectId={projectId}
            parentId={createParentId}
            parentTask={createParentTask}
            members={members}
            onClose={() => {
              setCreateDepth(null);
              setCreateParentId(null);
            }}
            onCreated={() => {
              // WS broadcast task:created will add to store → synced via useEffect
              setCreateDepth(null);
              setCreateParentId(null);
            }}
          />
        )}

        {/* Bulk create modal */}
        {bulkCreateDepth !== null && (
          <BulkCreateTaskModal
            projectId={projectId}
            parentId={bulkCreateParentId}
            members={members}
            onClose={() => {
              setBulkCreateDepth(null);
              setBulkCreateParentId(null);
            }}
          />
        )}

        {/* Delete confirmation */}
        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
          title="Delete Task"
          message={`Delete "${deleteTarget?.title}" and all its subtasks?`}
          loading={deletePending}
        />

        {/* Bulk delete confirmation */}
        <ConfirmDialog
          open={bulkDeleteConfirm}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title="Delete Selected Tasks"
          message={`Delete ${multiSelected.size} selected task${multiSelected.size !== 1 ? "s" : ""} and all their subtasks?`}
        />

        {/* Update deadline conflict confirmation */}
        {updateDeadlineConflicts.length > 0 &&
          (() => {
            const ancestorConflicts = updateDeadlineConflicts.filter(
              (c) => c.direction === "ancestor",
            );
            const descendantConflicts = updateDeadlineConflicts.filter(
              (c) => c.direction === "descendant" || !c.direction,
            );
            return (
              <dialog
                className="modal modal-open"
                style={{ backgroundColor: "transparent" }}
              >
                <div className="modal-box shadow-2xl max-w-md">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <span className="text-warning">⚠</span> Date Range Conflict
                  </h3>
                  <div className="py-3 space-y-2 text-sm">
                    {ancestorConflicts.length > 0 && (
                      <div>
                        <p className="text-base-content/70 mb-1">
                          The new due date extends beyond{" "}
                          {ancestorConflicts.length} parent task
                          {ancestorConflicts.length !== 1 ? "s" : ""}:
                        </p>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {ancestorConflicts.map((c) => (
                            <li
                              key={c.task_id}
                              className="text-base-content/60"
                            >
                              {c.title}{" "}
                              <span className="text-warning">
                                (due{" "}
                                {c.due_date
                                  ? new Date(c.due_date).toLocaleDateString()
                                  : "—"}
                                )
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {descendantConflicts.length > 0 && (
                      <div>
                        <p className="text-base-content/70 mb-1">
                          {descendantConflicts.length} subtask
                          {descendantConflicts.length !== 1 ? "s" : ""} fall
                          outside the new date range:
                        </p>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {descendantConflicts.slice(0, 8).map((c) => (
                            <li
                              key={c.task_id}
                              className="text-base-content/60"
                            >
                              {c.title}{" "}
                              <span className="text-warning">
                                (due{" "}
                                {c.due_date
                                  ? new Date(c.due_date).toLocaleDateString()
                                  : "—"}
                                )
                              </span>
                            </li>
                          ))}
                          {descendantConflicts.length > 8 && (
                            <li className="text-base-content/40">
                              …and {descendantConflicts.length - 8} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <p className="text-base-content/50 text-xs pt-1">
                      Apply to automatically adjust all affected tasks to fit
                      within the new range.
                    </p>
                  </div>
                  <div className="modal-action">
                    <Button
                      size="sm"
                      onClick={() => {
                        setUpdateDeadlineConflicts([]);
                        pendingUpdateRef.current = null;
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="warning"
                      onClick={confirmExtendDeadlinesOnUpdate}
                    >
                      Apply &amp; Adjust
                    </Button>
                  </div>
                </div>
                <div
                  className="modal-backdrop"
                  style={{ background: "transparent" }}
                  onClick={() => {
                    setUpdateDeadlineConflicts([]);
                    pendingUpdateRef.current = null;
                  }}
                />
              </dialog>
            );
          })()}
      </div>
      {/* end main content */}

      {/* Right-click context menu */}
      {contextMenu && (
        <TaskContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          task={contextMenu.task}
          depth={contextMenu.depth}
          members={members}
          canEditProp={policies.canEditTask}
          canDeleteProp={policies.canDeleteTask}
          canCreateProp={policies.canCreateTask}
          onClose={() => setContextMenu(null)}
          onSelect={() => selectTask(contextMenu.depth, contextMenu.task.id)}
          onUpdate={(data) =>
            handleUpdateWithReviewCheck(contextMenu.task.id, data)
          }
          onDelete={() => setDeleteTarget(contextMenu.task)}
          onDuplicate={() => handleDuplicate(contextMenu.task.id)}
          onAddSubtask={() => {
            if (contextMenu.task.depth < MAX_DEPTH) {
              setCreateParentId(contextMenu.task.id);
              setCreateDepth(contextMenu.task.depth + 1);
            }
          }}
          onCopyLink={() => {
            const url = `${window.location.origin}${window.location.pathname}?task=${contextMenu.task.id}`;
            navigator.clipboard.writeText(url);
          }}
        />
      )}

      {/* Floating bulk actions bar */}
      {bulkActionMode && multiSelected.size > 0 && policies.canEditTask && (
        <BulkActionsBar
          selectedCount={multiSelected.size}
          members={members}
          onAssign={(assigneeId) =>
            handleBulkUpdate({ assignee_id: assigneeId || "" })
          }
          onSetPriority={(priority) => handleBulkUpdate({ priority })}
          onSetStatus={(status) => handleBulkUpdate({ status })}
          onSetLabels={(labels) => handleBulkUpdate({ labels })}
          onDelete={() => setBulkDeleteConfirm(true)}
          onClear={clearMultiSelection}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Floating Bulk Actions Bar
   ═══════════════════════════════════════════════════════ */

function BulkActionsBar({
  selectedCount,
  members,
  onAssign,
  onSetPriority,
  onSetStatus,
  onSetLabels,
  onDelete,
  onClear,
}: {
  selectedCount: number;
  members: ProjectMember[];
  onAssign: (assigneeId: string) => void;
  onSetPriority: (priority: string) => void;
  onSetStatus: (status: string) => void;
  onSetLabels: (labels: string[]) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [labelInput, setLabelInput] = useState("");

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-base-300 shadow-xl rounded-xl px-4 py-2.5 flex items-center gap-2 border border-base-content/10">
      <span className="text-sm font-medium text-primary mr-1">
        {selectedCount} selected
      </span>
      <div className="divider divider-horizontal mx-0 h-6" />

      {/* Status dropdown */}
      <div className="dropdown dropdown-top">
        <div tabIndex={0} role="button" className="btn btn-ghost btn-xs gap-1">
          Status
        </div>
        <ul
          tabIndex={0}
          className="dropdown-content menu bg-base-200 rounded-box shadow-lg z-50 w-36 p-1 mb-2"
        >
          {(["todo", "in_progress", "done", "blocked"] as const).map((s) => (
            <li key={s}>
              <a onClick={() => onSetStatus(s)} className="text-xs">
                {s === "in_progress"
                  ? "In Progress"
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Priority dropdown */}
      <div className="dropdown dropdown-top">
        <div tabIndex={0} role="button" className="btn btn-ghost btn-xs gap-1">
          Priority
        </div>
        <ul
          tabIndex={0}
          className="dropdown-content menu bg-base-200 rounded-box shadow-lg z-50 w-32 p-1 mb-2"
        >
          {(["critical", "high", "medium", "low"] as const).map((p) => (
            <li key={p}>
              <a onClick={() => onSetPriority(p)} className="text-xs">
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Assign dropdown */}
      <div className="dropdown dropdown-top">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-ghost btn-xs gap-1"
          onClick={() => setShowAssign(!showAssign)}
        >
          <UserPlus className="w-3 h-3" /> Assign
        </div>
        <ul
          tabIndex={0}
          className="dropdown-content menu bg-base-200 rounded-box shadow-lg z-50 w-48 p-1 mb-2 max-h-48 overflow-y-auto"
        >
          <li>
            <a onClick={() => onAssign("")} className="text-xs">
              Unassigned
            </a>
          </li>
          {members.map((m) => (
            <li key={m.user_id}>
              <a onClick={() => onAssign(m.user_id)} className="text-xs">
                {m.display_name || m.email || m.user_id.slice(0, 12)}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Labels */}
      <div className="dropdown dropdown-top">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-ghost btn-xs gap-1"
          onClick={() => setShowLabels(!showLabels)}
        >
          <Tags className="w-3 h-3" /> Labels
        </div>
        <div
          tabIndex={0}
          className="dropdown-content bg-base-200 rounded-box shadow-lg z-50 w-56 p-3 mb-2"
        >
          <div className="flex gap-1.5">
            <input
              type="text"
              className="input input-bordered input-xs flex-1"
              placeholder="label1, label2"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const labels = labelInput
                    .split(",")
                    .map((l) => l.trim())
                    .filter(Boolean);
                  if (labels.length > 0) {
                    onSetLabels(labels);
                    setLabelInput("");
                  }
                }
              }}
            />
            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                const labels = labelInput
                  .split(",")
                  .map((l) => l.trim())
                  .filter(Boolean);
                if (labels.length > 0) {
                  onSetLabels(labels);
                  setLabelInput("");
                }
              }}
            >
              Apply
            </Button>
          </div>
          <p className="text-[10px] text-base-content/50 mt-1">
            Comma-separated labels
          </p>
        </div>
      </div>

      <div className="divider divider-horizontal mx-0 h-6" />

      {/* Delete */}
      <Button
        variant="ghost"
        size="xs"
        className="text-error gap-1"
        onClick={onDelete}
      >
        <Trash2 className="w-3 h-3" /> Delete
      </Button>

      {/* Clear selection */}
      <Button
        variant="ghost"
        size="xs"
        className="btn-square"
        onClick={onClear}
        title="Clear selection"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
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
  onBulkAdd,
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
  bulkMode,
  multiSelected,
  onToggleSelect,
  onSelectAll,
  filter,
  onFilterChange,
  onTaskContextMenu,
  onDragStart,
  onDragEnd,
  onDropOnTask,
  onDropOnColumn,
  dragOverTaskId,
  onDragOverTask,
}: {
  depth: number;
  label: string;
  tasks: Task[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onBulkAdd?: () => void;
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
  bulkMode: boolean;
  multiSelected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (tasks: Task[]) => void;
  filter?: ColumnFilterState;
  onFilterChange: (f: ColumnFilterState) => void;
  onTaskContextMenu: (e: React.MouseEvent, task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  onDropOnTask: (targetTask: Task) => void;
  onDropOnColumn: () => void;
  dragOverTaskId: string | null;
  onDragOverTask: (taskId: string | null) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [showFilter, setShowFilter] = useState(false);
  const filterActive = isFilterActive(filter);

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 5,
  });

  return (
    <div
      className="flex flex-col border-r border-base-200/55 relative flex-1 min-w-0"
      style={{ flex: `${width} 1 0%` }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-200/55 flex items-center justify-between bg-base-200/20">
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              className="input input-xs input-bordered flex-1 min-w-0 text-xs uppercase tracking-wide font-semibold"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirmEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
            />
            <Button
              variant="ghost"
              size="xs"
              className="btn-square text-success"
              onClick={onConfirmEdit}
            >
              <Check className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="btn-square text-error"
              onClick={onCancelEdit}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wide text-base-content/60",
              canEdit && "cursor-pointer hover:text-base-content",
            )}
            onDoubleClick={onStartEdit}
            title={canEdit ? "Double-click to rename" : undefined}
          >
            {label}
          </span>
        )}
        <div className="flex items-center gap-1">
          {bulkMode && tasks.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="btn-square"
              onClick={() => {
                const allSelected = tasks.every((t) => multiSelected.has(t.id));
                if (allSelected) {
                  // Deselect all in this column (handled by parent set logic)
                  for (const t of tasks) onToggleSelect(t.id);
                } else {
                  onSelectAll(tasks);
                }
              }}
              title="Select all in column"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary [--chkfg:oklch(98%_0.005_270)]"
                checked={
                  tasks.length > 0 &&
                  tasks.every((t) => multiSelected.has(t.id))
                }
                readOnly
              />
            </Button>
          )}
          {canEdit && !isEditing && (
            <Button
              variant="ghost"
              size="xs"
              className="btn-square opacity-0 group-hover:opacity-100 hover:opacity-100"
              onClick={onStartEdit}
              title="Rename column"
            >
              <Pencil className="w-3 h-3" />
            </Button>
          )}
          <span className="text-xs text-base-content/40">{tasks.length}</span>
          <Button
            variant="ghost"
            size="xs"
            className={cn("btn-square", filterActive && "text-primary")}
            onClick={() => setShowFilter((p) => !p)}
            title="Filter column"
          >
            <Filter className="w-3 h-3" />
          </Button>
          {onBulkAdd && (
            <Button
              variant="ghost"
              size="xs"
              className="btn-square"
              onClick={onBulkAdd}
              title={`Bulk add ${label.toLowerCase()}`}
            >
              <ListPlus className="w-3.5 h-3.5" />
            </Button>
          )}
          {onAdd && (
            <Button
              variant="ghost"
              size="xs"
              className="btn-square"
              onClick={onAdd}
              title={`Add ${label.toLowerCase()}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Filter dropdown */}
      {showFilter && (
        <ColumnFilterDropdown
          filter={filter ?? { ...EMPTY_FILTER }}
          members={members}
          onChange={onFilterChange}
          onClose={() => setShowFilter(false)}
        />
      )}

      {/* List with Virtual Scrolling */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          // Only handle if not dropped on a specific task (bubbled up)
          if ((e.target as HTMLElement).closest("[data-task-drop]")) return;
          e.preventDefault();
          onDropOnColumn();
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-base-content/30" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 px-3">
            <p className="text-xs text-base-content/30">No tasks</p>
            {onAdd && (
              <Button
                variant="ghost"
                size="xs"
                className="mt-2"
                onClick={onAdd}
              >
                <Plus className="w-3 h-3" /> Add
              </Button>
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const task = tasks[virtualItem.index];
              const isSelected = task.id === selectedId;
              const isMultiSelected = multiSelected.has(task.id);
              const isDragOver = dragOverTaskId === task.id;
              const ids =
                task.assignee_ids ||
                (task.assignee_id ? [task.assignee_id] : []);
              const progress = task.progress ?? 0;
              const startStr = task.start_date
                ? new Date(task.start_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : null;
              const dueStr = task.due_date
                ? new Date(task.due_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : null;
              return (
                <button
                  key={task.id}
                  data-task-drop
                  draggable={canEdit}
                  onDragStart={(e) => {
                    if (!canEdit) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", task.id);
                    onDragStart(task);
                  }}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    onDragOverTask(task.id);
                  }}
                  onDragLeave={() => onDragOverTask(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropOnTask(task);
                  }}
                  onClick={() => {
                    if (bulkMode) {
                      onToggleSelect(task.id);
                    } else {
                      onSelect(task.id);
                    }
                  }}
                  onContextMenu={(e) => onTaskContextMenu(e, task)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className={cn(
                    "w-full text-left px-2 pt-1 pb-0.5 flex flex-col transition-all duration-200 border-l-2 border-b border-base-200/40 bg-base-100/20",
                    "hover:bg-base-100/50",
                    isSelected && !bulkMode
                      ? "bg-primary/15 border-l-primary"
                      : "border-l-transparent",
                    bulkMode &&
                      isMultiSelected &&
                      "bg-primary/15 border-l-primary",
                    isDragOver && "bg-accent/15 border-l-accent",
                  )}
                >
                  {/* Row 1: checkbox + status dot + title + avatars + chevron */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {bulkMode && (
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-primary shrink-0 [--chkfg:oklch(98%_0.005_270)]"
                        checked={isMultiSelected}
                        readOnly
                      />
                    )}
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        task.status === "done" && "bg-success",
                        task.status === "in_progress" && "bg-info",
                        task.status === "blocked" && "bg-error",
                        task.status === "todo" && "bg-base-content/20",
                      )}
                    />
                    <span className="text-sm truncate leading-tight flex-1 min-w-0">
                      {task.title}
                    </span>
                    <AvatarStack
                      members={members}
                      assigneeIds={ids}
                      max={3}
                      size="xs"
                    />
                    {task.depth < MAX_DEPTH && (
                      <ChevronRight className="w-3.5 h-3.5 text-base-content/20 shrink-0" />
                    )}
                  </div>

                  {/* Row 2: priority + dates */}
                  <div className="flex items-center gap-1.5 mt-px pl-[14px]">
                    <span
                      className={cn(
                        "text-[10px] leading-none px-1 py-0.5 rounded",
                        task.priority === "critical" &&
                          "bg-error/10 text-error",
                        task.priority === "high" &&
                          "bg-warning/10 text-warning",
                        task.priority === "medium" && "bg-info/10 text-info",
                        task.priority === "low" &&
                          "bg-base-200 text-base-content/50",
                      )}
                    >
                      {task.priority}
                    </span>
                    {task.review_status === "pending" && (
                      <PendingReviewBadge count={1} />
                    )}
                    {(startStr || dueStr) && (
                      <span className="text-[11px] font-medium text-base-content/60 truncate">
                        {startStr && dueStr
                          ? `${startStr} → ${dueStr}`
                          : startStr || dueStr}
                      </span>
                    )}
                  </div>

                  {/* Row 3: thin progress bar */}
                  <div className="w-full mt-auto">
                    <div className="w-full h-[2px] bg-base-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          progress >= 0.8
                            ? "bg-success"
                            : progress >= 0.4
                              ? "bg-info"
                              : progress > 0
                                ? "bg-warning"
                                : "bg-base-200",
                        )}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                  </div>
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
   Column Filter Dropdown (Excel-like)
   ═══════════════════════════════════════════════════════ */

function ColumnFilterDropdown({
  filter,
  members,
  onChange,
  onClose,
}: {
  filter: ColumnFilterState;
  members: ProjectMember[];
  onChange: (f: ColumnFilterState) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<ColumnFilterState>({ ...filter });
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const toggleStatus = (s: TaskStatus) => {
    setLocal((p) => ({
      ...p,
      statuses: p.statuses.includes(s)
        ? p.statuses.filter((x) => x !== s)
        : [...p.statuses, s],
    }));
  };

  const togglePriority = (pr: TaskPriority) => {
    setLocal((p) => ({
      ...p,
      priorities: p.priorities.includes(pr)
        ? p.priorities.filter((x) => x !== pr)
        : [...p.priorities, pr],
    }));
  };

  const toggleAssignee = (id: string) => {
    setLocal((p) => ({
      ...p,
      assigneeIds: p.assigneeIds.includes(id)
        ? p.assigneeIds.filter((x) => x !== id)
        : [...p.assigneeIds, id],
    }));
  };

  const applyFilter = () => {
    onChange(local);
    onClose();
  };

  const clearFilter = () => {
    onChange({ ...EMPTY_FILTER });
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute top-[38px] left-0 right-0 z-50 bg-base-100 border border-base-200 rounded-b-lg shadow-xl max-h-[60vh] overflow-y-auto"
    >
      <div className="p-2 space-y-2.5">
        {/* Search */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Search
          </label>
          <input
            type="text"
            className="input input-bordered input-xs w-full mt-0.5"
            placeholder="Filter by title..."
            value={local.search}
            onChange={(e) =>
              setLocal((p) => ({ ...p, search: e.target.value }))
            }
          />
        </div>

        {/* Status */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Status
          </label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {(["todo", "in_progress", "done", "blocked"] as const).map((s) => (
              <button
                key={s}
                className={cn(
                  "badge badge-sm cursor-pointer gap-1",
                  local.statuses.includes(s) ? "badge-primary" : "badge-ghost",
                )}
                onClick={() => toggleStatus(s)}
              >
                {s === "in_progress"
                  ? "In Progress"
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Priority
          </label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {(["critical", "high", "medium", "low"] as const).map((p) => (
              <button
                key={p}
                className={cn(
                  "badge badge-sm cursor-pointer gap-1",
                  local.priorities.includes(p)
                    ? "badge-primary"
                    : "badge-ghost",
                )}
                onClick={() => togglePriority(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Assignee
          </label>
          <div className="flex flex-col gap-0.5 mt-0.5 max-h-24 overflow-y-auto">
            <label className="flex items-center gap-1.5 cursor-pointer px-1 py-0.5 rounded hover:bg-base-200">
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary [--chkfg:oklch(98%_0.005_270)]"
                checked={local.assigneeIds.includes("")}
                onChange={() => toggleAssignee("")}
              />
              <span className="text-xs text-base-content/60">Unassigned</span>
            </label>
            {members.map((m) => (
              <label
                key={m.user_id}
                className="flex items-center gap-1.5 cursor-pointer px-1 py-0.5 rounded hover:bg-base-200"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary [--chkfg:oklch(98%_0.005_270)]"
                  checked={local.assigneeIds.includes(m.user_id)}
                  onChange={() => toggleAssignee(m.user_id)}
                />
                <span className="text-xs truncate">
                  {m.display_name || m.email || m.user_id.slice(0, 8)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Labels */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Labels
          </label>
          <input
            type="text"
            className="input input-bordered input-xs w-full mt-0.5"
            placeholder="label1, label2 (comma-separated)"
            value={local.labels.join(", ")}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                labels: e.target.value
                  .split(",")
                  .map((l) => l.trim())
                  .filter(Boolean),
              }))
            }
          />
        </div>

        {/* Due date range */}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[10px] font-semibold text-base-content/50 uppercase">
              Due From
            </label>
            <input
              type="date"
              className="input input-bordered input-xs w-full mt-0.5"
              value={local.dueDateFrom}
              onChange={(e) =>
                setLocal((p) => ({ ...p, dueDateFrom: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-base-content/50 uppercase">
              Due To
            </label>
            <input
              type="date"
              className="input input-bordered input-xs w-full mt-0.5"
              value={local.dueDateTo}
              onChange={(e) =>
                setLocal((p) => ({ ...p, dueDateTo: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 border-t border-base-200">
          <Button
            variant="primary"
            size="xs"
            className="flex-1"
            onClick={applyFilter}
          >
            Apply
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="flex-1"
            onClick={clearFilter}
          >
            Clear
          </Button>
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
  assignee_ids: string[];
  due_date: string;
  start_date: string;
  reporter_id: string;
  labels: string[];
}

function CreateTaskModal({
  orgId,
  projectId,
  parentId,
  parentTask,
  members,
  onClose,
  onCreated,
}: {
  orgId: string;
  projectId: string;
  parentId: string | null;
  parentTask: Task | null;
  members: ProjectMember[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors: formErrors },
  } = useForm<CreateForm>({
    defaultValues: {
      status: "todo",
      priority: parentTask?.priority || "medium",
      assignee_ids: parentTask?.assignee_ids?.length
        ? [...parentTask.assignee_ids]
        : [],
      due_date: parentTask?.due_date ? parentTask.due_date.slice(0, 10) : "",
      start_date: parentTask?.start_date
        ? parentTask.start_date.slice(0, 10)
        : "",
      reporter_id: parentTask?.reporter_id || "",
      labels: parentTask?.labels?.length ? [...parentTask.labels] : [],
    },
  });
  const send = useProjectTaskStore((s) => s.send);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [deadlineConflicts, setDeadlineConflicts] = useState<
    DeadlineConflict[]
  >([]);
  const [pendingPayload, setPendingPayload] = useState<Record<
    string,
    unknown
  > | null>(null);
  const watchedStatus = watch("status");
  const watchedPriority = watch("priority");
  const watchedAssignees = watch("assignee_ids");
  const watchedReporter = watch("reporter_id");

  const toggleAssignee = (userId: string) => {
    const current = watchedAssignees || [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    setValue("assignee_ids", next);
  };

  const submitPayload = async (payload: Record<string, unknown>) => {
    if (!send) return;
    setCreating(true);
    setError("");
    try {
      const result = await send("task:create", payload);
      // Check for deadline warning (no task returned, only conflicts)
      if (!result?.id && result?.deadline_conflicts?.length) {
        setDeadlineConflicts(result.deadline_conflicts);
        setPendingPayload(payload);
        setCreating(false);
        return;
      }
      const task = result?.id ? result : result?.task;
      if (task?.id) {
        const store = useProjectTaskStore.getState();
        const parentKey = parentId || "root";
        const existing = store.tasks.get(parentKey) || [];
        if (!existing.find((t: Task) => t.id === task.id)) {
          store.setTasks(
            parentKey,
            [...existing, task],
            (store.totals.get(parentKey) ?? 0) + 1,
          );
        }
        // Update ancestors if they were changed
        if (result?.ancestors_updated) {
          for (const anc of result.ancestors_updated) {
            store.upsertTask(anc);
          }
        }
      }
      onCreated();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  const onSubmit = async (data: CreateForm) => {
    const payload: Record<string, unknown> = {
      title: data.title,
      status: data.status,
      priority: data.priority,
    };
    if (data.assignee_ids?.length) {
      payload.assignee_ids = data.assignee_ids;
      payload.assignee_id = data.assignee_ids[0];
    }
    if (data.due_date) {
      payload.due_date = new Date(data.due_date).toISOString();
    }
    if (data.start_date) {
      payload.start_date = new Date(data.start_date).toISOString();
    }
    if (data.reporter_id) {
      payload.reporter_id = data.reporter_id;
    }
    if (data.labels?.length) {
      payload.labels = data.labels;
    }
    if (parentId) payload.parent_task_id = parentId;
    await submitPayload(payload);
  };

  const confirmExtendDeadlines = async () => {
    if (!pendingPayload) return;
    setDeadlineConflicts([]);
    await submitPayload({ ...pendingPayload, extend_parent_deadlines: true });
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={parentId ? "New Subtask" : "New Task"}
        className="max-w-md"
      >
        {error && (
          <Alert variant="error" className="mb-3 text-sm">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Input
            label="Title"
            placeholder="Task title"
            {...register("title", { required: "Title is required" })}
            error={formErrors.title?.message}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-base-content/50 block mb-1">
                Status
              </label>
              <ThemedDropdownSelect<TaskStatus>
                value={watchedStatus || "todo"}
                onChange={(v) => setValue("status", v, { shouldDirty: true })}
                options={[
                  { value: "todo", label: "Todo" },
                  { value: "in_progress", label: "In Progress" },
                  { value: "done", label: "Done" },
                  { value: "blocked", label: "Blocked" },
                ]}
                disabled={creating}
              />
            </div>
            <div>
              <label className="text-xs text-base-content/50 block mb-1">
                Priority
              </label>
              <ThemedDropdownSelect<TaskPriority>
                value={watchedPriority || "medium"}
                onChange={(v) => setValue("priority", v, { shouldDirty: true })}
                options={[
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
                disabled={creating}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-base-content/50 block mb-1">
                Start Date
              </label>
              <input
                type="date"
                className="input input-bordered input-sm w-full"
                {...register("start_date")}
              />
            </div>
            <div>
              <label className="text-xs text-base-content/50 block mb-1">
                Due Date
              </label>
              <input
                type="date"
                className="input input-bordered input-sm w-full"
                {...register("due_date")}
              />
            </div>
          </div>
          {/* Reporter */}
          <div>
            <label className="text-xs text-base-content/50 block mb-1">
              Reporter
            </label>
            <ThemedDropdownSelect<string>
              value={watchedReporter || ""}
              onChange={(v) =>
                setValue("reporter_id", v, { shouldDirty: true })
              }
              options={[
                { value: "", label: "None" },
                ...members.map((m) => ({
                  value: m.user_id,
                  label: m.display_name || m.email || m.user_id.slice(0, 12),
                })),
              ]}
              disabled={creating}
            />
          </div>
          {/* Multi-assignee selector */}
          <div>
            <label className="text-xs text-base-content/50 block mb-1">
              Assignees
            </label>
            <div className="border border-base-300/80 rounded-xl bg-base-100/20 max-h-32 overflow-y-auto p-1">
              {members.length === 0 && (
                <div className="px-3 py-2 text-xs text-base-content/40">
                  No members
                </div>
              )}
              {members.map((m) => (
                <label
                  key={m.user_id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 cursor-pointer text-sm transition-colors",
                    watchedAssignees?.includes(m.user_id)
                      ? "bg-primary/12"
                      : "hover:bg-base-200/55",
                  )}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs checkbox-primary [--chkfg:oklch(98%_0.005_270)]"
                    checked={watchedAssignees?.includes(m.user_id) || false}
                    onChange={() => toggleAssignee(m.user_id)}
                  />
                  <span className="truncate">
                    {m.display_name || m.email || m.user_id.slice(0, 12)}
                  </span>
                </label>
              ))}
            </div>
            {watchedAssignees?.length > 0 && (
              <div className="text-xs text-base-content/50 mt-1">
                {watchedAssignees.length} assignee
                {watchedAssignees.length !== 1 ? "s" : ""} selected
              </div>
            )}
          </div>
          {/* Labels */}
          <div>
            <label className="text-xs text-base-content/50 block mb-1">
              Labels
            </label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              placeholder="Comma-separated labels"
              {...register("labels", {
                setValueAs: (v: string | string[]) =>
                  Array.isArray(v)
                    ? v
                    : typeof v === "string" && v.trim()
                      ? v
                          .split(",")
                          .map((l) => l.trim())
                          .filter(Boolean)
                      : [],
              })}
              defaultValue={parentTask?.labels?.join(", ") || ""}
            />
          </div>
          {parentId && parentTask && (
            <div className="text-xs text-base-content/40 italic">
              Inherited from parent: {parentTask.title}
            </div>
          )}
          <div className="modal-action">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {deadlineConflicts.length > 0 && (
        <dialog
          className="modal modal-open"
          style={{ backgroundColor: "transparent" }}
        >
          <div className="modal-box shadow-2xl max-w-md">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="text-warning">⚠</span> Date Range Conflict
            </h3>
            <div className="py-3 space-y-2 text-sm">
              <p className="text-base-content/70">
                The due date extends beyond {deadlineConflicts.length} parent
                task{deadlineConflicts.length !== 1 ? "s" : ""}:
              </p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {deadlineConflicts.map((c) => (
                  <li key={c.task_id} className="text-base-content/60">
                    {c.title}{" "}
                    <span className="text-warning">
                      (due{" "}
                      {c.due_date
                        ? new Date(c.due_date).toLocaleDateString()
                        : "—"}
                      )
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-base-content/50 text-xs pt-1">
                Apply to extend parent deadlines to accommodate this task.
              </p>
            </div>
            <div className="modal-action">
              <Button
                size="sm"
                onClick={() => {
                  setDeadlineConflicts([]);
                  setPendingPayload(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="warning"
                onClick={confirmExtendDeadlines}
              >
                Apply &amp; Extend
              </Button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            style={{ background: "transparent" }}
            onClick={() => {
              setDeadlineConflicts([]);
              setPendingPayload(null);
            }}
          />
        </dialog>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   Bulk Create Tasks Modal
   ═══════════════════════════════════════════════════════ */

type SeparatorType = "newline" | "comma" | "semicolon" | "custom";

const SEPARATOR_OPTIONS: { value: SeparatorType; label: string }[] = [
  { value: "newline", label: "New Line" },
  { value: "comma", label: "Comma (,)" },
  { value: "semicolon", label: "Semicolon (;)" },
  { value: "custom", label: "Custom…" },
];

function ThemedDropdownSelect<T extends string>({
  value,
  onChange,
  options,
  disabled,
  widthClass = "w-full",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  widthClass?: string;
}) {
  const selectedLabel =
    options.find((o) => o.value === value)?.label || options[0]?.label || "";

  return (
    <details
      className={cn(
        "dropdown dropdown-bottom relative",
        widthClass,
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <summary
        className={cn(
          "bulk-create-select inline-flex h-9 min-h-9 w-full cursor-pointer list-none items-center justify-between rounded-xl border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md",
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5 text-base-content/60"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <ul
        className="dropdown-content task-status-menu z-[220] mt-1 max-h-64 w-full overflow-y-auto rounded-xl border p-1 shadow-xl backdrop-blur-2xl" /* z: themed select dropdown */
      >
        {options.map((opt) => (
          <li key={opt.value}>
            <button
              type="button"
              className={cn(
                "task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                value === opt.value
                  ? "task-status-item-active"
                  : "text-base-content/80 hover:bg-base-200/35",
              )}
              onClick={(e) => {
                onChange(opt.value);
                const details = e.currentTarget.closest("details");
                if (details) details.removeAttribute("open");
              }}
            >
              <span className="truncate">{opt.label}</span>
              {value === opt.value ? <span className="text-xs">✓</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function BulkCreateTaskModal({
  projectId: _projectId,
  parentId,
  members,
  onClose,
}: {
  projectId: string;
  parentId: string | null;
  members: ProjectMember[];
  onClose: () => void;
}) {
  const send = useProjectTaskStore((s) => s.send);

  // Input state
  const [rawText, setRawText] = useState("");
  const [separatorType, setSeparatorType] = useState<SeparatorType>("newline");
  const [customSeparator, setCustomSeparator] = useState("");

  // Shared properties
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");

  // Progress
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  // Parse titles (with dedup)
  const parsedTitles = useMemo(() => {
    if (!rawText.trim()) return [];
    let sep: string;
    switch (separatorType) {
      case "newline":
        sep = "\n";
        break;
      case "comma":
        sep = ",";
        break;
      case "semicolon":
        sep = ";";
        break;
      case "custom":
        sep = customSeparator || "\n";
        break;
    }
    const titles = rawText
      .split(sep)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    // Deduplicate (case-insensitive, keep first occurrence)
    const seen = new Set<string>();
    return titles.filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawText, separatorType, customSeparator]);

  // Count duplicates removed
  const rawCount = useMemo(() => {
    if (!rawText.trim()) return 0;
    let sep: string;
    switch (separatorType) {
      case "newline":
        sep = "\n";
        break;
      case "comma":
        sep = ",";
        break;
      case "semicolon":
        sep = ";";
        break;
      case "custom":
        sep = customSeparator || "\n";
        break;
    }
    return rawText
      .split(sep)
      .map((t) => t.trim())
      .filter((t) => t.length > 0).length;
  }, [rawText, separatorType, customSeparator]);

  const dupsRemoved = rawCount - parsedTitles.length;

  const handleCreate = async () => {
    if (!send || parsedTitles.length === 0) return;
    setCreating(true);
    setErrors([]);
    setProgress({ done: 0, total: parsedTitles.length });

    try {
      const payload: Record<string, unknown> = {
        titles: parsedTitles,
        priority,
      };
      if (assigneeId) payload.assignee_id = assigneeId;
      if (parentId) payload.parent_task_id = parentId;
      if (dueDate) payload.due_date = new Date(dueDate).toISOString();

      const result = await send("task:bulk-create", payload);
      const tasks: Task[] = Array.isArray(result) ? result : [];

      // Broadcast excludes sender → add all to store directly
      const store = useProjectTaskStore.getState();
      const parentKey = parentId || "root";
      const existing = store.tasks.get(parentKey) || [];
      const existingIds = new Set(existing.map((t: Task) => t.id));
      const newTasks = tasks.filter((t: Task) => !existingIds.has(t.id));
      if (newTasks.length > 0) {
        store.setTasks(
          parentKey,
          [...existing, ...newTasks],
          (store.totals.get(parentKey) ?? 0) + newTasks.length,
        );
      }

      setProgress({ done: parsedTitles.length, total: parsedTitles.length });
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      setErrors([msg]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open
      onClose={creating ? () => {} : onClose}
      title={parentId ? "Bulk Create Subtasks" : "Bulk Create Tasks"}
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* Paste area */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Paste task titles</span>
            <span className="label-text-alt text-base-content/50">
              {parsedTitles.length} task{parsedTitles.length !== 1 ? "s" : ""}{" "}
              detected
              {dupsRemoved > 0 && (
                <span className="text-warning ml-1">
                  ({dupsRemoved} duplicate{dupsRemoved !== 1 ? "s" : ""}{" "}
                  removed)
                </span>
              )}
            </span>
          </label>
          <textarea
            className="textarea textarea-bordered w-full min-h-[120px] font-mono text-sm"
            placeholder={"Task 1\nTask 2\nTask 3"}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            disabled={creating}
            autoFocus
          />
        </div>

        {/* Separator */}
        <div className="flex gap-3 items-end">
          <div className="form-control flex-1">
            <label className="label">
              <span className="label-text">Separator</span>
            </label>
            <ThemedDropdownSelect<SeparatorType>
              value={separatorType}
              onChange={setSeparatorType}
              options={SEPARATOR_OPTIONS}
              disabled={creating}
            />
          </div>
          {separatorType === "custom" && (
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">Custom separator</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="e.g. | or //"
                value={customSeparator}
                onChange={(e) => setCustomSeparator(e.target.value)}
                disabled={creating}
              />
            </div>
          )}
        </div>

        {/* Preview */}
        {parsedTitles.length > 0 && (
          <div className="border border-base-200 rounded-lg max-h-32 overflow-y-auto">
            <div className="px-3 py-1.5 bg-base-200/50 text-xs font-medium text-base-content/60 sticky top-0">
              Preview ({parsedTitles.length})
            </div>
            {parsedTitles.map((t, i) => (
              <div
                key={i}
                className="px-3 py-1 text-sm border-t border-base-200/50 flex items-center gap-2"
              >
                <span className="text-base-content/40 text-xs w-5 text-right shrink-0">
                  {i + 1}.
                </span>
                <span className="truncate">{t}</span>
              </div>
            ))}
          </div>
        )}

        {/* Shared properties */}
        <details className="collapse collapse-arrow overflow-visible border border-base-200 rounded-lg">
          <summary className="collapse-title text-sm font-medium py-2 min-h-0">
            Properties (applied to all)
          </summary>
          <div className="collapse-content overflow-visible space-y-3 pb-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-0.5">
                  <span className="label-text text-xs">Status</span>
                </label>
                <ThemedDropdownSelect<TaskStatus>
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "todo", label: "Todo" },
                    { value: "in_progress", label: "In Progress" },
                    { value: "done", label: "Done" },
                    { value: "blocked", label: "Blocked" },
                  ]}
                  disabled={creating}
                />
              </div>
              <div className="form-control">
                <label className="label py-0.5">
                  <span className="label-text text-xs">Priority</span>
                </label>
                <ThemedDropdownSelect<TaskPriority>
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: "critical", label: "Critical" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                  disabled={creating}
                />
              </div>
            </div>
            <div className="form-control">
              <label className="label py-0.5">
                <span className="label-text text-xs">Assignee</span>
              </label>
              <ThemedDropdownSelect<string>
                value={assigneeId}
                onChange={setAssigneeId}
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({
                    value: m.user_id,
                    label: m.display_name || m.email || m.user_id.slice(0, 12),
                  })),
                ]}
                disabled={creating}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-0.5">
                  <span className="label-text text-xs">Due Date</span>
                </label>
                <input
                  type="date"
                  className="input input-bordered input-sm w-full"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="form-control">
                <label className="label py-0.5">
                  <span className="label-text text-xs">Est. Hours</span>
                </label>
                <input
                  type="number"
                  className="input input-bordered input-sm w-full"
                  placeholder="0"
                  min="0"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  disabled={creating}
                />
              </div>
            </div>
          </div>
        </details>

        {/* Progress bar */}
        {creating && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-base-content/60">
              <span>Creating tasks…</span>
              <span>
                {progress.done}/{progress.total}
              </span>
            </div>
            <progress
              className="progress progress-primary w-full"
              value={progress.done}
              max={progress.total}
            />
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <Alert variant="error" className="text-sm">
            <p className="font-medium">
              Failed to create {errors.length} task
              {errors.length !== 1 ? "s" : ""}:
            </p>
            <ul className="list-disc list-inside mt-1 text-xs">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* Actions */}
        <div className="modal-action">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={parsedTitles.length === 0 || creating}
            loading={creating}
          >
            <ListPlus className="w-4 h-4" />
            Create {parsedTitles.length} Task
            {parsedTitles.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
