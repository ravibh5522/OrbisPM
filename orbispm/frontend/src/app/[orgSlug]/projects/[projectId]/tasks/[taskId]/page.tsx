"use client";

import { useState, useRef, useEffect, useCallback, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, Badge, LoadingPage, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  CheckSquare,
  MessageSquare,
  Paperclip,
  Link2,
  Shield,
  Trash2,
  Send,
  Square,
  Check,
  Upload,
  Clock,
  User,
  Plus,
  Pencil,
  X,
  Tag,
  Calendar,
} from "lucide-react";
import { statusColor, priorityColor, statusLabel, formatRelative, formatDate, cn } from "@/lib/utils";
import type { Task, Checklist, Comment, Attachment, TaskRule, TaskDependency, TaskStatus, TaskPriority, OrgMember } from "@/types/domain";

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

function memberLabel(id: string | null | undefined, members: OrgMember[]): string {
  if (!id) return "Unassigned";
  const m = members.find((x) => x.user_id === id);
  return m ? (m.display_name || m.email || m.user_id.slice(0, 8) + "…") : id.slice(0, 8) + "…";
}

/* ─── Inline-edit hook ─── */

function useInlineEdit<T>(
  initial: T,
  onSave: (val: T) => void,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(initial);

  const open = useCallback(() => {
    setDraft(initial);
    setEditing(true);
  }, [initial]);

  const cancel = useCallback(() => setEditing(false), []);

  const save = useCallback(() => {
    onSave(draft);
    setEditing(false);
  }, [draft, onSave]);

  return { editing, draft, setDraft, open, cancel, save };
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

  const { members } = useMemberMap(orgId);

  // ── Queries ──
  const { data: task, isLoading } = useQuery({
    queryKey: ["task", orgId, projectId, taskId],
    queryFn: () => api.tasks.get(orgId, projectId, taskId),
    enabled: !!orgId,
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

  // ── Mutations ──
  const updateTaskMutation = useMutation({
    mutationFn: (data: Partial<Task>) => api.tasks.update(orgId, projectId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", orgId, projectId, taskId] });
      qc.invalidateQueries({ queryKey: ["tasks", orgId, projectId] });
    },
  });

  const patchField = useCallback(
    (field: string, value: unknown) => updateTaskMutation.mutate({ [field]: value } as Partial<Task>),
    [updateTaskMutation],
  );

  if (isLoading || !task) return <LoadingPage />;

  return (
    <div>
      <div className="mb-4">
        <button
          className="btn btn-ghost btn-sm gap-1"
          onClick={() => router.push(`/${orgSlug}/projects/${projectId}`)}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Tasks
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main content ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Editable title + description */}
          <TaskHeaderCard task={task} onPatch={patchField} isPending={updateTaskMutation.isPending} />

          {/* Quick status + priority */}
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold uppercase text-base-content/50 w-16">Status</span>
              {(["todo", "in_progress", "done", "blocked"] as TaskStatus[]).map((s) => (
                <button
                  key={s}
                  className={cn("btn btn-xs", task.status === s ? "btn-primary" : "btn-outline")}
                  onClick={() => patchField("status", s)}
                  disabled={updateTaskMutation.isPending}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold uppercase text-base-content/50 w-16">Priority</span>
              {(["critical", "high", "medium", "low"] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  className={cn("btn btn-xs", task.priority === p ? "btn-secondary" : "btn-outline")}
                  onClick={() => patchField("priority", p)}
                  disabled={updateTaskMutation.isPending}
                >
                  {statusLabel(p)}
                </button>
              ))}
            </div>
          </div>

          {/* Labels editor */}
          <LabelsEditor labels={task.labels || []} onSave={(labels) => patchField("labels", labels)} />

          {/* Checklists */}
          <ChecklistSection orgId={orgId} projectId={projectId} taskId={taskId} items={checklists?.data || []} />

          {/* Comments */}
          <CommentsSection orgId={orgId} projectId={projectId} taskId={taskId} items={comments?.data || []} userId={user?.id || ""} members={members} />

          {/* Attachments */}
          <AttachmentsSection orgId={orgId} projectId={projectId} taskId={taskId} items={attachments?.data || []} />
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
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({ value: m.user_id, label: m.display_name || m.email || m.user_id.slice(0, 12) })),
                ]}
                onSave={(v) => patchField("assignee_id", v || null)}
              />
              {/* Reporter */}
              <SidebarSelect
                label="Reporter"
                value={task.reporter_id || ""}
                displayValue={memberLabel(task.reporter_id, members)}
                options={[
                  { value: "", label: "None" },
                  ...members.map((m) => ({ value: m.user_id, label: m.display_name || m.email || m.user_id.slice(0, 12) })),
                ]}
                onSave={(v) => patchField("reporter_id", v || null)}
              />
              {/* Due Date */}
              <SidebarDate label="Due Date" value={task.due_date || ""} onSave={(v) => patchField("due_date", v || null)} />
              {/* Start Date */}
              <SidebarDate label="Start Date" value={task.start_date || ""} onSave={(v) => patchField("start_date", v || null)} />
              {/* Estimated Hours */}
              <SidebarNumber label="Estimated" suffix="h" value={task.estimated_hours ?? null} onSave={(v) => patchField("estimated_hours", v)} />
              {/* Actual Hours */}
              <SidebarNumber label="Actual" suffix="h" value={task.actual_hours ?? null} onSave={(v) => patchField("actual_hours", v)} />
              {/* Read-only fields */}
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
          <DependenciesSection orgId={orgId} projectId={projectId} taskId={taskId} items={dependencies?.data || []} />

          {/* Rules */}
          <RulesSection orgId={orgId} projectId={projectId} taskId={taskId} items={rules?.data || []} />
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
}: {
  task: Task;
  onPatch: (field: string, value: unknown) => void;
  isPending: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || "");
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

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
              if (e.key === "Enter") { onPatch("title", titleDraft); setEditingTitle(false); }
              if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); }
            }}
          />
          <button className="btn btn-sm btn-primary" onClick={() => { onPatch("title", titleDraft); setEditingTitle(false); }} disabled={isPending}>
            <Check className="w-4 h-4" />
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => { setTitleDraft(task.title); setEditingTitle(false); }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between mb-4 group cursor-pointer" onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}>
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <div className="flex gap-2 items-center">
            <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
            <Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
            <Badge variant={priorityColor(task.priority)}>{statusLabel(task.priority)}</Badge>
          </div>
        </div>
      )}

      {/* Description */}
      {editingDesc ? (
        <div className="space-y-2">
          <textarea
            ref={descRef}
            className="textarea textarea-bordered w-full min-h-24"
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setDescDraft(task.description || ""); setEditingDesc(false); }
            }}
          />
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={() => { onPatch("description", descDraft); setEditingDesc(false); }} disabled={isPending}>Save</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { setDescDraft(task.description || ""); setEditingDesc(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div
          className="group cursor-pointer min-h-8 rounded-lg hover:bg-base-200/50 p-2 -mx-2 transition-colors"
          onClick={() => { setDescDraft(task.description || ""); setEditingDesc(true); }}
        >
          {task.description ? (
            <p className="text-base-content/70 whitespace-pre-wrap">{task.description}</p>
          ) : (
            <p className="text-base-content/40 italic">Click to add description…</p>
          )}
          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40 mt-1 transition-opacity" />
        </div>
      )}
    </Card>
  );
}

/* ─── Labels Tag Editor ─── */

function LabelsEditor({ labels, onSave }: { labels: string[]; onSave: (labels: string[]) => void }) {
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
        {!editing && (
          <button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {labels.map((l) => (
          <span key={l} className="badge badge-outline badge-sm gap-1">
            {l}
            <button onClick={() => removeLabel(l)} className="hover:text-error">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {labels.length === 0 && !editing && (
          <span className="text-xs text-base-content/40">No labels</span>
        )}
      </div>
      {editing && (
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => { e.preventDefault(); addLabel(); }}
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
          <button type="submit" className="btn btn-xs btn-primary" disabled={!input.trim()}>Add</button>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setEditing(false)}>Done</button>
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
  options,
  onSave,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <span className="text-base-content/60 text-xs">{label}</span>
      {editing ? (
        <select
          className="select select-bordered select-xs w-full mt-1"
          value={value}
          onChange={(e) => { onSave(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          autoFocus
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <div
          className="flex justify-between items-center cursor-pointer hover:bg-base-200 rounded px-1 py-0.5 -mx-1 group"
          onClick={() => setEditing(true)}
        >
          <span>{displayValue}</span>
          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40" />
        </div>
      )}
    </div>
  );
}

function SidebarDate({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  // value is ISO string; extract YYYY-MM-DD
  const dateStr = value ? value.slice(0, 10) : "";

  return (
    <div>
      <span className="text-base-content/60 text-xs">{label}</span>
      {editing ? (
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
          className="flex justify-between items-center cursor-pointer hover:bg-base-200 rounded px-1 py-0.5 -mx-1 group"
          onClick={() => setEditing(true)}
        >
          <span>{value ? formatDate(value) : "Not set"}</span>
          <Calendar className="w-3 h-3 opacity-0 group-hover:opacity-40" />
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
}: {
  label: string;
  suffix: string;
  value: number | null;
  onSave: (v: number | null) => void;
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
      {editing ? (
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
          className="flex justify-between items-center cursor-pointer hover:bg-base-200 rounded px-1 py-0.5 -mx-1 group"
          onClick={() => { setDraft(value?.toString() || ""); setEditing(true); }}
        >
          <span>{value != null ? `${value}${suffix}` : "—"}</span>
          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-40" />
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
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Checklist[];
}) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

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
    <Card title={`Checklist ${total > 0 ? `(${checked}/${total})` : ""}`}>
      {total > 0 && (
        <progress className="progress progress-success w-full mb-3" value={checked} max={total} />
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 group">
            <button
              className="btn btn-ghost btn-xs btn-square"
              onClick={() => toggleMutation.mutate({ id: item.id, is_checked: !item.is_checked })}
            >
              {item.is_checked ? (
                <CheckSquare className="w-4 h-4 text-success" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <span className={cn("flex-1", item.is_checked && "line-through text-base-content/40")}>
              {item.title}
            </span>
            <button
              className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
              onClick={() => deleteMutation.mutate(item.id)}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
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
        <Button type="submit" size="sm" disabled={!newTitle.trim()} loading={createMutation.isPending}>
          <Plus className="w-4 h-4" />
        </Button>
      </form>
    </Card>
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
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Comment[];
  userId: string;
  members: OrgMember[];
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");

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
    <Card title={`Comments (${items.length})`}>
      <div className="space-y-4 mb-4">
        {items.map((comment) => (
          <div key={comment.id} className="flex gap-3 group">
            <div className="w-8 h-8 bg-base-200 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{memberLabel(comment.user_id, members)}</span>
                <span className="text-xs text-base-content/50">{formatRelative(comment.created_at)}</span>
                {comment.user_id === userId && (
                  <button
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                    onClick={() => deleteMutation.mutate(comment.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) createMutation.mutate(body.trim());
        }}
      >
        <textarea
          className="textarea textarea-bordered flex-1 textarea-sm"
          placeholder="Add a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
        />
        <Button type="submit" size="sm" disabled={!body.trim()} loading={createMutation.isPending}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
}

// Attachments sub-component
function AttachmentsSection({
  orgId,
  projectId,
  taskId,
  items,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Attachment[];
}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

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

  return (
    <Card title={`Attachments (${items.length})`}>
      <ul className="space-y-2 mb-3">
        {items.map((att) => (
          <li key={att.id} className="flex items-center gap-2 text-sm group">
            <Paperclip className="w-4 h-4" />
            <span className="flex-1">{att.filename}</span>
            <span className="text-base-content/50">{(att.file_size / 1024).toFixed(1)} KB</span>
            <button
              className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
              onClick={() => deleteMutation.mutate(att.id)}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      <label className="btn btn-outline btn-sm gap-1">
        <Upload className="w-4 h-4" />
        {uploading ? "Uploading..." : "Upload File"}
        <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
    </Card>
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
  const [depId, setDepId] = useState("");
  const [depType, setDepType] = useState("blocked_by");

  const addMutation = useMutation({
    mutationFn: (data: { depends_on_id: string; type: string }) =>
      api.dependencies.add(orgId, projectId, taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies"] });
      setDepId("");
      setAdding(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (depOnId: string) => api.dependencies.remove(orgId, projectId, taskId, depOnId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dependencies"] }),
  });

  return (
    <Card title="Dependencies">
      {items.length === 0 && !adding && (
        <p className="text-sm text-base-content/50 mb-2">No dependencies</p>
      )}
      <ul className="space-y-2 mb-2">
        {items.map((dep) => (
          <li key={dep.depends_on_id} className="flex items-center gap-2 text-sm group">
            <Link2 className="w-3 h-3" />
            <span className="font-mono text-xs">{dep.depends_on_id.slice(0, 8)}</span>
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
            if (depId.trim()) addMutation.mutate({ depends_on_id: depId.trim(), type: depType });
          }}
        >
          <input
            className="input input-bordered input-xs w-full"
            placeholder="Task ID to depend on…"
            value={depId}
            onChange={(e) => setDepId(e.target.value)}
            autoFocus
          />
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
            <button type="submit" className="btn btn-xs btn-primary" disabled={!depId.trim()}>Add</button>
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-ghost btn-xs gap-1" onClick={() => setAdding(true)}>
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
      qc.invalidateQueries({ queryKey: ["rules"] });
      setAdding(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.rules.delete(orgId, projectId, taskId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
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
            <input type="checkbox" className="checkbox checkbox-xs" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Required
          </label>
          <div className="flex gap-1">
            <button type="submit" className="btn btn-xs btn-primary">Add</button>
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-ghost btn-xs gap-1" onClick={() => setAdding(true)}>
          <Plus className="w-3 h-3" /> Add Rule
        </button>
      )}
    </Card>
  );
}
