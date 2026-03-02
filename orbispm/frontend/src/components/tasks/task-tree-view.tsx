"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Avatar, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Trash2,
  Copy,
  ExternalLink,
  Circle,
} from "lucide-react";
import {
  priorityColor,
  statusLabel,
  formatDate,
  cn,
} from "@/lib/utils";
import type { Task, TaskTree, ProjectMember, TaskStatus, TaskPriority } from "@/types/domain";

/* ═══════════════════════════════════════════════════════
   Task Tree View — Collapsible hierarchical tree with inline editing
   ═══════════════════════════════════════════════════════ */

interface TaskTreeViewProps {
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: ProjectMember[];
}

export function TaskTreeView({ orgId, orgSlug, projectId, members }: TaskTreeViewProps) {
  const qc = useQueryClient();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);

  const { data: treeData, isLoading } = useQuery({
    queryKey: ["tasks-tree", orgId, projectId],
    queryFn: () => api.tasks.tree(orgId, projectId),
    staleTime: 30_000,
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!treeData) return;
    const allIds = new Set<string>();
    const collect = (nodes: TaskTree[]) => {
      for (const n of nodes) {
        if (n.children?.length) {
          allIds.add(n.task.id);
          collect(n.children);
        }
      }
    };
    collect(treeData);
    setExpandedIds(allIds);
  }, [treeData]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const updateMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Partial<Task> }) =>
      api.tasks.update(orgId, projectId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks-tree", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => api.tasks.delete(orgId, projectId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks-tree", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
      setDeleteTask(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (taskId: string) => api.tasks.duplicate(orgId, projectId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks-tree", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const tree = treeData || [];

  if (tree.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/60">
        <p className="mb-4">No tasks yet. Create your first task to get started.</p>
        <CreateTaskButton orgId={orgId} projectId={projectId} parentId={null} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
        <CreateTaskButton orgId={orgId} projectId={projectId} parentId={null} />
      </div>

      {/* Tree container */}
      <div className="border border-base-300 rounded-lg bg-base-100 overflow-hidden">
        <div className="divide-y divide-base-200">
          {tree.map((node) => (
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
              onUpdate={(taskId, data) => updateMutation.mutate({ taskId, data })}
              onDelete={(task) => setDeleteTask(task)}
              onDuplicate={(taskId) => duplicateMutation.mutate(taskId)}
            />
          ))}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTask}
        title="Delete Task"
        message={`Delete "${deleteTask?.title}"? This will also delete all subtasks.`}
        onConfirm={() => deleteTask && deleteMutation.mutate(deleteTask.id)}
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
}: TreeNodeProps) {
  const { task, children } = node;
  const hasChildren = children && children.length > 0;
  const isExpanded = expandedIds.has(task.id);

  const assignee = members.find((m) => m.user_id === task.assignee_id);

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 hover:bg-base-200/50 transition-colors group",
          task.status === "done" && "opacity-60"
        )}
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        {/* Expand/collapse toggle */}
        <button
          className={cn(
            "btn btn-ghost btn-xs btn-square",
            !hasChildren && "invisible"
          )}
          onClick={() => toggleExpand(task.id)}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Status indicator */}
        <StatusDropdown
          status={task.status}
          onChange={(status) => onUpdate(task.id, { status })}
        />

        {/* Title */}
        <Link
          href={`/${orgSlug}/projects/${projectId}/tasks/${task.id}`}
          className="flex-1 min-w-0 truncate font-medium hover:text-primary hover:underline"
        >
          {task.title}
        </Link>

        {/* Labels */}
        {task.labels && task.labels.length > 0 && (
          <div className="flex gap-1">
            {task.labels.slice(0, 2).map((label) => (
              <span
                key={label}
                className="badge badge-sm badge-outline"
              >
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
        />

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

        {/* Actions dropdown */}
        <div className="dropdown dropdown-end opacity-0 group-hover:opacity-100 transition-opacity">
          <div tabIndex={0} role="button" className="btn btn-ghost btn-xs btn-square">
            <MoreHorizontal className="w-4 h-4" />
          </div>
          <ul tabIndex={0} className="dropdown-content z-10 menu p-2 shadow bg-base-100 rounded-box w-44">
            <li>
              <Link href={`/${orgSlug}/projects/${projectId}/tasks/${task.id}`}>
                <ExternalLink className="w-4 h-4" /> Open
              </Link>
            </li>
            <li>
              <a onClick={() => onDuplicate(task.id)}>
                <Copy className="w-4 h-4" /> Duplicate
              </a>
            </li>
            <li>
              <CreateSubtaskButton orgId={orgId} projectId={projectId} parentId={task.id} />
            </li>
            <div className="divider my-1" />
            <li>
              <a onClick={() => onDelete(task)} className="text-error">
                <Trash2 className="w-4 h-4" /> Delete
              </a>
            </li>
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
}: {
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  const statuses: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];

  return (
    <div className="dropdown">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-xs btn-square">
        <Circle
          className={cn(
            "w-4 h-4",
            status === "todo" && "text-base-content/40",
            status === "in_progress" && "text-info fill-info",
            status === "done" && "text-success fill-success",
            status === "blocked" && "text-error fill-error"
          )}
        />
      </div>
      <ul tabIndex={0} className="dropdown-content z-10 menu p-1 shadow bg-base-100 rounded-box w-32">
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
                  s === "blocked" && "text-error fill-error"
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
}: {
  priority: TaskPriority;
  onChange: (p: TaskPriority) => void;
}) {
  const priorities: TaskPriority[] = ["critical", "high", "medium", "low"];

  return (
    <div className="dropdown">
      <div tabIndex={0} role="button">
        <Badge variant={priorityColor(priority)} className="cursor-pointer">
          {priority}
        </Badge>
      </div>
      <ul tabIndex={0} className="dropdown-content z-10 menu p-1 shadow bg-base-100 rounded-box w-28">
        {priorities.map((p) => (
          <li key={p}>
            <a
              onClick={() => onChange(p)}
              className={cn(priority === p && "font-bold")}
            >
              <Badge variant={priorityColor(p)} className="badge-sm">
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
  orgId,
  projectId,
  parentId,
}: {
  orgId: string;
  projectId: string;
  parentId: string | null;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { title: string; parent_task_id?: string | null }) =>
      api.tasks.create(orgId, projectId, data as Partial<Task>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks-tree", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
      setTitle("");
      setIsOpen(false);
    },
  });

  if (!isOpen) {
    return (
      <Button size="sm" onClick={() => setIsOpen(true)}>
        <Plus className="w-4 h-4 mr-1" /> {parentId ? "Add Subtask" : "Add Task"}
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
            createMutation.mutate({
              title: title.trim(),
              parent_task_id: parentId,
            });
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
        onClick={() => {
          if (title.trim()) {
            createMutation.mutate({
              title: title.trim(),
              parent_task_id: parentId,
            });
          }
        }}
        disabled={!title.trim() || createMutation.isPending}
      >
        Create
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setTitle(""); setIsOpen(false); }}>
        Cancel
      </Button>
    </div>
  );
}

/* ── Inline Subtask Button (for dropdown) ── */

function CreateSubtaskButton({
  orgId,
  projectId,
  parentId,
}: {
  orgId: string;
  projectId: string;
  parentId: string;
}) {
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      api.tasks.create(orgId, projectId, {
        title: "New subtask",
        parent_task_id: parentId,
      } as Partial<Task>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks-tree", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
    },
  });

  return (
    <a onClick={() => createMutation.mutate()}>
      <Plus className="w-4 h-4" /> Add Subtask
    </a>
  );
}
