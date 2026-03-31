"use client";

import {
  RichTextEditor,
  RichTextViewer,
} from "@/components/editor/rich-text-editor";
import { ChangeRequestModal } from "@/components/tasks/change-request-modal";
import {
  RecurrenceBadge,
  RecurrenceSelector,
} from "@/components/tasks/recurrence-selector";
import { TimeTracker } from "@/components/tasks/time-tracker";
import { Button } from "@/components/ui/button";
import { Avatar, ConfirmDialog } from "@/components/ui/shared";
import { api } from "@/lib/api"; // kept for attachment upload/download (binary ops)
import { useProjectTaskStore } from "@/stores/project-task-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";

import { useProjectPolicies } from "@/hooks/use-policies";
import { useReviewableFields } from "@/hooks/use-reviewable-fields";
import {
  cn,
  formatDate,
  formatRelative,
  priorityColor,
  statusColor,
  statusLabel,
} from "@/lib/utils";
import type {
  Attachment,
  Checklist,
  Comment,
  OrgMember,
  ProjectMember,
  Task,
  TaskDependency,
  TaskPriority,
  TaskStatus,
  TaskWatcher,
} from "@/types/domain";
import {
  CheckSquare,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Lock,
  MessageSquare,
  Paperclip,
  Play,
  Plus,
  Send,
  Settings2,
  Square,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";

const MAX_DEPTH = 3;

/* ═══════════════════════════════════════════════════════
   Role-based access control — uses DB-driven policies
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   Member helpers
   ═══════════════════════════════════════════════════════ */

function memberLabel(
  id: string | null | undefined,
  members: OrgMember[],
): string {
  if (!id) return "Unassigned";
  const m = members.find((x) => x.user_id === id);
  return m
    ? m.display_name || m.email || m.user_id.slice(0, 8) + "…"
    : id.slice(0, 8) + "…";
}

function memberAvatarUrl(
  id: string | null | undefined,
  members: OrgMember[],
): string | undefined {
  if (!id) return undefined;
  const m = members.find((x) => x.user_id === id);
  return m?.avatar_url || undefined;
}

/* ═══════════════════════════════════════════════════════
   Main TaskPreviewPanel Component
   ═══════════════════════════════════════════════════════ */

interface TaskPreviewPanelProps {
  task: Task;
  orgId: string;
  orgSlug: string;
  projectId: string;
  members: OrgMember[];
  projectMembers?: ProjectMember[];
  currentUserId: string;
  updating: boolean;
  onUpdate: (data: Partial<Task>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubtask?: () => void;
}

type TabType =
  | "details"
  | "checklist"
  | "comments"
  | "attachments"
  | "relations";

export function TaskPreviewPanel({
  task,
  orgId,
  orgSlug: _orgSlug,
  projectId,
  members,
  projectMembers,
  currentUserId,
  updating,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddSubtask,
}: TaskPreviewPanelProps) {
  const send = useProjectTaskStore((s) => s.send);
  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [showDelete, setShowDelete] = useState(false);

  // DB-driven role-based access via project policies
  const policies = useProjectPolicies(projectId);
  const { hasReviewPipeline, isReviewable } = useReviewableFields(projectId);
  const canDirectUpdate = policies.canDirectUpdate;

  const access = {
    canEdit: policies.canEditTask,
    canDelete: policies.canDeleteTask,
    canManageMembers: policies.canManageMembers,
    canComment: policies.canComment,
    canAttach: policies.canAttach,
  };

  // Inline editing states
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || "");

  // Sub-resource local state
  const [checklistItems, setChecklistItems] = useState<Checklist[]>([]);
  const [commentItems, setCommentItems] = useState<Comment[]>([]);
  const [attachmentItems, setAttachmentItems] = useState<Attachment[]>([]);
  const [dependencyItems, setDependencyItems] = useState<TaskDependency[]>([]);
  const [watcherItems, setWatcherItems] = useState<TaskWatcher[]>([]);

  // Fetch helpers
  const fetchChecklists = useCallback(async () => {
    if (!send) return;
    try {
      const res = await send("checklist:list", { task_id: task.id });
      const data = res?.data || [];
      setChecklistItems(data);
      useProjectTaskStore.getState().setChecklists(task.id, data);
    } catch {}
  }, [send, task.id]);

  const fetchComments = useCallback(async () => {
    if (!send) return;
    try {
      const res = await send("comment:list", { task_id: task.id });
      const data = res?.data || [];
      setCommentItems(data);
      useProjectTaskStore.getState().setComments(task.id, data);
    } catch {}
  }, [send, task.id]);

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await api.attachments.list(orgId, projectId, task.id);
      setAttachmentItems(res?.data || []);
    } catch {}
  }, [orgId, projectId, task.id]);

  const fetchDependencies = useCallback(async () => {
    if (!send) return;
    try {
      const res = await send("dependency:list", { task_id: task.id });
      setDependencyItems(res?.data || []);
    } catch {}
  }, [send, task.id]);

  const fetchWatchers = useCallback(async () => {
    if (!send) return;
    try {
      const res = await send("watcher:list", { task_id: task.id });
      setWatcherItems(res?.data || []);
    } catch {}
  }, [send, task.id]);

  // Reset on task change
  const [prevId, setPrevId] = useState(task.id);
  if (task.id !== prevId) {
    setPrevId(task.id);
    setEditingTitle(false);
    setEditingDesc(false);
    setTitleDraft(task.title);
    setDescDraft(task.description || "");
    setActiveTab("details");
    setChecklistItems([]);
    setCommentItems([]);
    setAttachmentItems([]);
    setDependencyItems([]);
    setWatcherItems([]);
  }

  // Fetch sub-resources when task changes or WS connects
  useEffect(() => {
    fetchChecklists();
    fetchComments();
    fetchAttachments();
    fetchDependencies();
    fetchWatchers();
  }, [
    fetchChecklists,
    fetchComments,
    fetchAttachments,
    fetchDependencies,
    fetchWatchers,
  ]);

  // Sync comments & checklists from Zustand store (real-time WS broadcasts)
  const storeComments = useProjectTaskStore((s) => s.comments.get(task.id));
  const storeChecklists = useProjectTaskStore((s) => s.checklists.get(task.id));
  useEffect(() => {
    if (storeComments && storeComments.length > 0)
      setCommentItems(storeComments);
  }, [storeComments]);
  useEffect(() => {
    if (storeChecklists && storeChecklists.length > 0)
      setChecklistItems(storeChecklists);
  }, [storeChecklists]);

  // Tab badges
  const tabs: {
    id: TabType;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: "details",
      label: "Details",
      icon: <Settings2 className="w-4 h-4" />,
    },
    {
      id: "checklist",
      label: "Tasks",
      icon: <ListChecks className="w-4 h-4" />,
      badge: checklistItems.length,
    },
    {
      id: "comments",
      label: "Chat",
      icon: <MessageSquare className="w-4 h-4" />,
      badge: commentItems.length,
    },
    {
      id: "attachments",
      label: "Files",
      icon: <Paperclip className="w-4 h-4" />,
      badge: attachmentItems.length,
    },
    {
      id: "relations",
      label: "Links",
      icon: <Link2 className="w-4 h-4" />,
      badge: dependencyItems.length + watcherItems.length,
    },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-base-200 shrink-0">
        {/* Title */}
        {editingTitle && access.canEdit ? (
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
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setEditingTitle(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <h2
            className={cn(
              "text-base font-semibold line-clamp-2",
              access.canEdit &&
                "cursor-pointer hover:text-primary transition-colors",
            )}
            onClick={() => {
              if (access.canEdit) {
                setTitleDraft(task.title);
                setEditingTitle(true);
              }
            }}
          >
            {task.title}
          </h2>
        )}

        {/* Quick status badges */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={cn("badge badge-sm", statusColor(task.status))}>
            {statusLabel(task.status)}
          </span>
          <span
            className={cn(
              "badge badge-sm badge-outline",
              priorityColor(task.priority),
            )}
          >
            {task.priority}
          </span>
          {task.recurrence_rule && (
            <RecurrenceBadge rule={task.recurrence_rule} />
          )}
          {!access.canEdit && (
            <span className="badge badge-sm badge-warning gap-1">
              <Eye className="w-3 h-3" /> View Only
            </span>
          )}
          {hasReviewPipeline && !canDirectUpdate && (
            <span className="badge badge-sm badge-warning gap-1">
              <Lock className="w-3 h-3" /> Review
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-base-200">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-base-content/60 hover:text-base-content hover:bg-base-200/50",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="badge badge-xs badge-primary">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "details" && (
          <DetailsTab
            task={task}
            members={members}
            pickerMembers={projectMembers}
            access={access}
            onUpdate={onUpdate}
            orgId={orgId}
            projectId={projectId}
            editingDesc={editingDesc}
            setEditingDesc={setEditingDesc}
            descDraft={descDraft}
            setDescDraft={setDescDraft}
            hasReviewPipeline={hasReviewPipeline}
            canDirectUpdate={canDirectUpdate}
            isReviewable={isReviewable}
          />
        )}

        {activeTab === "checklist" && (
          <ChecklistTab
            orgId={orgId}
            projectId={projectId}
            taskId={task.id}
            items={checklistItems}
            access={access}
            onRefresh={fetchChecklists}
          />
        )}

        {activeTab === "comments" && (
          <CommentsTab
            orgId={orgId}
            projectId={projectId}
            taskId={task.id}
            items={commentItems}
            members={members}
            currentUserId={currentUserId}
            access={access}
            onRefresh={fetchComments}
          />
        )}

        {activeTab === "attachments" && (
          <AttachmentsTab
            orgId={orgId}
            projectId={projectId}
            taskId={task.id}
            items={attachmentItems}
            access={access}
            onRefresh={fetchAttachments}
          />
        )}

        {activeTab === "relations" && (
          <RelationsTab
            orgId={orgId}
            projectId={projectId}
            taskId={task.id}
            dependencies={dependencyItems}
            watchers={watcherItems}
            members={members}
            currentUserId={currentUserId}
            access={access}
            onRefreshDeps={fetchDependencies}
            onRefreshWatchers={fetchWatchers}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 p-3 border-t border-base-200 space-y-2 bg-base-100">
        {task.depth < MAX_DEPTH && access.canEdit && onAddSubtask && (
          <button
            className="btn btn-xs btn-outline btn-primary w-full gap-1"
            onClick={onAddSubtask}
          >
            <Plus className="w-3 h-3" /> Subtask
          </button>
        )}
        <div className="flex gap-1">
          {access.canEdit && (
            <button
              className="btn btn-xs btn-ghost flex-1 gap-1"
              onClick={onDuplicate}
            >
              <Copy className="w-3 h-3" /> Clone
            </button>
          )}
          {access.canDelete && (
            <button
              className="btn btn-xs btn-ghost text-error flex-1 gap-1"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Task"
        message={`Delete "${task.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          onDelete();
          setShowDelete(false);
        }}
        onClose={() => setShowDelete(false)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Details Tab
   ═══════════════════════════════════════════════════════ */

function DetailsTab({
  task,
  members,
  pickerMembers,
  access,
  onUpdate,
  orgId,
  projectId,
  editingDesc,
  setEditingDesc,
  descDraft,
  setDescDraft,
  hasReviewPipeline,
  canDirectUpdate,
  isReviewable,
}: {
  task: Task;
  members: OrgMember[];
  pickerMembers?: ProjectMember[];
  access: AccessControl;
  onUpdate: (data: Partial<Task>) => void;
  orgId: string;
  projectId: string;
  editingDesc: boolean;
  setEditingDesc: (v: boolean) => void;
  descDraft: string;
  setDescDraft: (v: string) => void;
  hasReviewPipeline: boolean;
  canDirectUpdate: boolean;
  isReviewable: (field: string) => boolean;
}) {
  // Use project members for pickers (assignee/reporter), org members for name resolution
  const selectableMembers: OrgMember[] = pickerMembers
    ? pickerMembers.map((m) => ({
        org_id: orgId,
        user_id: m.user_id,
        email: m.email || "",
        display_name: m.display_name || m.email || "",
        avatar_url: m.avatar_url,
        role: "member" as const,
        joined_at: m.joined_at,
      }))
    : members;
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);

  // --- Per-field access: "direct" | "review" | "disabled" ---
  // When user has direct_update or no review pipeline → normal canEdit
  // When review pipeline active and no direct_update:
  //   reviewable fields → "review" (opens modal)
  //   non-reviewable fields → "disabled"
  type FieldAccess = "direct" | "review" | "disabled";

  const fieldAccess = useCallback(
    (field: string): FieldAccess => {
      if (!access.canEdit) return "disabled";
      if (canDirectUpdate || !hasReviewPipeline) return "direct";
      return isReviewable(field) ? "review" : "disabled";
    },
    [access.canEdit, canDirectUpdate, hasReviewPipeline, isReviewable],
  );

  // Change request modal state
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Partial<Task>>({});

  /** Try to update — if field needs review, open modal instead */
  const handleFieldUpdate = useCallback(
    (field: string, data: Partial<Task>) => {
      const fa = fieldAccess(field);
      if (fa === "disabled") return;
      if (fa === "review") {
        setPendingChanges(data);
        setCrModalOpen(true);
        return;
      }
      onUpdate(data);
    },
    [fieldAccess, onUpdate],
  );

  /** Label with lock icon when field is disabled due to review pipeline */
  const fieldLabel = (label: string, field: string) => {
    const fa = fieldAccess(field);
    return (
      <label className="text-xs text-base-content/50 flex items-center gap-1 mb-1">
        {label}
        {fa === "disabled" && hasReviewPipeline && (
          <span
            className="tooltip tooltip-right"
            data-tip="Not available for review"
          >
            <Lock className="w-3 h-3 text-base-content/30" />
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="p-3 space-y-4">
      {/* Change Request Modal */}
      <ChangeRequestModal
        open={crModalOpen}
        onClose={() => {
          setCrModalOpen(false);
          setPendingChanges({});
        }}
        task={task}
        changes={pendingChanges}
        orgId={orgId}
        projectId={projectId}
        members={selectableMembers}
        onCreated={() => {
          setCrModalOpen(false);
          setPendingChanges({});
        }}
      />
      {/* Status & Priority */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          {fieldLabel("Status", "status")}
          <select
            className="select select-bordered select-xs w-full"
            value={task.status}
            onChange={(e) =>
              handleFieldUpdate("status", {
                status: e.target.value as TaskStatus,
              })
            }
            disabled={fieldAccess("status") === "disabled"}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div>
          {fieldLabel("Priority", "priority")}
          <select
            className="select select-bordered select-xs w-full"
            value={task.priority}
            onChange={(e) =>
              handleFieldUpdate("priority", {
                priority: e.target.value as TaskPriority,
              })
            }
            disabled={fieldAccess("priority") === "disabled"}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Assignees & Reporter */}
      <div className="space-y-2">
        <div>
          {fieldLabel("Assignees", "assignee_id")}
          <div className="flex items-center gap-1 flex-wrap">
            {(task.assignee_ids || []).map((uid) => {
              const m = members.find((x) => x.user_id === uid);
              if (!m) return null;
              const initials = (m.display_name || m.email || "?")
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              return (
                <div key={uid} className="relative group">
                  <div
                    className="w-7 h-7 rounded-full bg-primary text-primary-content flex items-center justify-center text-[10px] font-medium ring-2 ring-base-100"
                    title={m.display_name || m.email || uid}
                  >
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.avatar_url}
                        alt=""
                        className="rounded-full w-full h-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  {fieldAccess("assignee_id") !== "disabled" && (
                    <button
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-error text-error-content text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        const next = (task.assignee_ids || []).filter(
                          (id) => id !== uid,
                        );
                        handleFieldUpdate("assignee_id", {
                          assignee_ids: next,
                          assignee_id: next[0] || null,
                        } as Partial<Task>);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            {fieldAccess("assignee_id") !== "disabled" && (
              <div className="relative">
                <button
                  className="w-7 h-7 rounded-full border-2 border-dashed border-base-300 flex items-center justify-center text-base-content/40 hover:border-primary hover:text-primary transition-colors"
                  onClick={() => setAssigneeDropdownOpen(!assigneeDropdownOpen)}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {assigneeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-base-100 border border-base-200 rounded-lg shadow-xl py-1 min-w-[180px] max-h-40 overflow-y-auto z-20">
                    {selectableMembers
                      .filter(
                        (m) => !(task.assignee_ids || []).includes(m.user_id),
                      )
                      .map((m) => (
                        <button
                          key={m.user_id}
                          className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-base-200"
                          onClick={() => {
                            const next = [
                              ...(task.assignee_ids || []),
                              m.user_id,
                            ];
                            handleFieldUpdate("assignee_id", {
                              assignee_ids: next,
                              assignee_id: next[0],
                            } as Partial<Task>);
                            setAssigneeDropdownOpen(false);
                          }}
                        >
                          <Avatar
                            name={m.display_name || m.email || ""}
                            size="xs"
                            src={m.avatar_url}
                          />
                          <span className="truncate">
                            {m.display_name || m.email || m.user_id.slice(0, 8)}
                          </span>
                        </button>
                      ))}
                    {selectableMembers.filter(
                      (m) => !(task.assignee_ids || []).includes(m.user_id),
                    ).length === 0 && (
                      <div className="px-3 py-1.5 text-xs text-base-content/40">
                        All members assigned
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          {fieldLabel("Start Date", "start_date")}
          <input
            type="date"
            className="input input-bordered input-xs w-full"
            value={task.start_date ? task.start_date.split("T")[0] : ""}
            onChange={(e) =>
              handleFieldUpdate("start_date", {
                start_date: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            disabled={fieldAccess("start_date") === "disabled"}
          />
        </div>
        <div>
          {fieldLabel("Due Date", "due_date")}
          <input
            type="date"
            className="input input-bordered input-xs w-full"
            value={task.due_date ? task.due_date.split("T")[0] : ""}
            onChange={(e) =>
              handleFieldUpdate("due_date", {
                due_date: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            disabled={fieldAccess("due_date") === "disabled"}
          />
        </div>
      </div>

      {/* Hours */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          {fieldLabel("Est. Hours", "estimated_hours")}
          <input
            type="number"
            className="input input-bordered input-xs w-full"
            step="0.5"
            min="0"
            placeholder="0"
            value={task.estimated_hours ?? ""}
            onChange={(e) =>
              handleFieldUpdate("estimated_hours", {
                estimated_hours: e.target.value
                  ? parseFloat(e.target.value)
                  : null,
              })
            }
            disabled={fieldAccess("estimated_hours") === "disabled"}
          />
        </div>
        <div>
          {fieldLabel("Actual Hours", "actual_hours")}
          <input
            type="number"
            className="input input-bordered input-xs w-full"
            step="0.5"
            min="0"
            placeholder="0"
            value={task.actual_hours ?? ""}
            onChange={(e) =>
              handleFieldUpdate("actual_hours", {
                actual_hours: e.target.value
                  ? parseFloat(e.target.value)
                  : null,
              })
            }
            disabled={fieldAccess("actual_hours") === "disabled"}
          />
        </div>
      </div>

      {/* Time Tracker */}
      {access.canEdit && (
        <div>
          <label className="text-xs text-base-content/50 flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3" /> Time Tracker
          </label>
          <TimeTracker orgId={orgId} projectId={projectId} task={task} />
        </div>
      )}

      {/* Recurrence */}
      <div>
        <label className="text-xs text-base-content/50 flex items-center gap-1 mb-1">
          Repeat
        </label>
        <div className="flex items-center gap-2">
          {access.canEdit ? (
            <RecurrenceSelector
              value={task.recurrence_rule}
              onChange={(rule) => onUpdate({ recurrence_rule: rule })}
            />
          ) : (
            <span className="text-sm">{task.recurrence_rule || "None"}</span>
          )}
        </div>
        {task.next_occurrence && (
          <div className="text-xs text-base-content/60 mt-1">
            Next: {formatDate(task.next_occurrence)}
          </div>
        )}
      </div>

      {/* Labels */}
      <div>
        {fieldLabel("Labels", "labels")}
        <div className="flex flex-wrap gap-1">
          {(task.labels || []).slice(0, 7).map((l) => (
            <span
              key={l}
              className="badge badge-xs badge-outline gap-1 group"
              title={l.length > 10 ? l : undefined}
            >
              {l.length > 10 ? l.slice(0, 10) + "…" : l}
              {fieldAccess("labels") !== "disabled" && (
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() =>
                    handleFieldUpdate("labels", {
                      labels: (task.labels || []).filter((x) => x !== l),
                    })
                  }
                >
                  <X className="w-2 h-2" />
                </button>
              )}
            </span>
          ))}
          {(task.labels || []).length > 7 && (
            <span className="badge badge-xs badge-ghost">
              +{(task.labels || []).length - 7}
            </span>
          )}
          {fieldAccess("labels") !== "disabled" &&
            (labelsOpen ? (
              <div className="flex gap-1 items-center">
                <input
                  type="text"
                  className="input input-bordered input-xs w-20"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newLabel.trim()) {
                      handleFieldUpdate("labels", {
                        labels: [...(task.labels || []), newLabel.trim()],
                      });
                      setNewLabel("");
                      setLabelsOpen(false);
                    }
                    if (e.key === "Escape") setLabelsOpen(false);
                  }}
                />
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setLabelsOpen(false)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                className="badge badge-xs badge-ghost"
                onClick={() => setLabelsOpen(true)}
              >
                <Plus className="w-2 h-2" />
              </button>
            ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-base-content/50 block mb-1">
          Description
        </label>
        {editingDesc && access.canEdit ? (
          <div className="space-y-2">
            <RichTextEditor
              content={descDraft}
              onChange={setDescDraft}
              placeholder="Add description..."
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
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setEditingDesc(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "text-sm min-h-[60px] p-2 rounded border border-base-200 bg-base-50",
              access.canEdit && "cursor-pointer hover:border-base-300",
            )}
            onClick={() => {
              if (access.canEdit) {
                setDescDraft(task.description || "");
                setEditingDesc(true);
              }
            }}
          >
            {task.description ? (
              <RichTextViewer content={task.description} />
            ) : (
              <span className="text-base-content/30 italic">
                {access.canEdit
                  ? "Click to add description…"
                  : "No description"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="text-[10px] text-base-content/40 pt-2 border-t border-base-200 space-y-0.5">
        <p>Created {formatRelative(task.created_at)}</p>
        <p>Updated {formatRelative(task.updated_at)}</p>
        {task.parent_task_id && <p>Depth {task.depth}</p>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Checklist Tab with Virtual Scrolling
   ═══════════════════════════════════════════════════════ */

function ChecklistTab({
  orgId: _orgId,
  projectId: _projectId,
  taskId,
  items,
  access,
  onRefresh,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Checklist[];
  access: AccessControl;
  onRefresh: () => void;
}) {
  const send = useProjectTaskStore((s) => s.send);
  const parentRef = useRef<HTMLDivElement>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const handleCreate = async (title: string) => {
    if (!send) return;
    setCreating(true);
    try {
      const res = await send("checklist:create", { task_id: taskId, title });
      setNewTitle("");
      if (res?.id) {
        useProjectTaskStore.getState().addChecklist(taskId, res);
      } else {
        onRefresh();
      }
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, is_checked: boolean) => {
    if (!send) return;
    try {
      await send("checklist:update", {
        task_id: taskId,
        checklist_id: id,
        is_checked,
      });
      useProjectTaskStore
        .getState()
        .updateChecklist(taskId, id, { is_checked });
    } catch {}
  };

  const handleDeleteItem = async (id: string) => {
    if (!send) return;
    try {
      await send("checklist:delete", { task_id: taskId, checklist_id: id });
      useProjectTaskStore.getState().removeChecklist(taskId, id);
    } catch {}
  };

  const total = items.length;
  const checked = items.filter((c) => c.is_checked).length;

  return (
    <div className="h-full flex flex-col">
      {/* Progress */}
      {total > 0 && (
        <div className="p-3 pb-0 shrink-0">
          <div className="flex items-center justify-between text-xs text-base-content/60 mb-1">
            <span>Progress</span>
            <span>
              {checked}/{total}
            </span>
          </div>
          <progress
            className="progress progress-success w-full h-1.5"
            value={checked}
            max={total}
          />
        </div>
      )}

      {/* List */}
      <div ref={parentRef} className="flex-1 overflow-auto p-3">
        {items.length === 0 ? (
          <div className="text-center text-base-content/40 text-sm py-8">
            <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No checklist items yet
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
              const item = items[virtualItem.index];
              return (
                <div
                  key={item.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="flex items-center gap-2 group py-1"
                >
                  <button
                    className="btn btn-ghost btn-xs btn-square shrink-0"
                    onClick={() =>
                      access.canEdit && handleToggle(item.id, !item.is_checked)
                    }
                    disabled={!access.canEdit}
                  >
                    {item.is_checked ? (
                      <CheckSquare className="w-4 h-4 text-success" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <span
                    className={cn(
                      "flex-1 text-sm truncate",
                      item.is_checked && "line-through text-base-content/40",
                    )}
                  >
                    {item.title}
                  </span>
                  {access.canEdit && (
                    <button
                      className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new */}
      {access.canEdit && (
        <form
          className="p-3 pt-0 shrink-0"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) handleCreate(newTitle.trim());
          }}
        >
          <div className="join w-full">
            <input
              type="text"
              className="input input-bordered input-xs join-item flex-1"
              placeholder="Add item..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary btn-xs join-item"
              disabled={!newTitle.trim() || creating}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Comments Tab with Virtual Scrolling
   ═══════════════════════════════════════════════════════ */

function CommentsTab({
  orgId: _orgId,
  projectId: _projectId,
  taskId,
  items,
  members,
  currentUserId,
  access,
  onRefresh,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Comment[];
  members: OrgMember[];
  currentUserId: string;
  access: AccessControl;
  onRefresh: () => void;
}) {
  const send = useProjectTaskStore((s) => s.send);
  const parentRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 3,
  });

  const handleCreate = async (b: string) => {
    if (!send) return;
    setCreating(true);
    try {
      const res = await send("comment:create", { task_id: taskId, body: b });
      setBody("");
      // Broadcast excludes sender, so add comment to store directly
      if (res?.id) {
        useProjectTaskStore.getState().addComment(taskId, res);
      } else {
        onRefresh();
      }
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteComment = async (id: string) => {
    if (!send) return;
    try {
      await send("comment:delete", { task_id: taskId, comment_id: id });
      // Broadcast excludes sender, so remove from store directly
      useProjectTaskStore.getState().removeComment(taskId, id);
    } catch {}
  };

  return (
    <div className="h-full flex flex-col">
      {/* Comments list */}
      <div ref={parentRef} className="flex-1 overflow-auto p-3">
        {items.length === 0 ? (
          <div className="text-center text-base-content/40 text-sm py-8">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No comments yet
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
              const comment = items[virtualItem.index];
              const canDelete =
                comment.user_id === currentUserId || access.canDelete;
              return (
                <div
                  key={comment.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="flex gap-2 pb-3 group"
                >
                  <Avatar
                    name={memberLabel(comment.user_id, members)}
                    src={memberAvatarUrl(comment.user_id, members)}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-xs">
                        {memberLabel(comment.user_id, members)}
                      </span>
                      <span className="text-[10px] text-base-content/50">
                        {formatRelative(comment.created_at)}
                      </span>
                      {canDelete && (
                        <button
                          className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-base-content/80 whitespace-pre-wrap break-words">
                      {comment.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add comment */}
      {access.canComment && (
        <form
          className="p-3 pt-0 shrink-0 border-t border-base-200"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) handleCreate(body.trim());
          }}
        >
          <div className="flex gap-2">
            <textarea
              className="textarea textarea-bordered textarea-xs flex-1 min-h-[60px] resize-none"
              placeholder="Add a comment..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.metaKey || e.ctrlKey) &&
                  body.trim()
                ) {
                  e.preventDefault();
                  handleCreate(body.trim());
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!body.trim() || creating}
              className="self-end"
            >
              <Send className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-[10px] text-base-content/40 mt-1">
            ⌘+Enter to send
          </p>
        </form>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Attachments Tab
   ═══════════════════════════════════════════════════════ */

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

function AttachmentPreview({
  orgId,
  projectId,
  taskId,
  attachment,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  attachment: Attachment;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.attachments
      .fetchBlobUrl(orgId, projectId, taskId, attachment.id)
      .then((blobUrl) => {
        if (!cancelled) {
          setUrl(blobUrl);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      // Revoke blob URL on unmount
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, projectId, taskId, attachment.id]);

  if (loading) {
    return (
      <div className="w-full h-32 rounded-lg bg-base-300 animate-pulse flex items-center justify-center">
        <span className="loading loading-spinner loading-sm" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="w-full h-32 rounded-lg bg-base-300 flex items-center justify-center text-xs text-base-content/40">
        Preview unavailable
      </div>
    );
  }

  if (attachment.mime_type.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        className="w-full max-h-[200px] rounded-lg object-contain bg-black"
        preload="metadata"
      />
    );
  }

  // Image
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={attachment.filename}
      className="w-full max-h-[200px] rounded-lg object-contain"
      loading="lazy"
    />
  );
}

function AttachmentsTab({
  orgId,
  projectId,
  taskId,
  items,
  access,
  onRefresh,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Attachment[];
  access: AccessControl;
  onRefresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    mime: string;
    name: string;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await api.attachments.delete(orgId, projectId, taskId, id);
      onRefresh();
    } catch {}
    setDeleteConfirm(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);

    // Validate all files first
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(
          `"${file.name}" exceeds 30 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
        );
        e.target.value = "";
        return;
      }
    }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.attachments.upload(orgId, projectId, taskId, file);
      }
      onRefresh();
    } catch (err) {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDownload = async (att: Attachment) => {
    try {
      setLoadingId(att.id);
      const blobUrl = await api.attachments.fetchBlobUrl(
        orgId,
        projectId,
        taskId,
        att.id,
      );
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = att.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } finally {
      setLoadingId(null);
    }
  };

  const handlePreview = async (att: Attachment) => {
    try {
      setLoadingId(att.id);
      const blobUrl = await api.attachments.fetchBlobUrl(
        orgId,
        projectId,
        taskId,
        att.id,
      );
      setPreview({
        url: blobUrl,
        mime: att.mime_type,
        name: att.filename,
      });
    } finally {
      setLoadingId(null);
    }
  };

  const isImage = (mime: string) => mime.startsWith("image/");
  const isVideo = (mime: string) => mime.startsWith("video/");
  const isPDF = (mime: string) => mime === "application/pdf";
  const isMedia = (mime: string) => isImage(mime) || isVideo(mime);
  const isPreviewable = (mime: string) =>
    isImage(mime) || isVideo(mime) || isPDF(mime);

  const fileIcon = (mime: string) => {
    if (isImage(mime)) return <ImageIcon className="w-4 h-4 text-primary" />;
    if (isVideo(mime)) return <Play className="w-4 h-4 text-secondary" />;
    if (isPDF(mime)) return <FileText className="w-4 h-4 text-error" />;
    return <Paperclip className="w-4 h-4" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Split into media & non-media for layout
  const mediaAttachments = items.filter((a) => isMedia(a.mime_type));
  const otherAttachments = items.filter((a) => !isMedia(a.mime_type));

  return (
    <>
      <div className="p-3 space-y-3">
        {/* Upload button */}
        {access.canAttach && (
          <label
            className={cn(
              "btn btn-outline btn-sm gap-2 w-full",
              uploading && "btn-disabled",
            )}
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading..." : "Upload files"}
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
              multiple
            />
            <span className="text-xs text-base-content/50 ml-auto">
              Max 30 MB
            </span>
          </label>
        )}

        {uploadError && (
          <div className="text-xs text-error bg-error/10 rounded-lg px-3 py-2 flex items-center gap-2">
            <X className="w-3 h-3 shrink-0" />
            {uploadError}
          </div>
        )}

        {items.length === 0 && !uploading ? (
          <div className="text-center text-base-content/40 text-sm py-8">
            <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No attachments yet
          </div>
        ) : (
          <>
            {/* Media grid (images & videos with inline preview) */}
            {mediaAttachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-base-content/50 font-medium">
                  Media ({mediaAttachments.length})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {mediaAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="relative group rounded-lg overflow-hidden border border-base-200 hover:border-primary/40 transition-colors"
                    >
                      <button
                        className="w-full cursor-pointer"
                        onClick={() => handlePreview(att)}
                        disabled={loadingId === att.id}
                      >
                        <AttachmentPreview
                          orgId={orgId}
                          projectId={projectId}
                          taskId={taskId}
                          attachment={att}
                        />
                      </button>
                      {/* Overlay with filename & actions */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white truncate">
                          {att.filename}
                        </p>
                        <p className="text-[10px] text-white/70">
                          {formatSize(att.file_size)}
                        </p>
                      </div>
                      {/* Action buttons */}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="btn btn-xs btn-circle bg-base-100/80 hover:bg-base-100 border-0"
                          disabled={loadingId === att.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(att);
                          }}
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        {access.canEdit && (
                          <button
                            className="btn btn-xs btn-circle bg-base-100/80 hover:bg-error/20 border-0 text-error"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(att.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Non-media file list */}
            {otherAttachments.length > 0 && (
              <div className="space-y-1">
                {mediaAttachments.length > 0 && (
                  <p className="text-xs text-base-content/50 font-medium mt-2">
                    Files ({otherAttachments.length})
                  </p>
                )}
                {otherAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-base-200 hover:bg-base-200/50 group transition-colors"
                  >
                    <div className="shrink-0">{fileIcon(att.mime_type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {att.filename}
                      </p>
                      <p className="text-[10px] text-base-content/50">
                        {formatSize(att.file_size)}
                      </p>
                    </div>
                    <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isPDF(att.mime_type) && (
                        <button
                          className="btn btn-ghost btn-xs btn-square"
                          disabled={loadingId === att.id}
                          onClick={() => handlePreview(att)}
                          title="Preview"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        disabled={loadingId === att.id}
                        onClick={() => handleDownload(att)}
                        title="Download"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      {access.canEdit && (
                        <button
                          className="btn btn-ghost btn-xs btn-square text-error"
                          onClick={() => setDeleteConfirm(att.id)}
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete attachment?"
        message="This file will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteConfirm) handleDelete(deleteConfirm);
        }}
        onClose={() => setDeleteConfirm(null)}
      />

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative bg-base-100 rounded-lg shadow-xl max-w-3xl max-h-[85vh] w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-base-200">
              <h3 className="font-semibold text-sm truncate">{preview.name}</h3>
              <div className="flex gap-1">
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = preview.url;
                    a.download = preview.name;
                    a.target = "_blank";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={() => setPreview(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div
              className="flex items-center justify-center overflow-auto p-4"
              style={{ maxHeight: "calc(85vh - 48px)" }}
            >
              {isImage(preview.mime) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-w-full max-h-[70vh] object-contain rounded"
                />
              )}
              {isVideo(preview.mime) && (
                <video
                  src={preview.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh] rounded"
                />
              )}
              {isPDF(preview.mime) && (
                <iframe
                  src={preview.url}
                  className="w-full h-[70vh] rounded"
                  title={preview.name}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   Relations Tab (Dependencies + Watchers)
   ═══════════════════════════════════════════════════════ */

function RelationsTab({
  orgId: _orgId,
  projectId: _projectId,
  taskId,
  dependencies,
  watchers,
  members,
  currentUserId,
  access,
  onRefreshDeps,
  onRefreshWatchers,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  dependencies: TaskDependency[];
  watchers: TaskWatcher[];
  members: OrgMember[];
  currentUserId: string;
  access: AccessControl;
  onRefreshDeps: () => void;
  onRefreshWatchers: () => void;
}) {
  const send = useProjectTaskStore((s) => s.send);
  const isWatching = watchers.some((w) => w.user_id === currentUserId);
  const [watchPending, setWatchPending] = useState(false);

  const handleToggleWatch = async () => {
    if (!send) return;
    setWatchPending(true);
    try {
      if (isWatching) {
        await send("watcher:unwatch", { task_id: taskId });
      } else {
        await send("watcher:watch", { task_id: taskId });
      }
      onRefreshWatchers();
    } catch {
    } finally {
      setWatchPending(false);
    }
  };

  const handleRemoveDep = async (depId: string) => {
    if (!send) return;
    try {
      await send("dependency:remove", {
        task_id: taskId,
        depends_on_id: depId,
      });
      onRefreshDeps();
    } catch {}
  };

  return (
    <div className="p-3 space-y-4">
      {/* Watchers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-base-content/50 flex items-center gap-1">
            <Users className="w-3 h-3" /> Watchers ({watchers.length})
          </label>
          <button
            className={cn(
              "btn btn-xs gap-1",
              isWatching ? "btn-primary" : "btn-outline",
            )}
            onClick={() => handleToggleWatch()}
            disabled={watchPending}
          >
            <Eye className="w-3 h-3" />
            {isWatching ? "Watching" : "Watch"}
          </button>
        </div>
        {watchers.length === 0 ? (
          <p className="text-xs text-base-content/40">No watchers</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {watchers.map((w) => (
              <div key={w.user_id} className="badge badge-sm gap-1">
                <Avatar
                  name={memberLabel(w.user_id, members)}
                  src={memberAvatarUrl(w.user_id, members)}
                  size="xs"
                />
                <span className="text-xs">
                  {memberLabel(w.user_id, members)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="divider my-2" />

      {/* Dependencies */}
      <div>
        <label className="text-xs text-base-content/50 flex items-center gap-1 mb-2">
          <Link2 className="w-3 h-3" /> Dependencies ({dependencies.length})
        </label>
        {dependencies.length === 0 ? (
          <p className="text-xs text-base-content/40">No dependencies</p>
        ) : (
          <div className="space-y-1">
            {dependencies.map((dep) => (
              <div
                key={`${dep.task_id}-${dep.depends_on_id}`}
                className="flex items-center gap-2 p-1.5 rounded border border-base-200 text-xs group"
              >
                <span
                  className={cn(
                    "badge badge-xs",
                    dep.type === "blocks" ? "badge-warning" : "badge-info",
                  )}
                >
                  {dep.type}
                </span>
                <span className="flex-1 truncate">
                  {dep.depends_on_id.slice(0, 8)}...
                </span>
                {access.canEdit && (
                  <button
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                    onClick={() => handleRemoveDep(dep.depends_on_id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskPreviewPanel;
