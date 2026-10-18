"use client";

import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, LoadingPage } from "@/components/ui/shared";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  RichTextEditor,
  RichTextViewer,
} from "@/components/editor/rich-text-editor";
import { ChangeRequestModal } from "@/components/tasks/change-request-modal";
import { TaskChangeRequests } from "@/components/tasks/change-requests";
import { RecurrenceSelector } from "@/components/tasks/recurrence-selector";
import { TimeTracker } from "@/components/tasks/time-tracker";
import { Alert } from "@/components/ui/alert";
import { PresenceIndicator } from "@/components/ui/presence-indicator";
import { useProjectPolicies } from "@/hooks/use-policies";
import { PRIORITY_BADGE, STATUS_BADGE } from "@/lib/task-colors";
import { cn, formatDate, formatRelative, statusLabel } from "@/lib/utils";
import type {
  Attachment,
  Checklist,
  Comment,
  OrgMember,
  Task,
  TaskDependency,
  TaskPriority,
  TaskRule,
  TaskStatus,
  TaskUpdateResult,
  TaskWatcher,
} from "@/types/domain";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Shield,
  Square,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";

/* ─── helpers ─── */

function useMemberMap(orgId: string) {
  const { data } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
  const members = data?.data || [];
  const map = new Map<string, string>();
  for (const m of members) {
    map.set(m.user_id, m.display_name || m.email || m.user_id);
  }
  return { members, memberMap: map };
}

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

/* ─── Main page ─── */

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectId: string; taskId: string }>;
}) {
  const { orgSlug, projectId, taskId } = use(params);
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const orgId = currentOrg?.id || "";

  const policies = useProjectPolicies(projectId);
  const canEdit = policies.canEditTask;
  const canDelete = policies.canDeleteTask;
  const canComment = policies.canComment;
  const canAttach = policies.canAttach;
  const { members } = useMemberMap(orgId);

  // ── Queries ──
  const {
    data: task,
    isLoading,
    error: taskError,
  } = useQuery({
    queryKey: ["task", orgId, projectId, taskId],
    queryFn: () => api.tasks.get(orgId, projectId, taskId),
    enabled: !!orgId,
    retry: false,
  });

  const { data: checklists } = useQuery({
    queryKey: ["checklists", orgId, projectId, taskId],
    queryFn: () => api.checklists.list(orgId, projectId, taskId),
    enabled: !!orgId,
  });

  const { data: comments } = useQuery({
    queryKey: ["comments", orgId, projectId, taskId],
    queryFn: () => api.comments.list(orgId, projectId, taskId),
    enabled: !!orgId,
  });

  const { data: attachments } = useQuery({
    queryKey: ["attachments", orgId, projectId, taskId],
    queryFn: () => api.attachments.list(orgId, projectId, taskId),
    enabled: !!orgId,
  });

  const { data: rules } = useQuery({
    queryKey: ["rules", orgId, projectId, taskId],
    queryFn: () => api.rules.list(orgId, projectId, taskId),
    enabled: !!orgId,
  });

  const { data: dependencies } = useQuery({
    queryKey: ["dependencies", orgId, projectId, taskId],
    queryFn: () => api.dependencies.list(orgId, projectId, taskId),
    enabled: !!orgId,
  });

  const { data: watchers } = useQuery({
    queryKey: ["watchers", orgId, projectId, taskId],
    queryFn: () => api.watchers.list(orgId, projectId, taskId),
    enabled: !!orgId,
  });

  // ── Mutations ──
  const [pendingCRChanges, setPendingCRChanges] =
    useState<Partial<Task> | null>(null);
  const updateTaskMutation = useMutation({
    mutationFn: (data: Partial<Task>) =>
      api.tasks.update(orgId, projectId, taskId, data),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["task", orgId, projectId, taskId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
      qc.invalidateQueries({
        queryKey: ["change-requests", orgId, projectId, taskId],
      });
      // Open CR modal so user can add reason / attachments before submitting
      if (
        result &&
        typeof result === "object" &&
        "pending_review" in result &&
        (result as TaskUpdateResult).pending_review
      ) {
        setPendingCRChanges(variables);
      }
    },
  });

  const patchField = useCallback(
    (field: string, value: unknown) =>
      updateTaskMutation.mutate({ [field]: value } as Partial<Task>),
    [updateTaskMutation],
  );

  if (!isLoading && !task) {
    const forbidden =
      taskError instanceof ApiError && taskError.status === 403;
    return (
      <div className="text-center py-12 space-y-2">
        <p>
          {forbidden
            ? "You don't have access to this task."
            : "Task not found."}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${orgSlug}/projects/${projectId}`)}
        >
          Back to Project
        </Button>
      </div>
    );
  }

  if (isLoading || !task) return <LoadingPage />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => router.push(`/${orgSlug}/projects/${projectId}`)}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Tasks
        </Button>
        <PresenceIndicator
          orgId={orgId}
          resourceType="task"
          resourceId={taskId}
          currentUserId={user?.id || ""}
          currentUserName={user?.user_metadata?.name as string | undefined}
          currentUserAvatar={
            user?.user_metadata?.avatar_url as string | undefined
          }
        />
      </div>

      {/* Change request modal — opens when user lacks direct_update */}
      {pendingCRChanges && task && (
        <ChangeRequestModal
          open
          onClose={() => setPendingCRChanges(null)}
          task={task}
          changes={pendingCRChanges}
          orgId={orgId}
          projectId={projectId}
          onCreated={() => {
            setPendingCRChanges(null);
            qc.invalidateQueries({
              queryKey: ["change-requests", orgId, projectId, taskId],
            });
          }}
        />
      )}

      {/* Mutation error toast */}
      {updateTaskMutation.isError && (
        <Alert
          variant="error"
          className="shadow-lg mb-4 text-sm"
          onDismiss={() => updateTaskMutation.reset()}
        >
          {updateTaskMutation.error instanceof Error
            ? updateTaskMutation.error.message
            : "Failed to update task"}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main content ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* View Only badge */}
          {!canEdit && (
            <div className="flex items-center gap-2">
              <span className="badge badge-warning badge-sm gap-1">
                <Eye className="w-3 h-3" /> View Only
              </span>
            </div>
          )}

          {/* Editable title + description */}
          <TaskHeaderCard
            task={task}
            onPatch={patchField}
            isPending={updateTaskMutation.isPending}
            canEdit={canEdit}
          />

          {/* Quick status + priority */}
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold uppercase text-base-content/50 w-16">
                Status
              </span>
              {(["todo", "in_progress", "done", "blocked"] as TaskStatus[]).map(
                (s) => (
                  <button
                    key={s}
                    className={cn(
                      "btn btn-xs",
                      task.status === s ? "btn-primary" : "btn-outline",
                    )}
                    onClick={() => patchField("status", s)}
                    disabled={updateTaskMutation.isPending || !canEdit}
                  >
                    {statusLabel(s)}
                  </button>
                ),
              )}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold uppercase text-base-content/50 w-16">
                Priority
              </span>
              {(["critical", "high", "medium", "low"] as TaskPriority[]).map(
                (p) => (
                  <button
                    key={p}
                    className={cn(
                      "btn btn-xs",
                      task.priority === p ? "btn-secondary" : "btn-outline",
                    )}
                    onClick={() => patchField("priority", p)}
                    disabled={updateTaskMutation.isPending || !canEdit}
                  >
                    {statusLabel(p)}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Labels editor */}
          <LabelsEditor
            labels={task.labels || []}
            onSave={(labels) => patchField("labels", labels)}
            canEdit={canEdit}
          />

          {/* Checklists */}
          <ChecklistSection
            orgId={orgId}
            projectId={projectId}
            taskId={taskId}
            items={checklists?.data || []}
            canEdit={canEdit}
          />

          {/* Comments */}
          <CommentsSection
            orgId={orgId}
            projectId={projectId}
            taskId={taskId}
            items={comments?.data || []}
            userId={user?.id || ""}
            members={members}
            canComment={canComment}
          />

          {/* Attachments */}
          <AttachmentsSection
            orgId={orgId}
            projectId={projectId}
            taskId={taskId}
            items={attachments?.data || []}
            canAttach={canAttach}
          />
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-6">
          {/* Details card – click-to-edit fields */}
          <Card title="Details">
            <div className="space-y-4 text-sm">
              {/* Assignee */}
              <SidebarSelect
                label="Assignee"
                value={task.assignee_id || ""}
                displayValue={memberLabel(task.assignee_id, members)}
                avatarSrc={memberAvatarUrl(task.assignee_id, members)}
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({
                    value: m.user_id,
                    label: m.display_name || m.email || m.user_id.slice(0, 12),
                  })),
                ]}
                onSave={(v) => patchField("assignee_id", v || null)}
                canEdit={canEdit}
              />
              {/* Reporter */}
              <SidebarSelect
                label="Reporter"
                value={task.reporter_id || ""}
                displayValue={memberLabel(task.reporter_id, members)}
                avatarSrc={memberAvatarUrl(task.reporter_id, members)}
                options={[
                  { value: "", label: "None" },
                  ...members.map((m) => ({
                    value: m.user_id,
                    label: m.display_name || m.email || m.user_id.slice(0, 12),
                  })),
                ]}
                onSave={(v) => patchField("reporter_id", v || null)}
                canEdit={canEdit}
              />
              {/* Due Date */}
              <SidebarDate
                label="Due Date"
                value={task.due_date || ""}
                onSave={(v) => patchField("due_date", v || null)}
                canEdit={canEdit}
              />
              {/* Start Date */}
              <SidebarDate
                label="Start Date"
                value={task.start_date || ""}
                onSave={(v) => patchField("start_date", v || null)}
                canEdit={canEdit}
              />
              {/* Estimated Hours */}
              <SidebarNumber
                label="Estimated"
                suffix="h"
                value={task.estimated_hours ?? null}
                onSave={(v) => patchField("estimated_hours", v)}
                canEdit={canEdit}
              />
              {/* Actual Hours */}
              <SidebarNumber
                label="Actual"
                suffix="h"
                value={task.actual_hours ?? null}
                onSave={(v) => patchField("actual_hours", v)}
                canEdit={canEdit}
              />
            </div>

            {/* Time Tracker */}
            <div className="divider my-2"></div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Time Tracker
            </h4>
            <TimeTracker orgId={orgId} projectId={projectId} task={task} />

            {/* Recurrence */}
            <div className="divider my-2"></div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                Repeat
              </h4>
              {canEdit && (
                <RecurrenceSelector
                  value={task.recurrence_rule}
                  onChange={(rule) => patchField("recurrence_rule", rule)}
                />
              )}
              {!canEdit && task.recurrence_rule && (
                <span className="text-sm text-base-content/60">
                  {task.recurrence_rule}
                </span>
              )}
            </div>
            {task.next_occurrence && (
              <div className="text-xs text-base-content/60 mt-1">
                Next: {formatDate(task.next_occurrence)}
              </div>
            )}

            {/* Read-only fields */}
            <div className="divider my-2"></div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-base-content/60">Depth</span>
                <span>{task.depth}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Created</span>
                <span>{formatRelative(task.created_at)}</span>
              </div>
            </div>
          </Card>

          {/* Dependencies */}
          <DependenciesSection
            orgId={orgId}
            projectId={projectId}
            taskId={taskId}
            items={dependencies?.data || []}
          />

          {/* Watchers */}
          <WatchersSection
            orgId={orgId}
            projectId={projectId}
            taskId={taskId}
            watchers={watchers?.data || []}
            userId={user?.id || ""}
            members={members}
          />

          {/* Rules */}
          <RulesSection
            orgId={orgId}
            projectId={projectId}
            taskId={taskId}
            items={rules?.data || []}
          />

          {/* Change Requests */}
          <TaskChangeRequests
            orgId={orgId}
            projectId={projectId}
            taskId={taskId}
            members={members}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Editable Title + Description Card ─── */

function TaskHeaderCard({
  task,
  onPatch,
  isPending,
  canEdit = true,
}: {
  task: Task;
  onPatch: (field: string, value: unknown) => void;
  isPending: boolean;
  canEdit?: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  return (
    <Card>
      {/* Title */}
      {editingTitle ? (
        <div className="flex gap-2 mb-4">
          <input
            ref={titleRef}
            className="input input-bordered input-sm flex-1 text-xl font-bold"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onPatch("title", titleDraft);
                setEditingTitle(false);
              }
              if (e.key === "Escape") {
                setTitleDraft(task.title);
                setEditingTitle(false);
              }
            }}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              onPatch("title", titleDraft);
              setEditingTitle(false);
            }}
            disabled={isPending}
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setTitleDraft(task.title);
              setEditingTitle(false);
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-start justify-between mb-4 group",
            canEdit && "cursor-pointer",
          )}
          onClick={() => {
            if (!canEdit) return;
            setTitleDraft(task.title);
            setEditingTitle(true);
          }}
        >
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <div className="flex gap-2 items-center">
            {canEdit && (
              <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
            )}
            <Badge variant={STATUS_BADGE[task.status]}>
              {statusLabel(task.status)}
            </Badge>
            <Badge variant={PRIORITY_BADGE[task.priority]}>
              {statusLabel(task.priority)}
            </Badge>
          </div>
        </div>
      )}

      {/* Description */}
      {editingDesc ? (
        <div className="space-y-2">
          <RichTextEditor
            content={descDraft}
            onChange={(html) => setDescDraft(html)}
            placeholder="Write a description…"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                onPatch("description", descDraft);
                setEditingDesc(false);
              }}
              disabled={isPending}
            >
              Save
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setDescDraft(task.description || "");
                setEditingDesc(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "min-h-8 rounded-lg p-2 -mx-2 transition-colors",
            canEdit && "group cursor-pointer hover:bg-base-200/50",
          )}
          onClick={() => {
            if (!canEdit) return;
            setDescDraft(task.description || "");
            setEditingDesc(true);
          }}
        >
          {task.description ? (
            <RichTextViewer
              content={task.description}
              className="text-base-content/70"
            />
          ) : (
            <p className="text-base-content/40 italic">
              {canEdit ? "Click to add description…" : "No description"}
            </p>
          )}
          {canEdit && (
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40 mt-1 transition-opacity" />
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── Labels Tag Editor ─── */

function LabelsEditor({
  labels,
  onSave,
  canEdit = true,
}: {
  labels: string[];
  onSave: (labels: string[]) => void;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const addLabel = () => {
    const val = input.trim().toLowerCase();
    if (val && !labels.includes(val)) {
      onSave([...labels, val]);
    }
    setInput("");
  };

  const removeLabel = (l: string) => onSave(labels.filter((x) => x !== l));

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Tag className="w-4 h-4 text-base-content/50" />
        <span className="text-sm font-semibold">Labels</span>
        {!editing && canEdit && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setEditing(true)}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {labels.map((l) => (
          <span key={l} className="badge badge-outline badge-sm gap-1">
            {l}
            {canEdit && (
              <button
                onClick={() => removeLabel(l)}
                className="hover:text-error"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {labels.length === 0 && !editing && (
          <span className="text-xs text-base-content/40">No labels</span>
        )}
      </div>
      {editing && (
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            addLabel();
          }}
        >
          <input
            ref={inputRef}
            className="input input-bordered input-xs flex-1"
            placeholder="Add label…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            type="submit"
            className="btn btn-xs btn-primary"
            disabled={!input.trim()}
          >
            Add
          </button>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            onClick={() => setEditing(false)}
          >
            Done
          </button>
        </form>
      )}
    </Card>
  );
}

/* ─── Sidebar click-to-edit components ─── */

function SidebarSelect({
  label,
  value,
  displayValue,
  avatarSrc,
  options,
  onSave,
  canEdit = true,
}: {
  label: string;
  value: string;
  displayValue: string;
  avatarSrc?: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <span className="text-base-content/60 text-xs">{label}</span>
      {editing && canEdit ? (
        <select
          className="select select-bordered select-xs w-full mt-1"
          value={value}
          onChange={(e) => {
            onSave(e.target.value);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          autoFocus
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div
          className={cn(
            "flex justify-between items-center rounded px-1 py-0.5 -mx-1 group",
            canEdit && "cursor-pointer hover:bg-base-200",
          )}
          onClick={() => canEdit && setEditing(true)}
        >
          <div className="flex items-center gap-1.5">
            {value && <Avatar name={displayValue} src={avatarSrc} size="xs" />}
            <span>{displayValue}</span>
          </div>
          {canEdit && (
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40" />
          )}
        </div>
      )}
    </div>
  );
}

function SidebarDate({
  label,
  value,
  onSave,
  canEdit = true,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // value is ISO string; extract YYYY-MM-DD
  const dateStr = value ? value.slice(0, 10) : "";

  return (
    <div>
      <span className="text-base-content/60 text-xs">{label}</span>
      {editing && canEdit ? (
        <div className="flex gap-1 mt-1">
          <input
            type="date"
            className="input input-bordered input-xs flex-1"
            defaultValue={dateStr}
            autoFocus
            onChange={(e) => {
              if (e.target.value) {
                onSave(new Date(e.target.value).toISOString());
              } else {
                onSave("");
              }
              setEditing(false);
            }}
            onBlur={() => setEditing(false)}
          />
        </div>
      ) : (
        <div
          className={cn(
            "flex justify-between items-center rounded px-1 py-0.5 -mx-1 group",
            canEdit && "cursor-pointer hover:bg-base-200",
          )}
          onClick={() => canEdit && setEditing(true)}
        >
          <span>{value ? formatDate(value) : "Not set"}</span>
          {canEdit && (
            <Calendar className="w-3 h-3 opacity-0 group-hover:opacity-40" />
          )}
        </div>
      )}
    </div>
  );
}

function SidebarNumber({
  label,
  suffix,
  value,
  onSave,
  canEdit = true,
}: {
  label: string;
  suffix: string;
  value: number | null;
  onSave: (v: number | null) => void;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() || "");

  const commit = () => {
    const n = parseFloat(draft);
    onSave(isNaN(n) ? null : n);
    setEditing(false);
  };

  return (
    <div>
      <span className="text-base-content/60 text-xs">{label}</span>
      {editing && canEdit ? (
        <input
          type="number"
          step="0.5"
          min="0"
          className="input input-bordered input-xs w-full mt-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
        />
      ) : (
        <div
          className={cn(
            "flex justify-between items-center rounded px-1 py-0.5 -mx-1 group",
            canEdit && "cursor-pointer hover:bg-base-200",
          )}
          onClick={() => {
            if (!canEdit) return;
            setDraft(value?.toString() || "");
            setEditing(true);
          }}
        >
          <span>{value != null ? `${value}${suffix}` : "—"}</span>
          {canEdit && (
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40" />
          )}
        </div>
      )}
    </div>
  );
}

// Checklist sub-component
function ChecklistSection({
  orgId,
  projectId,
  taskId,
  items,
  canEdit = true,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Checklist[];
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      api.checklists.create(orgId, projectId, taskId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["checklists", orgId, projectId, taskId],
      });
      setNewTitle("");
      toast.success("Checklist item added");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_checked }: { id: string; is_checked: boolean }) =>
      api.checklists.update(orgId, projectId, taskId, id, { is_checked }),
    onMutate: async ({ id, is_checked }) => {
      await qc.cancelQueries({
        queryKey: ["checklists", orgId, projectId, taskId],
      });
      const previousChecklists = qc.getQueryData([
        "checklists",
        orgId,
        projectId,
        taskId,
      ]);
      qc.setQueryData(
        ["checklists", orgId, projectId, taskId],
        (old: { data: Checklist[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((item) =>
              item.id === id ? { ...item, is_checked } : item,
            ),
          };
        },
      );
      return { previousChecklists };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousChecklists) {
        qc.setQueryData(
          ["checklists", orgId, projectId, taskId],
          context.previousChecklists,
        );
      }
    },
    onSettled: () =>
      qc.invalidateQueries({
        queryKey: ["checklists", orgId, projectId, taskId],
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.checklists.delete(orgId, projectId, taskId, id),
    onMutate: async (id) => {
      await qc.cancelQueries({
        queryKey: ["checklists", orgId, projectId, taskId],
      });
      const previousChecklists = qc.getQueryData([
        "checklists",
        orgId,
        projectId,
        taskId,
      ]);
      qc.setQueryData(
        ["checklists", orgId, projectId, taskId],
        (old: { data: Checklist[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.filter((item) => item.id !== id),
          };
        },
      );
      return { previousChecklists };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousChecklists) {
        qc.setQueryData(
          ["checklists", orgId, projectId, taskId],
          context.previousChecklists,
        );
      }
    },
    onSettled: () =>
      qc.invalidateQueries({
        queryKey: ["checklists", orgId, projectId, taskId],
      }),
  });

  const total = items.length;
  const checked = items.filter((c) => c.is_checked).length;

  return (
    <Card title={`Checklist ${total > 0 ? `(${checked}/${total})` : ""}`}>
      {total > 0 && (
        <progress
          className="progress progress-success w-full mb-3"
          value={checked}
          max={total}
        />
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 group">
            <button
              className="btn btn-ghost btn-xs btn-square"
              onClick={() =>
                canEdit &&
                toggleMutation.mutate({
                  id: item.id,
                  is_checked: !item.is_checked,
                })
              }
              disabled={!canEdit}
            >
              {item.is_checked ? (
                <CheckSquare className="w-4 h-4 text-success" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <span
              className={cn(
                "flex-1",
                item.is_checked && "line-through text-base-content/40",
              )}
            >
              {item.title}
            </span>
            {canEdit && (
              <button
                className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                onClick={() => deleteMutation.mutate(item.id)}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="flex gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) createMutation.mutate(newTitle.trim());
          }}
        >
          <input
            className="input input-bordered input-sm flex-1"
            placeholder="Add item..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!newTitle.trim()}
            loading={createMutation.isPending}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </form>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════
   @Mention rendering — highlights @name in comment body
   ═══════════════════════════════════════════════════════ */
const MENTION_REGEX = /(@[a-zA-Z0-9._-]+)/g;

function MentionText({
  body,
  members,
}: {
  body: string;
  members: OrgMember[];
}) {
  // Build set of known names for highlighting
  const knownNames = new Set(
    members.flatMap((m) => {
      const names: string[] = [];
      if (m.display_name)
        names.push(`@${m.display_name.replace(/\s/g, "").toLowerCase()}`);
      if (m.email) names.push(`@${m.email.split("@")[0].toLowerCase()}`);
      return names;
    }),
  );

  const parts = body.split(MENTION_REGEX);
  return (
    <p className="text-sm whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (MENTION_REGEX.test(part) && knownNames.has(part.toLowerCase())) {
          return (
            <span
              key={i}
              className="bg-primary/15 text-primary font-medium rounded px-0.5"
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

/* ═══════════════════════════════════════════════════════
   MentionInput — textarea with @autocomplete dropdown
   ═══════════════════════════════════════════════════════ */
function MentionInput({
  value,
  onChange,
  members,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  members: OrgMember[];
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [query, setQuery] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  const suggestions = members
    .filter((m) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (m.display_name && m.display_name.toLowerCase().includes(q)) ||
        m.email.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart || 0;
    onChange(val);
    setCursorPos(pos);

    // Check if we're in a @mention context
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@([a-zA-Z0-9._-]*)$/);
    if (atMatch) {
      setQuery(atMatch[1]);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const insertMention = (member: OrgMember) => {
    const name = member.display_name
      ? member.display_name.replace(/\s/g, "")
      : member.email?.split("@")[0] || "user";
    const textBefore = value.slice(0, cursorPos);
    const atIdx = textBefore.lastIndexOf("@");
    const before = value.slice(0, atIdx);
    const after = value.slice(cursorPos);
    const newVal = `${before}@${name} ${after}`;
    onChange(newVal);
    setShowSuggestions(false);

    // Refocus textarea
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        const newPos = atIdx + name.length + 2; // @name + space
        el.focus();
        el.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        className="textarea textarea-bordered w-full textarea-sm"
        placeholder={placeholder}
        value={value}
        onChange={handleInput}
        onKeyDown={(e) => {
          if (e.key === "Escape") setShowSuggestions(false);
        }}
        rows={2}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1 w-64 bg-base-100 border border-base-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {suggestions.map((m) => (
            <button
              key={m.user_id}
              type="button"
              className="flex items-center gap-2 w-full p-2 hover:bg-base-200 text-left text-sm"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                insertMention(m);
              }}
            >
              <Avatar
                name={m.display_name || m.email}
                src={m.avatar_url}
                size="xs"
              />
              <div className="truncate">
                <span className="font-medium">
                  {m.display_name || m.email?.split("@")[0] || "User"}
                </span>
                <span className="text-xs text-base-content/50 ml-1">
                  {m.email}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Comments sub-component
function CommentsSection({
  orgId,
  projectId,
  taskId,
  items,
  userId,
  members,
  canComment = true,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Comment[];
  userId: string;
  members: OrgMember[];
  canComment?: boolean;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const createMutation = useMutation({
    mutationFn: (b: string) =>
      api.comments.create(orgId, projectId, taskId, { body: b }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["comments", orgId, projectId, taskId],
      });
      setBody("");
      toast.success("Comment added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.comments.delete(orgId, projectId, taskId, id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["comments", orgId, projectId, taskId],
      });
      toast.success("Comment deleted");
    },
  });

  return (
    <Card title={`Comments (${items.length})`}>
      <div className="space-y-4 mb-4">
        {items.map((comment) => (
          <div key={comment.id} className="flex gap-3 group">
            <Avatar
              name={memberLabel(comment.user_id, members)}
              src={memberAvatarUrl(comment.user_id, members)}
              size="sm"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">
                  {memberLabel(comment.user_id, members)}
                </span>
                <span className="text-xs text-base-content/50">
                  {formatRelative(comment.created_at)}
                </span>
                {comment.user_id === userId && (
                  <button
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                    onClick={() => deleteMutation.mutate(comment.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <MentionText body={comment.body} members={members} />
            </div>
          </div>
        ))}
      </div>
      {canComment && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) createMutation.mutate(body.trim());
          }}
        >
          <MentionInput
            value={body}
            onChange={setBody}
            members={members}
            placeholder="Add a comment... (use @ to mention)"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!body.trim()}
            loading={createMutation.isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      )}
    </Card>
  );
}

// Attachments sub-component with preview
function AttachmentsSection({
  orgId,
  projectId,
  taskId,
  items,
  canAttach = true,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Attachment[];
  canAttach?: boolean;
}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    mime: string;
    name: string;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.attachments.delete(orgId, projectId, taskId, id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["attachments", orgId, projectId, taskId],
      });
      toast.success("Attachment deleted");
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.attachments.upload(orgId, projectId, taskId, file);
      qc.invalidateQueries({
        queryKey: ["attachments", orgId, projectId, taskId],
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDownload = async (att: Attachment) => {
    try {
      setLoadingId(att.id);
      const res = await api.attachments.download(
        orgId,
        projectId,
        taskId,
        att.id,
      );
      window.open(res.download_url, "_blank");
    } catch {
      // silently fail
    } finally {
      setLoadingId(null);
    }
  };

  const handlePreview = async (att: Attachment) => {
    try {
      setLoadingId(att.id);
      const res = await api.attachments.download(
        orgId,
        projectId,
        taskId,
        att.id,
      );
      setPreview({
        url: res.download_url,
        mime: att.mime_type,
        name: att.filename,
      });
    } catch {
      // silently fail
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
      <Card title={`Attachments (${items.length})`}>
        {items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {items.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-3 p-2 rounded-lg border border-base-200 hover:bg-base-200/50 transition-colors group"
              >
                {/* Icon / thumbnail placeholder */}
                <div className="shrink-0">{fileIcon(att.mime_type)}</div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    title={att.filename}
                  >
                    {att.filename}
                  </p>
                  <p className="text-xs text-base-content/50">
                    {(att.file_size / 1024).toFixed(1)} KB &middot;{" "}
                    {att.mime_type.split("/")[1]?.toUpperCase() ||
                      att.mime_type}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isPreviewable(att.mime_type) && (
                    <button
                      className="btn btn-ghost btn-xs btn-square"
                      title="Preview"
                      disabled={loadingId === att.id}
                      onClick={() => handlePreview(att)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-xs btn-square"
                    title="Download"
                    disabled={loadingId === att.id}
                    onClick={() => handleDownload(att)}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {canAttach && (
                    <button
                      className="btn btn-ghost btn-xs btn-square text-error"
                      title="Delete"
                      onClick={() => deleteMutation.mutate(att.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {canAttach && (
          <label className="btn btn-outline btn-sm gap-1">
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading..." : "Upload File"}
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </Card>

      {/* Preview Modal / Lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative bg-base-100 rounded-lg shadow-xl max-w-4xl max-h-[90vh] w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-base-200">
              <h3 className="font-semibold text-sm truncate">{preview.name}</h3>
              <div className="flex gap-2">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-xs gap-1"
                >
                  <Download className="w-3 h-3" /> Open
                </a>
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={() => setPreview(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Content */}
            <div
              className="flex items-center justify-center overflow-auto p-4"
              style={{ maxHeight: "calc(90vh - 56px)" }}
            >
              {isImage(preview.mime) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              )}
              {isPDF(preview.mime) && (
                <iframe
                  src={preview.url}
                  className="w-full h-[75vh] rounded"
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

// Dependencies sub-component (sidebar)
function DependenciesSection({
  orgId,
  projectId,
  taskId,
  items,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: TaskDependency[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  // Pick the task by searching its title — nobody should have to paste an ID.
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Task | null>(null);
  const [depType, setDepType] = useState("blocked_by");

  const { data: matches } = useQuery({
    queryKey: ["dependency-search", orgId, projectId, query.trim()],
    queryFn: () =>
      api.tasks.list(
        orgId,
        projectId,
        `search=${encodeURIComponent(query.trim())}&limit=8`,
      ),
    enabled: adding && !picked && query.trim().length >= 2,
  });
  const candidates = (matches?.data ?? []).filter(
    (t) => t.id !== taskId && !items.some((d) => d.depends_on_id === t.id),
  );

  const addMutation = useMutation({
    mutationFn: (data: { depends_on_id: string; type: string }) =>
      api.dependencies.add(orgId, projectId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["dependencies", orgId, projectId, taskId],
      });
      setQuery("");
      setPicked(null);
      setAdding(false);
      toast.success("Dependency added");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (depOnId: string) =>
      api.dependencies.remove(orgId, projectId, taskId, depOnId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["dependencies", orgId, projectId, taskId],
      });
      toast.success("Dependency removed");
    },
  });

  return (
    <Card title="Dependencies">
      {items.length === 0 && !adding && (
        <p className="text-sm text-base-content/50 mb-2">No dependencies</p>
      )}
      <ul className="space-y-2 mb-2">
        {items.map((dep) => (
          <li
            key={dep.depends_on_id}
            className="flex items-center gap-2 text-sm group"
          >
            <Link2 className="w-3 h-3" />
            <span
              className="text-xs truncate"
              title={dep.depends_on_title || undefined}
            >
              {dep.depends_on_title || "Unknown task"}
            </span>
            <Badge variant="badge-ghost">{dep.type.replace("_", " ")}</Badge>
            <button
              className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 ml-auto"
              onClick={() => removeMutation.mutate(dep.depends_on_id)}
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (picked)
              addMutation.mutate({
                depends_on_id: picked.id,
                type: depType,
              });
          }}
        >
          <input
            className="input input-bordered input-xs w-full"
            placeholder="Search tasks by title…"
            value={picked ? picked.title : query}
            onChange={(e) => {
              setPicked(null);
              setQuery(e.target.value);
            }}
            autoFocus
          />
          {!picked && query.trim().length >= 2 && (
            <ul className="menu menu-xs bg-base-200 rounded-box max-h-40 overflow-y-auto">
              {candidates.length === 0 ? (
                <li className="px-2 py-1 text-xs text-base-content/50">
                  No matching tasks
                </li>
              ) : (
                candidates.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setPicked(t)}>
                      <span className="truncate">{t.title}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          <select
            className="select select-bordered select-xs w-full"
            value={depType}
            onChange={(e) => setDepType(e.target.value)}
          >
            <option value="blocked_by">Blocked by</option>
            <option value="blocks">Blocks</option>
            <option value="related_to">Related to</option>
          </select>
          <div className="flex gap-1">
            <button
              type="submit"
              className="btn btn-xs btn-primary"
              disabled={!picked}
            >
              Add
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className="btn btn-ghost btn-xs gap-1"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3 h-3" /> Add Dependency
        </button>
      )}
    </Card>
  );
}

// Rules sub-component (sidebar)
function RulesSection({
  orgId,
  projectId,
  taskId,
  items,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: TaskRule[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [ruleType, setRuleType] = useState("all_checklists_done");
  const [required, setRequired] = useState(true);

  const addMutation = useMutation({
    mutationFn: (data: { rule_type: string; is_required: boolean }) =>
      api.rules.create(orgId, projectId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules", orgId, projectId, taskId] });
      setAdding(false);
      toast.success("Rule added");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.rules.delete(orgId, projectId, taskId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules", orgId, projectId, taskId] });
      toast.success("Rule removed");
    },
  });

  return (
    <Card title="Rules">
      {items.length === 0 && !adding && (
        <p className="text-sm text-base-content/50 mb-2">No rules configured</p>
      )}
      <ul className="space-y-2 mb-2">
        {items.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2 text-sm group">
            <Shield className="w-3 h-3" />
            <span>{rule.rule_type.replace(/_/g, " ")}</span>
            {rule.is_required && <Badge variant="badge-error">Required</Badge>}
            <button
              className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 ml-auto"
              onClick={() => removeMutation.mutate(rule.id)}
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate({ rule_type: ruleType, is_required: required });
          }}
        >
          <select
            className="select select-bordered select-xs w-full"
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value)}
          >
            <option value="all_checklists_done">All checklists done</option>
            <option value="min_approvals">Min approvals</option>
            <option value="no_blockers">No blockers</option>
          </select>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Required
          </label>
          <div className="flex gap-1">
            <Button type="submit" variant="primary" size="xs">
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          className="btn btn-ghost btn-xs gap-1"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3 h-3" /> Add Rule
        </button>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════
   Watchers — watch/unwatch toggle + watcher list
   ═══════════════════════════════════════════════════════ */
function WatchersSection({
  orgId,
  projectId,
  taskId,
  watchers,
  userId,
  members,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  watchers: TaskWatcher[];
  userId: string;
  members: OrgMember[];
}) {
  const qc = useQueryClient();
  const isWatching = watchers.some((w) => w.user_id === userId);

  const watchMutation = useMutation({
    mutationFn: () => api.watchers.watch(orgId, projectId, taskId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["watchers", orgId, projectId, taskId],
      }),
  });

  const unwatchMutation = useMutation({
    mutationFn: () => api.watchers.unwatch(orgId, projectId, taskId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["watchers", orgId, projectId, taskId],
      }),
  });

  const pending = watchMutation.isPending || unwatchMutation.isPending;

  return (
    <Card title="Watchers">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-base-content/60">
          {watchers.length} watching
        </span>
        <button
          className={cn(
            "btn btn-sm gap-1",
            isWatching ? "btn-primary" : "btn-outline",
          )}
          disabled={pending}
          onClick={() =>
            isWatching ? unwatchMutation.mutate() : watchMutation.mutate()
          }
        >
          {isWatching ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          {isWatching ? "Unwatch" : "Watch"}
        </button>
      </div>
      {watchers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {watchers.map((w) => {
            const m = members.find((x) => x.user_id === w.user_id);
            return (
              <div
                key={w.user_id}
                className="tooltip"
                data-tip={m?.display_name || m?.email || w.user_id.slice(0, 8)}
              >
                <Avatar
                  name={m?.display_name || m?.email || "?"}
                  src={m?.avatar_url}
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
