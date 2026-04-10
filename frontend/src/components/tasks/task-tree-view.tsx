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
import { Avatar, Badge, ConfirmDialog } from "@/components/ui/shared";
import { useProjectPolicies } from "@/hooks/use-policies";
import { useReviewableFields } from "@/hooks/use-reviewable-fields";
import { PRIORITY_BADGE } from "@/lib/task-colors";
import { cn, formatDate, statusLabel } from "@/lib/utils";
import { useProjectTaskStore } from "@/stores/project-task-store";
import type {
  ProjectMember,
  Task,
  TaskPriority,
  TaskStatus,
  TaskTree,
  TaskUpdateResult,
} from "@/types/domain";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════
   Task Tree View — Collapsible hierarchical tree with inline editing
   ═══════════════════════════════════════════════════════ */

interface TaskTreeViewProps {
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
  onOpenTask?: (taskId: string) => void;
  globalFilter?: GlobalFilterState;
}

export function TaskTreeView({
  orgId,
  orgSlug,
  projectId,
  members,
  onOpenTask,
  globalFilter,
}: TaskTreeViewProps) {
  const send = useProjectTaskStore((s) => s.send);
  const taskTree = useProjectTaskStore((s) => s.taskTree);
  const policies = useProjectPolicies(projectId);
  const { hasReviewPipeline, isReviewable } = useReviewableFields(projectId);
  const canDirectUpdate = policies.canDirectUpdate;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [pendingReviewResult, setPendingReviewResult] =
    useState<TaskUpdateResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Change request modal state
  const [crModal, setCrModal] = useState<{
    taskId: string;
    changes: Partial<Task>;
  } | null>(null);

  // Track last fetch time so re-mounting (tab switch) doesn't re-fetch within 30s.
  const lastFetchedAt = useRef<number>(0);
  const TREE_STALE_MS = 30_000;

  // Fetch tree via WS
  const fetchTree = useCallback(
    async (force = false) => {
      if (!send) return;
      // Skip if data is fresh and we have results already
      if (
        !force &&
        taskTree.length > 0 &&
        Date.now() - lastFetchedAt.current < TREE_STALE_MS
      ) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await send("task:tree", {});
        useProjectTaskStore.getState().setTaskTree(data || []);
        lastFetchedAt.current = Date.now();
      } catch {
        // WS task:tree failed
      } finally {
        setIsLoading(false);
      }
    },
    [send, taskTree.length],
  );

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!taskTree.length) return;
    const allIds = new Set<string>();
    const collect = (nodes: TaskTree[]) => {
      for (const n of nodes) {
        if (n.children?.length) {
          allIds.add(n.task.id);
          collect(n.children);
        }
      }
    };
    collect(taskTree);
    setExpandedIds(allIds);
  }, [taskTree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleUpdate = useCallback(
    async (taskId: string, data: Partial<Task>) => {
      if (!send) return;
      try {
        // Find the task in the tree to get version for optimistic concurrency
        const findTask = (nodes: TaskTree[]): Task | undefined => {
          for (const n of nodes) {
            if (n.task.id === taskId) return n.task;
            if (n.children) {
              const found = findTask(n.children);
              if (found) return found;
            }
          }
          return undefined;
        };
        const currentTask = findTask(taskTree);
        const result = await send("task:update", {
          task_id: taskId,
          base_version: currentTask?.version ?? 0,
          ...data,
        });
        // Handle pending review — open modal so user can submit the CR properly
        if (result?.pending_review) {
          setCrModal({ taskId, changes: data });
          return;
        }
        fetchTree();
      } catch (e) {
        if (e instanceof Error && e.message) {
          setUpdateError(e.message);
        }
      }
    },
    [send, fetchTree, taskTree],
  );

  /** Intercepts updates — users without direct_update always go through CR modal */
  const handleUpdateWithReviewCheck = useCallback(
    (taskId: string, data: Partial<Task>) => {
      if (!canDirectUpdate && Object.keys(data).length > 0) {
        setCrModal({ taskId, changes: data });
        return;
      }
      handleUpdate(taskId, data);
    },
    [canDirectUpdate, handleUpdate],
  );

  const handleDelete = useCallback(
    async (taskId: string) => {
      if (!send) return;
      setMutating(true);
      try {
        await send("task:delete", { task_id: taskId });
        setDeleteTask(null);
        fetchTree();
      } catch (e) {
      } finally {
        setMutating(false);
      }
    },
    [send, fetchTree],
  );

  const handleDuplicate = useCallback(
    async (taskId: string) => {
      if (!send) return;
      try {
        await send("task:duplicate", { task_id: taskId });
        fetchTree();
      } catch (e) {}
    },
    [send, fetchTree],
  );

  const tree = taskTree;

  // Apply global filter recursively (memoized) — must be before any early return
  const hasFilter = globalFilter && isGlobalFilterActive(globalFilter);
  const filteredTree = useMemo(() => {
    const filterTree = (nodes: TaskTree[]): TaskTree[] => {
      if (!globalFilter || !isGlobalFilterActive(globalFilter)) return nodes;
      return nodes.reduce<TaskTree[]>((acc, node) => {
        const t = node.task;
        let match = true;
        if (globalFilter.assigneeIds.length > 0) {
          const ids = t.assignee_ids?.length
            ? t.assignee_ids
            : t.assignee_id
              ? [t.assignee_id]
              : [];
          const matchesUnassigned =
            globalFilter.assigneeIds.includes("") && ids.length === 0;
          const matchesAny = ids.some((id) =>
            globalFilter.assigneeIds.includes(id),
          );
          if (!matchesUnassigned && !matchesAny) match = false;
        }
        if (
          globalFilter.statuses.length > 0 &&
          !globalFilter.statuses.includes(t.status)
        )
          match = false;
        if (
          globalFilter.priorities.length > 0 &&
          !globalFilter.priorities.includes(t.priority)
        )
          match = false;
        if (globalFilter.labels.length > 0) {
          if (
            !t.labels ||
            !t.labels.some((l) => globalFilter.labels.includes(l))
          )
            match = false;
        }
        if (
          globalFilter.dueDateFrom &&
          (!t.due_date || t.due_date < globalFilter.dueDateFrom)
        )
          match = false;
        if (
          globalFilter.dueDateTo &&
          (!t.due_date || t.due_date > globalFilter.dueDateTo)
        )
          match = false;
        if (globalFilter.search) {
          const q = globalFilter.search.toLowerCase();
          if (!t.title.toLowerCase().includes(q)) match = false;
        }
        const filteredChildren = node.children ? filterTree(node.children) : [];
        if (match || filteredChildren.length > 0) {
          acc.push({ ...node, children: filteredChildren });
        }
        return acc;
      }, []);
    };
    return filterTree(tree);
  }, [tree, globalFilter]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (filteredTree.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-base-content/60">
        <p className="mb-4">
          {hasFilter
            ? "No tasks match the current filters."
            : "No tasks yet. Create your first task to get started."}
        </p>
        {!hasFilter && policies.canCreateTask && (
          <CreateTaskButton parentId={null} onCreated={fetchTree} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Floating overlays */}
      <ChangeRequestToast
        result={pendingReviewResult}
        onDismiss={() => setPendingReviewResult(null)}
      />
      {updateError && (
        <Alert
          variant="error"
          className="shadow-lg text-sm"
          onDismiss={() => setUpdateError(null)}
        >
          {updateError}
        </Alert>
      )}
      {crModal &&
        (() => {
          const findTaskInTree = (nodes: TaskTree[]): Task | undefined => {
            for (const n of nodes) {
              if (n.task.id === crModal.taskId) return n.task;
              if (n.children) {
                const found = findTaskInTree(n.children);
                if (found) return found;
              }
            }
            return undefined;
          };
          const crTask = findTaskInTree(taskTree);
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

      {/* Toolbar — fixed, not scrollable */}
      <div className="flex flex-shrink-0 items-center justify-between px-3 py-2 border-b border-base-200/55">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
        {policies.canCreateTask && (
          <CreateTaskButton parentId={null} onCreated={fetchTree} />
        )}
      </div>

      {/* Scrollable tree content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="divide-y divide-base-200/55">
          {filteredTree.map((node) => (
            <TreeNode
              key={node.task.id}
              node={node}
              depth={0}
              orgId={orgId}
              orgSlug={orgSlug}
              projectId={projectId}
              members={members}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onUpdate={(taskId, data) =>
                handleUpdateWithReviewCheck(taskId, data)
              }
              onDelete={(task) => setDeleteTask(task)}
              onDuplicate={(taskId) => handleDuplicate(taskId)}
              onOpenTask={onOpenTask}
              onCreated={fetchTree}
              canEdit={policies.canEditTask}
              canDelete={policies.canDeleteTask}
              canCreate={policies.canCreateTask}
            />
          ))}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTask}
        title="Delete Task"
        message={`Delete "${deleteTask?.title}"? This will also delete all subtasks.`}
        onConfirm={() => deleteTask && handleDelete(deleteTask.id)}
        onClose={() => setDeleteTask(null)}
      />
    </div>
  );
}

/* ── Single Tree Node ── */

interface TreeNodeProps {
  node: TaskTree;
  depth: number;
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onUpdate: (taskId: string, data: Partial<Task>) => void;
  onDelete: (task: Task) => void;
  onDuplicate: (taskId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreated: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canCreate?: boolean;
}

function TreeNode({
  node,
  depth,
  orgId,
  orgSlug,
  projectId,
  members,
  expandedIds,
  toggleExpand,
  onUpdate,
  onDelete,
  onDuplicate,
  onOpenTask,
  onCreated,
  canEdit = true,
  canDelete = true,
  canCreate = true,
}: TreeNodeProps) {
  const { task, children } = node;
  const hasChildren = children && children.length > 0;
  const isExpanded = expandedIds.has(task.id);

  const assignee = members.find((m) => m.user_id === task.assignee_id);

  return (
    <>
      <div
        className={cn(
          "relative flex items-center gap-2 px-3 py-2 hover:bg-base-200/35 transition-colors group",
        )}
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        {/* Content wrapper — opacity is applied HERE, not on the outer row, so the
            dropdown is NOT inside the opacity stacking context and can escape it */}
        <div
          className={cn(
            "flex items-center gap-2 flex-1 min-w-0",
            task.status === "done" && "opacity-60",
          )}
        >
          {/* Expand/collapse toggle */}
          <Button
            variant="ghost"
            size="xs"
            className={cn("btn-square", !hasChildren && "invisible")}
            onClick={() => toggleExpand(task.id)}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>

          {/* Status indicator */}
          <StatusDropdown
            status={task.status}
            onChange={(status) => onUpdate(task.id, { status })}
            disabled={!canEdit}
          />

          {/* Title — click to expand/collapse if has children */}
          <button
            onClick={() => {
              if (hasChildren) {
                toggleExpand(task.id);
              } else if (onOpenTask) {
                onOpenTask(task.id);
              }
            }}
            className="flex-1 min-w-0 truncate font-medium hover:text-primary hover:underline text-left"
          >
            {task.title}
          </button>

          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex gap-1">
              {task.labels.slice(0, 2).map((label) => (
                <span key={label} className="badge badge-sm badge-outline">
                  {label}
                </span>
              ))}
              {task.labels.length > 2 && (
                <span className="badge badge-sm badge-ghost">
                  +{task.labels.length - 2}
                </span>
              )}
            </div>
          )}

          {/* Priority */}
          <PriorityDropdown
            priority={task.priority}
            onChange={(priority) => onUpdate(task.id, { priority })}
            disabled={!canEdit}
          />

          {/* Pending review */}
          {task.review_status === "pending" && <PendingReviewBadge count={1} />}

          {/* Due date */}
          {task.due_date && (
            <span className="text-xs text-base-content/60 whitespace-nowrap">
              {formatDate(task.due_date)}
            </span>
          )}

          {/* Assignee */}
          {assignee && (
            <Avatar
              src={assignee.avatar_url}
              name={assignee.display_name || assignee.email}
              size="sm"
            />
          )}

          {/* Child count indicator */}
          {hasChildren && (
            <span className="badge badge-ghost badge-sm">
              {children!.length}
            </span>
          )}
        </div>
        {/* end content wrapper */}

        {/* Actions dropdown */}
        <div className="dropdown dropdown-end opacity-0 group-hover:opacity-100 transition-opacity">
          <div
            tabIndex={0}
            role="button"
            className="btn btn-ghost btn-xs btn-square"
          >
            <MoreHorizontal className="w-4 h-4" />
          </div>
          <ul
            tabIndex={0}
            className="dropdown-content z-[999] menu p-2 shadow-lg bg-base-100/95 backdrop-blur-[20px] rounded-xl w-44 border border-base-200/55" /* z: action dropdown overlay */
          >
            <li>
              <a onClick={() => (onOpenTask ? onOpenTask(task.id) : undefined)}>
                <ExternalLink className="w-4 h-4" /> Open
              </a>
            </li>
            {canEdit && (
              <li>
                <a onClick={() => onDuplicate(task.id)}>
                  <Copy className="w-4 h-4" /> Duplicate
                </a>
              </li>
            )}
            {canCreate && (
              <li>
                <CreateSubtaskButton parentId={task.id} onCreated={onCreated} />
              </li>
            )}
            {canDelete && (
              <>
                <div className="divider my-1" />
                <li>
                  <a onClick={() => onDelete(task)} className="text-error">
                    <Trash2 className="w-4 h-4" /> Delete
                  </a>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>

      {/* Render children if expanded */}
      {isExpanded && hasChildren && (
        <div>
          {children!.map((child) => (
            <TreeNode
              key={child.task.id}
              node={child}
              depth={depth + 1}
              orgId={orgId}
              orgSlug={orgSlug}
              projectId={projectId}
              members={members}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onOpenTask={onOpenTask}
              onCreated={onCreated}
              canEdit={canEdit}
              canDelete={canDelete}
              canCreate={canCreate}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ── Status Dropdown ── */

function StatusDropdown({
  status,
  onChange,
  disabled,
}: {
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
  disabled?: boolean;
}) {
  const statuses: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];

  if (disabled) {
    return (
      <div className="btn btn-ghost btn-xs btn-square cursor-default">
        <Circle
          className={cn(
            "w-4 h-4",
            status === "todo" && "text-base-content/40",
            status === "in_progress" && "text-info fill-info",
            status === "done" && "text-success fill-success",
            status === "blocked" && "text-error fill-error",
          )}
        />
      </div>
    );
  }

  return (
    <div className="dropdown">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-xs btn-square"
      >
        <Circle
          className={cn(
            "w-4 h-4",
            status === "todo" && "text-base-content/40",
            status === "in_progress" && "text-info fill-info",
            status === "done" && "text-success fill-success",
            status === "blocked" && "text-error fill-error",
          )}
        />
      </div>
      <ul
        tabIndex={0}
        className="dropdown-content z-[999] menu p-1 shadow-lg bg-base-100/95 backdrop-blur-[20px] rounded-xl w-32 border border-base-200/55" /* z: status dropdown overlay */
      >
        {statuses.map((s) => (
          <li key={s}>
            <a
              onClick={() => onChange(s)}
              className={cn(status === s && "font-bold")}
            >
              <Circle
                className={cn(
                  "w-3 h-3",
                  s === "todo" && "text-base-content/40",
                  s === "in_progress" && "text-info fill-info",
                  s === "done" && "text-success fill-success",
                  s === "blocked" && "text-error fill-error",
                )}
              />
              {statusLabel(s)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Priority Dropdown ── */

function PriorityDropdown({
  priority,
  onChange,
  disabled,
}: {
  priority: TaskPriority;
  onChange: (p: TaskPriority) => void;
  disabled?: boolean;
}) {
  const priorities: TaskPriority[] = ["critical", "high", "medium", "low"];

  if (disabled) {
    return <Badge variant={PRIORITY_BADGE[priority]}>{priority}</Badge>;
  }

  return (
    <div className="dropdown">
      <div tabIndex={0} role="button">
        <Badge variant={PRIORITY_BADGE[priority]} className="cursor-pointer">
          {priority}
        </Badge>
      </div>
      <ul
        tabIndex={0}
        className="dropdown-content z-[999] menu p-1 shadow-lg bg-base-100/95 backdrop-blur-[20px] rounded-xl w-28 border border-base-200/55" /* z: priority dropdown overlay */
      >
        {priorities.map((p) => (
          <li key={p}>
            <a
              onClick={() => onChange(p)}
              className={cn(priority === p && "font-bold")}
            >
              <Badge variant={PRIORITY_BADGE[p]} className="badge-sm">
                {p}
              </Badge>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Create Task Button ── */

function CreateTaskButton({
  parentId,
  onCreated,
}: {
  parentId: string | null;
  onCreated: () => void;
}) {
  const send = useProjectTaskStore((s) => s.send);
  const [title, setTitle] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const handleCreate = async () => {
    if (!send || !title.trim()) return;
    setPending(true);
    try {
      await send("task:create", {
        title: title.trim(),
        parent_task_id: parentId,
      });
      setTitle("");
      setIsOpen(false);
      onCreated();
    } catch (e) {
    } finally {
      setPending(false);
    }
  };

  if (!isOpen) {
    return (
      <Button size="sm" onClick={() => setIsOpen(true)}>
        <Plus className="w-4 h-4 mr-1" />{" "}
        {parentId ? "Add Subtask" : "Add Task"}
      </Button>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        className="input input-sm input-bordered flex-1"
        placeholder={parentId ? "Subtask title..." : "Task title..."}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            handleCreate();
          }
          if (e.key === "Escape") {
            setTitle("");
            setIsOpen(false);
          }
        }}
        autoFocus
      />
      <Button
        size="sm"
        onClick={handleCreate}
        disabled={!title.trim() || pending}
      >
        Create
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setTitle("");
          setIsOpen(false);
        }}
      >
        Cancel
      </Button>
    </div>
  );
}

/* ── Inline Subtask Button (for dropdown) ── */

function CreateSubtaskButton({
  parentId,
  onCreated,
}: {
  parentId: string;
  onCreated: () => void;
}) {
  const send = useProjectTaskStore((s) => s.send);

  const handleCreate = async () => {
    if (!send) return;
    try {
      await send("task:create", {
        title: "New subtask",
        parent_task_id: parentId,
      });
      onCreated();
    } catch (e) {}
  };

  return (
    <a onClick={handleCreate}>
      <Plus className="w-4 h-4" /> Add Subtask
    </a>
  );
}
