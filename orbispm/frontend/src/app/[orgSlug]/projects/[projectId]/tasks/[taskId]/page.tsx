"use client";

import { useState, use } from "react";
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
} from "lucide-react";
import { statusColor, priorityColor, statusLabel, formatRelative, formatDate, cn } from "@/lib/utils";
import type { Task, Checklist, Comment, Attachment, TaskRule, TaskDependency, TaskStatus, TaskPriority } from "@/types/domain";

// Used by sub-components below

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

  // Queries
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

  // Mutations
  const updateTaskMutation = useMutation({
    mutationFn: (data: Partial<Task>) => api.tasks.update(orgId, projectId, taskId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", orgId, projectId, taskId] }),
  });

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
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task header */}
          <Card>
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-2xl font-bold">{task.title}</h1>
              <div className="flex gap-2">
                <Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
                <Badge variant={priorityColor(task.priority)}>{statusLabel(task.priority)}</Badge>
              </div>
            </div>
            {task.description && (
              <p className="text-base-content/70 whitespace-pre-wrap">{task.description}</p>
            )}
            {task.labels && task.labels.length > 0 && (
              <div className="flex gap-1 mt-3">
                {task.labels.map((l) => (
                  <span key={l} className="badge badge-outline badge-sm">{l}</span>
                ))}
              </div>
            )}
          </Card>

          {/* Quick status update */}
          <div className="flex gap-2 flex-wrap">
            {(["todo", "in_progress", "done", "blocked"] as TaskStatus[]).map((s) => (
              <button
                key={s}
                className={cn("btn btn-sm", task.status === s ? "btn-primary" : "btn-outline")}
                onClick={() => updateTaskMutation.mutate({ status: s })}
                disabled={updateTaskMutation.isPending}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>

          {/* Checklists */}
          <ChecklistSection orgId={orgId} projectId={projectId} taskId={taskId} items={checklists?.data || []} />

          {/* Comments */}
          <CommentsSection orgId={orgId} projectId={projectId} taskId={taskId} items={comments?.data || []} userId={user?.id || ""} />

          {/* Attachments */}
          <AttachmentsSection orgId={orgId} projectId={projectId} taskId={taskId} items={attachments?.data || []} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details card */}
          <Card title="Details">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-base-content/60">Assignee</span>
                <span>{task.assignee_id ? task.assignee_id.slice(0, 8) : "Unassigned"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Reporter</span>
                <span>{task.reporter_id ? task.reporter_id.slice(0, 8) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Due Date</span>
                <span>{task.due_date ? formatDate(task.due_date) : "Not set"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Start Date</span>
                <span>{task.start_date ? formatDate(task.start_date) : "Not set"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Estimated</span>
                <span>{task.estimated_hours ? `${task.estimated_hours}h` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Actual</span>
                <span>{task.actual_hours ? `${task.actual_hours}h` : "—"}</span>
              </div>
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
          <Card title="Dependencies">
            {(!dependencies?.data || dependencies.data.length === 0) ? (
              <p className="text-sm text-base-content/50">No dependencies</p>
            ) : (
              <ul className="space-y-2">
                {dependencies.data.map((dep: TaskDependency) => (
                  <li key={dep.depends_on_id} className="flex items-center gap-2 text-sm">
                    <Link2 className="w-3 h-3" />
                    <span className="font-mono text-xs">{dep.depends_on_id.slice(0, 8)}</span>
                    <Badge variant="badge-ghost">{dep.type}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Rules */}
          <Card title="Rules">
            {(!rules?.data || rules.data.length === 0) ? (
              <p className="text-sm text-base-content/50">No rules configured</p>
            ) : (
              <ul className="space-y-2">
                {rules.data.map((rule: TaskRule) => (
                  <li key={rule.id} className="flex items-center gap-2 text-sm">
                    <Shield className="w-3 h-3" />
                    <span>{rule.rule_type}</span>
                    {rule.is_required && <Badge variant="badge-error">Required</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
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
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  items: Comment[];
  userId: string;
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
                <span className="font-medium text-sm">{comment.user_id.slice(0, 8)}</span>
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
