"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ConfirmDialog, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RichTextEditor, RichTextViewer } from "@/components/editor/rich-text-editor";
import { TimeTracker } from "@/components/tasks/time-tracker";
import { RecurrenceSelector, RecurrenceBadge } from "@/components/tasks/recurrence-selector";

import {
  Plus,
  Trash2,
  Copy,
  Loader2,
  Send,
  Square,
  CheckSquare,
  Upload,
  Clock,
  X,
  Tag,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Link2,
  MessageSquare,
  ListChecks,
  Users,
  Settings2,
} from "lucide-react";
import { statusColor, priorityColor, statusLabel, formatDate, formatRelative, cn } from "@/lib/utils";
import type { 
  Task, 
  TaskStatus, 
  TaskPriority, 
  ProjectMember, 
  OrgMember,
  Checklist, 
  Comment, 
  Attachment, 
  TaskDependency, 
  TaskWatcher 
} from "@/types/domain";

const MAX_DEPTH = 3;

/* ═══════════════════════════════════════════════════════
   Role-based access control helper
   ═══════════════════════════════════════════════════════ */

type ProjectRole = "owner" | "admin" | "editor" | "viewer";

interface AccessControl {
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canComment: boolean;
  canAttach: boolean;
}

function getAccessControl(role: string | undefined, isAssignee: boolean, isReporter: boolean): AccessControl {
  const r = role as ProjectRole;
  
  // Viewers can only read and comment
  if (r === "viewer") {
    return {
      canEdit: false,
      canDelete: false,
      canManageMembers: false,
      canComment: true,
      canAttach: false,
    };
  }
  
  // Editors can edit, comment, attach but not delete or manage
  if (r === "editor" || isAssignee || isReporter) {
    return {
      canEdit: true,
      canDelete: isAssignee || isReporter,
      canManageMembers: false,
      canComment: true,
      canAttach: true,
    };
  }
  
  // Owners and admins have full access
  if (r === "owner" || r === "admin") {
    return {
      canEdit: true,
      canDelete: true,
      canManageMembers: true,
      canComment: true,
      canAttach: true,
    };
  }
  
  // Default: read-only
  return {
    canEdit: false,
    canDelete: false,
    canManageMembers: false,
    canComment: true,
    canAttach: false,
  };
}

/* ═══════════════════════════════════════════════════════
   Member helpers
   ═══════════════════════════════════════════════════════ */

function memberLabel(id: string | null | undefined, members: OrgMember[]): string {
  if (!id) return "Unassigned";
  const m = members.find((x) => x.user_id === id);
  return m ? (m.display_name || m.email || m.user_id.slice(0, 8) + "…") : id.slice(0, 8) + "…";
}

function memberAvatarUrl(id: string | null | undefined, members: OrgMember[]): string | undefined {
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
  userProjectRole?: string;
  updating: boolean;
  onUpdate: (data: Partial<Task>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubtask: () => void;
}

type TabType = "details" | "checklist" | "comments" | "attachments" | "relations";

export function TaskPreviewPanel({
  task,
  orgId,
  orgSlug: _orgSlug,
  projectId,
  members,
  projectMembers: _projectMembers,
  currentUserId,
  userProjectRole,
  updating,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddSubtask,
}: TaskPreviewPanelProps) {
  const _qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [showDelete, setShowDelete] = useState(false);
  
  // Role-based access
  const isAssignee = task.assignee_id === currentUserId;
  const isReporter = task.reporter_id === currentUserId;
  const access = getAccessControl(userProjectRole, isAssignee, isReporter);
  
  // Inline editing states
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || "");
  
  // Reset on task change
  const [prevId, setPrevId] = useState(task.id);
  if (task.id !== prevId) {
    setPrevId(task.id);
    setEditingTitle(false);
    setEditingDesc(false);
    setTitleDraft(task.title);
    setDescDraft(task.description || "");
    setActiveTab("details");
  }
  
  // Queries for related data
  const { data: checklists } = useQuery({
    queryKey: ["checklists", orgId, projectId, task.id],
    queryFn: () => api.checklists.list(orgId, projectId, task.id),
    enabled: !!orgId,
  });
  
  const { data: comments } = useQuery({
    queryKey: ["comments", orgId, projectId, task.id],
    queryFn: () => api.comments.list(orgId, projectId, task.id),
    enabled: !!orgId,
  });
  
  const { data: attachments } = useQuery({
    queryKey: ["attachments", orgId, projectId, task.id],
    queryFn: () => api.attachments.list(orgId, projectId, task.id),
    enabled: !!orgId,
  });
  
  const { data: dependencies } = useQuery({
    queryKey: ["dependencies", orgId, projectId, task.id],
    queryFn: () => api.dependencies.list(orgId, projectId, task.id),
    enabled: !!orgId,
  });
  
  const { data: watchers } = useQuery({
    queryKey: ["watchers", orgId, projectId, task.id],
    queryFn: () => api.watchers.list(orgId, projectId, task.id),
    enabled: !!orgId,
  });

  const checklistItems = checklists?.data || [];
  const commentItems = comments?.data || [];
  const attachmentItems = attachments?.data || [];
  const dependencyItems = dependencies?.data || [];
  const watcherItems = watchers?.data || [];

  // Tab badges
  const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "details", label: "Details", icon: <Settings2 className="w-4 h-4" /> },
    { id: "checklist", label: "Tasks", icon: <ListChecks className="w-4 h-4" />, badge: checklistItems.length },
    { id: "comments", label: "Chat", icon: <MessageSquare className="w-4 h-4" />, badge: commentItems.length },
    { id: "attachments", label: "Files", icon: <Paperclip className="w-4 h-4" />, badge: attachmentItems.length },
    { id: "relations", label: "Links", icon: <Link2 className="w-4 h-4" />, badge: dependencyItems.length + watcherItems.length },
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
              <button className="btn btn-ghost btn-xs" onClick={() => setEditingTitle(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <h2
            className={cn(
              "text-base font-semibold line-clamp-2",
              access.canEdit && "cursor-pointer hover:text-primary transition-colors"
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
          <span className={cn("badge badge-sm", statusColor(task.status))}>{statusLabel(task.status)}</span>
          <span className={cn("badge badge-sm badge-outline", priorityColor(task.priority))}>{task.priority}</span>
          {task.recurrence_rule && <RecurrenceBadge rule={task.recurrence_rule} />}
          {!access.canEdit && (
            <span className="badge badge-sm badge-warning gap-1">
              <Eye className="w-3 h-3" /> View Only
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
                  : "border-transparent text-base-content/60 hover:text-base-content hover:bg-base-200/50"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="badge badge-xs badge-primary">{tab.badge}</span>
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
            access={access}
            onUpdate={onUpdate}
            orgId={orgId}
            projectId={projectId}
            editingDesc={editingDesc}
            setEditingDesc={setEditingDesc}
            descDraft={descDraft}
            setDescDraft={setDescDraft}
          />
        )}
        
        {activeTab === "checklist" && (
          <ChecklistTab
            orgId={orgId}
            projectId={projectId}
            taskId={task.id}
            items={checklistItems}
            access={access}
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
          />
        )}
        
        {activeTab === "attachments" && (
          <AttachmentsTab
            orgId={orgId}
            projectId={projectId}
            taskId={task.id}
            items={attachmentItems}
            access={access}
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
          />
        )}
      </div>
      
      {/* Footer Actions */}
      <div className="shrink-0 p-3 border-t border-base-200 space-y-2 bg-base-100">
        {task.depth < MAX_DEPTH && access.canEdit && (
          <button className="btn btn-xs btn-outline btn-primary w-full gap-1" onClick={onAddSubtask}>
            <Plus className="w-3 h-3" /> Subtask
          </button>
        )}
        <div className="flex gap-1">
          {access.canEdit && (
            <button className="btn btn-xs btn-ghost flex-1 gap-1" onClick={onDuplicate}>
              <Copy className="w-3 h-3" /> Clone
            </button>
          )}
          {access.canDelete && (
            <button className="btn btn-xs btn-ghost text-error flex-1 gap-1" onClick={() => setShowDelete(true)}>
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
        
        {updating && (
          <div className="text-center">
            <Loader2 className="w-3 h-3 animate-spin inline text-primary" />
          </div>
        )}
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
  access,
  onUpdate,
  orgId,
  projectId,
  editingDesc,
  setEditingDesc,
  descDraft,
  setDescDraft,
}: {
  task: Task;
  members: OrgMember[];
  access: AccessControl;
  onUpdate: (data: Partial<Task>) => void;
  orgId: string;
  projectId: string;
  editingDesc: boolean;
  setEditingDesc: (v: boolean) => void;
  descDraft: string;
  setDescDraft: (v: string) => void;
}) {
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  
  return (
    <div className="p-3 space-y-4">
      {/* Status & Priority */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Status</label>
          <select
            className="select select-bordered select-xs w-full"
            value={task.status}
            onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
            disabled={!access.canEdit}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Priority</label>
          <select
            className="select select-bordered select-xs w-full"
            value={task.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
            disabled={!access.canEdit}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      
      {/* Assignee & Reporter */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Assignee</label>
          <select
            className="select select-bordered select-xs w-full"
            value={task.assignee_id || ""}
            onChange={(e) => onUpdate({ assignee_id: e.target.value || null })}
            disabled={!access.canEdit}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.email || m.user_id.slice(0, 12)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Reporter</label>
          <select
            className="select select-bordered select-xs w-full"
            value={task.reporter_id || ""}
            onChange={(e) => onUpdate({ reporter_id: e.target.value || null })}
            disabled={!access.canEdit}
          >
            <option value="">None</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.email || m.user_id.slice(0, 12)}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Start Date</label>
          <input
            type="date"
            className="input input-bordered input-xs w-full"
            value={task.start_date ? task.start_date.split("T")[0] : ""}
            onChange={(e) =>
              onUpdate({ start_date: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
            disabled={!access.canEdit}
          />
        </div>
        <div>
          <label className="text-xs text-base-content/50 block mb-1">Due Date</label>
          <input
            type="date"
            className="input input-bordered input-xs w-full"
            value={task.due_date ? task.due_date.split("T")[0] : ""}
            onChange={(e) =>
              onUpdate({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
            disabled={!access.canEdit}
          />
        </div>
      </div>
      
      {/* Hours */}
      <div className="grid grid-cols-2 gap-2">
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
            disabled={!access.canEdit}
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
            disabled={!access.canEdit}
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
        <label className="text-xs text-base-content/50 flex items-center gap-1 mb-1">
          <Tag className="w-3 h-3" /> Labels
        </label>
        <div className="flex flex-wrap gap-1">
          {(task.labels || []).map((l) => (
            <span key={l} className="badge badge-xs badge-outline gap-1 group">
              {l}
              {access.canEdit && (
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => onUpdate({ labels: (task.labels || []).filter((x) => x !== l) })}
                >
                  <X className="w-2 h-2" />
                </button>
              )}
            </span>
          ))}
          {access.canEdit && (
            labelsOpen ? (
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
                      onUpdate({ labels: [...(task.labels || []), newLabel.trim()] });
                      setNewLabel("");
                      setLabelsOpen(false);
                    }
                    if (e.key === "Escape") setLabelsOpen(false);
                  }}
                />
                <button className="btn btn-ghost btn-xs" onClick={() => setLabelsOpen(false)}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button className="badge badge-xs badge-ghost" onClick={() => setLabelsOpen(true)}>
                <Plus className="w-2 h-2" />
              </button>
            )
          )}
        </div>
      </div>
      
      {/* Description */}
      <div>
        <label className="text-xs text-base-content/50 block mb-1">Description</label>
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
              <button className="btn btn-ghost btn-xs" onClick={() => setEditingDesc(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "text-sm min-h-[60px] p-2 rounded border border-base-200 bg-base-50",
              access.canEdit && "cursor-pointer hover:border-base-300"
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
                {access.canEdit ? "Click to add description…" : "No description"}
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
  orgId,
  projectId,
  taskId,
  items,
  access,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Checklist[];
  access: AccessControl;
}) {
  const qc = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);
  const [newTitle, setNewTitle] = useState("");

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => api.checklists.create(orgId, projectId, taskId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklists"] });
      setNewTitle("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_checked }: { id: string; is_checked: boolean }) =>
      api.checklists.update(orgId, projectId, taskId, id, { is_checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.checklists.delete(orgId, projectId, taskId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });

  const total = items.length;
  const checked = items.filter((c) => c.is_checked).length;

  return (
    <div className="h-full flex flex-col">
      {/* Progress */}
      {total > 0 && (
        <div className="p-3 pb-0 shrink-0">
          <div className="flex items-center justify-between text-xs text-base-content/60 mb-1">
            <span>Progress</span>
            <span>{checked}/{total}</span>
          </div>
          <progress className="progress progress-success w-full h-1.5" value={checked} max={total} />
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
            style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}
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
                    onClick={() => access.canEdit && toggleMutation.mutate({ id: item.id, is_checked: !item.is_checked })}
                    disabled={!access.canEdit}
                  >
                    {item.is_checked ? (
                      <CheckSquare className="w-4 h-4 text-success" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <span className={cn("flex-1 text-sm truncate", item.is_checked && "line-through text-base-content/40")}>
                    {item.title}
                  </span>
                  {access.canEdit && (
                    <button
                      className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={() => deleteMutation.mutate(item.id)}
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
            if (newTitle.trim()) createMutation.mutate(newTitle.trim());
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
              disabled={!newTitle.trim() || createMutation.isPending}
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
  orgId,
  projectId,
  taskId,
  items,
  members,
  currentUserId,
  access,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Comment[];
  members: OrgMember[];
  currentUserId: string;
  access: AccessControl;
}) {
  const qc = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 3,
  });

  const createMutation = useMutation({
    mutationFn: (b: string) => api.comments.create(orgId, projectId, taskId, { body: b }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments"] });
      setBody("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.comments.delete(orgId, projectId, taskId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments"] }),
  });

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
            style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const comment = items[virtualItem.index];
              const canDelete = comment.user_id === currentUserId || access.canDelete;
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
                      <span className="font-medium text-xs">{memberLabel(comment.user_id, members)}</span>
                      <span className="text-[10px] text-base-content/50">{formatRelative(comment.created_at)}</span>
                      {canDelete && (
                        <button
                          className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                          onClick={() => deleteMutation.mutate(comment.id)}
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
            if (body.trim()) createMutation.mutate(body.trim());
          }}
        >
          <div className="flex gap-2">
            <textarea
              className="textarea textarea-bordered textarea-xs flex-1 min-h-[60px] resize-none"
              placeholder="Add a comment..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
                  e.preventDefault();
                  createMutation.mutate(body.trim());
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!body.trim() || createMutation.isPending}
              className="self-end"
            >
              <Send className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-[10px] text-base-content/40 mt-1">⌘+Enter to send</p>
        </form>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Attachments Tab
   ═══════════════════════════════════════════════════════ */

function AttachmentsTab({
  orgId,
  projectId,
  taskId,
  items,
  access,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Attachment[];
  access: AccessControl;
}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.attachments.delete(orgId, projectId, taskId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attachments"] }),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.attachments.upload(orgId, projectId, taskId, file);
      qc.invalidateQueries({ queryKey: ["attachments"] });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDownload = async (att: Attachment) => {
    try {
      setLoadingId(att.id);
      const res = await api.attachments.download(orgId, projectId, taskId, att.id);
      window.open(res.download_url, "_blank");
    } finally {
      setLoadingId(null);
    }
  };

  const handlePreview = async (att: Attachment) => {
    try {
      setLoadingId(att.id);
      const res = await api.attachments.download(orgId, projectId, taskId, att.id);
      setPreview({ url: res.download_url, mime: att.mime_type, name: att.filename });
    } finally {
      setLoadingId(null);
    }
  };

  const isImage = (mime: string) => mime.startsWith("image/");
  const isPDF = (mime: string) => mime === "application/pdf";
  const isPreviewable = (mime: string) => isImage(mime) || isPDF(mime);

  const fileIcon = (mime: string) => {
    if (isImage(mime)) return <ImageIcon className="w-4 h-4 text-primary" />;
    if (isPDF(mime)) return <FileText className="w-4 h-4 text-error" />;
    return <Paperclip className="w-4 h-4" />;
  };

  return (
    <>
      <div className="p-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-center text-base-content/40 text-sm py-8">
            <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No attachments yet
          </div>
        ) : (
          items.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 p-2 rounded border border-base-200 hover:bg-base-200/50 group"
            >
              <div className="shrink-0">{fileIcon(att.mime_type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{att.filename}</p>
                <p className="text-[10px] text-base-content/50">
                  {(att.file_size / 1024).toFixed(0)} KB
                </p>
              </div>
              <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                {isPreviewable(att.mime_type) && (
                  <button
                    className="btn btn-ghost btn-xs btn-square"
                    disabled={loadingId === att.id}
                    onClick={() => handlePreview(att)}
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  disabled={loadingId === att.id}
                  onClick={() => handleDownload(att)}
                >
                  <Download className="w-3 h-3" />
                </button>
                {access.canEdit && (
                  <button
                    className="btn btn-ghost btn-xs btn-square text-error"
                    onClick={() => deleteMutation.mutate(att.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        
        {access.canAttach && (
          <label className="btn btn-outline btn-xs gap-1 w-full">
            <Upload className="w-3 h-3" />
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>
      
      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div
            className="relative bg-base-100 rounded-lg shadow-xl max-w-3xl max-h-[85vh] w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-base-200">
              <h3 className="font-semibold text-sm truncate">{preview.name}</h3>
              <button className="btn btn-ghost btn-xs btn-square" onClick={() => setPreview(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-center overflow-auto p-4" style={{ maxHeight: "calc(85vh - 48px)" }}>
              {isImage(preview.mime) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt={preview.name} className="max-w-full max-h-[70vh] object-contain rounded" />
              )}
              {isPDF(preview.mime) && (
                <iframe src={preview.url} className="w-full h-[70vh] rounded" title={preview.name} />
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
  orgId,
  projectId,
  taskId,
  dependencies,
  watchers,
  members,
  currentUserId,
  access,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  dependencies: TaskDependency[];
  watchers: TaskWatcher[];
  members: OrgMember[];
  currentUserId: string;
  access: AccessControl;
}) {
  const qc = useQueryClient();
  const isWatching = watchers.some((w) => w.user_id === currentUserId);

  const toggleWatchMutation = useMutation({
    mutationFn: () =>
      isWatching
        ? api.watchers.unwatch(orgId, projectId, taskId)
        : api.watchers.watch(orgId, projectId, taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchers"] }),
  });

  // Note: Watcher removal for other users would need a different API endpoint
  // For now, users can only toggle their own watch status

  const removeDependencyMutation = useMutation({
    mutationFn: (depId: string) => api.dependencies.remove(orgId, projectId, taskId, depId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dependencies"] }),
  });

  return (
    <div className="p-3 space-y-4">
      {/* Watchers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-base-content/50 flex items-center gap-1">
            <Users className="w-3 h-3" /> Watchers ({watchers.length})
          </label>
          <button
            className={cn("btn btn-xs gap-1", isWatching ? "btn-primary" : "btn-outline")}
            onClick={() => toggleWatchMutation.mutate()}
            disabled={toggleWatchMutation.isPending}
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
                <Avatar name={memberLabel(w.user_id, members)} src={memberAvatarUrl(w.user_id, members)} size="xs" />
                <span className="text-xs">{memberLabel(w.user_id, members)}</span>
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
              <div key={`${dep.task_id}-${dep.depends_on_id}`} className="flex items-center gap-2 p-1.5 rounded border border-base-200 text-xs group">
                <span className={cn(
                  "badge badge-xs",
                  dep.type === "blocks" ? "badge-warning" : "badge-info"
                )}>
                  {dep.type}
                </span>
                <span className="flex-1 truncate">{dep.depends_on_id.slice(0, 8)}...</span>
                {access.canEdit && (
                  <button
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                    onClick={() => removeDependencyMutation.mutate(dep.depends_on_id)}
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
