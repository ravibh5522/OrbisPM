"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Badge, ConfirmDialog, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Plus,
  Megaphone,
  Trash2,
  Pin,
  PinOff,
  Pencil,
  Eye,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { Announcement, OrgMember } from "@/types/domain";

interface AnnouncementForm {
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  expires_at: string;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

// Badge variant classes (DaisyUI badge modifiers)
const PRIORITY_BADGE: Record<string, string> = {
  low: "badge-ghost",
  normal: "badge-primary",
  high: "badge-warning",
  urgent: "badge-error",
};

// Left-border accent per priority (Tailwind border-color utilities)
const PRIORITY_BORDER: Record<string, string> = {
  low: "border-l-4 border-l-base-content/20",
  normal: "border-l-4 border-l-primary",
  high: "border-l-4 border-l-warning",
  urgent: "border-l-4 border-l-error",
};

// Subtle background tint for unread cards per priority
const PRIORITY_UNREAD_BG: Record<string, string> = {
  low: "bg-base-100",
  normal: "bg-primary/5",
  high: "bg-warning/5",
  urgent: "bg-error/5",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getExpiryStatus(expiresAt?: string): "expired" | "soon" | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const now = new Date();
  if (exp < now) return "expired";
  const diffDays = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) return "soon";
  return null;
}

export function ProjectAnnouncements({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [viewTarget, setViewTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [error, setError] = useState("");

  const canCreate = can("announcements", "create");
  const canUpdate = can("announcements", "update");
  const canDelete = can("announcements", "delete");

  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements", orgId, projectId],
    queryFn: () =>
      api.announcements.list(orgId, `project_id=${projectId}&limit=50`),
    enabled: !!orgId && !!projectId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  const { data: members } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
    staleTime: 5 * 60_000,
  });

  const memberMap = new Map<string, OrgMember>();
  members?.data?.forEach((m) => memberMap.set(m.user_id, m));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors },
  } = useForm<AnnouncementForm>();

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    setValue: setEditValue,
    formState: { errors: editErrors },
  } = useForm<AnnouncementForm>();

  const queryKey = ["announcements", orgId, projectId] as const;
  type CacheData = { data: Announcement[]; total: number; limit: number; offset: number } | undefined;

  const createMutation = useMutation({
    mutationFn: (data: AnnouncementForm) =>
      api.announcements.create(orgId, {
        title: data.title,
        body: data.body,
        priority: data.priority || "normal",
        pinned: data.pinned ?? false,
        expires_at: data.expires_at || undefined,
        project_id: projectId,
      }),
    onSuccess: (created: Announcement) => {
      // Instantly insert the new announcement at the top of the list
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return { ...old, data: [created, ...old.data], total: old.total + 1 };
      });
      // Background refetch for server reconciliation
      qc.invalidateQueries({ queryKey });
      setShowCreate(false);
      reset();
      setError("");
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to create announcement"
      ),
  });

  const updateMutation = useMutation({
    mutationFn: (data: AnnouncementForm) =>
      api.announcements.update(orgId, editTarget!.id, {
        title: data.title,
        body: data.body,
        priority: data.priority,
        pinned: data.pinned,
        expires_at: data.expires_at || undefined,
      }),
    onSuccess: (updated: Announcement) => {
      // Instantly replace the updated announcement in the list
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return { ...old, data: old.data.map((a) => (a.id === updated.id ? updated : a)) };
      });
      qc.invalidateQueries({ queryKey });
      setEditTarget(null);
      resetEdit();
      setError("");
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to update announcement"
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.announcements.delete(orgId, id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<CacheData>(queryKey);
      // Instantly remove the deleted announcement
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((a) => a.id !== id), total: old.total - 1 };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      setDeleteTarget(null);
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.announcements.markRead(orgId, id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<CacheData>(queryKey);
      // Instantly mark as read
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return { ...old, data: old.data.map((a) => (a.id === id ? { ...a, unread: false } : a)) };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.announcements.update(orgId, id, { pinned }),
    onMutate: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<CacheData>(queryKey);
      // Instantly toggle pin
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return { ...old, data: old.data.map((a) => (a.id === id ? { ...a, pinned } : a)) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const openEdit = (a: Announcement) => {
    setEditTarget(a);
    setEditValue("title", a.title);
    setEditValue("body", a.body);
    setEditValue("priority", a.priority);
    setEditValue("pinned", a.pinned);
    setEditValue("expires_at", a.expires_at ? a.expires_at.split("T")[0] : "");
    setError("");
  };

  const openView = (a: Announcement) => {
    setViewTarget(a);
    if (a.unread) markReadMutation.mutate(a.id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  const list = announcements?.data || [];
  const pinned = list.filter((a) => a.pinned);
  const unpinned = list.filter((a) => !a.pinned);
  const unreadCount = list.filter((a) => a.unread).length;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-base-content">
            Announcements
          </h2>
          {unreadCount > 0 && (
            <span className="badge badge-primary badge-sm">
              {unreadCount} new
            </span>
          )}
        </div>
        {canCreate && (
          <Button
            size="sm"
            onClick={() => {
              setShowCreate(true);
              setError("");
            }}
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </Button>
        )}
      </div>

      {/* Empty state */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-base-200 flex items-center justify-center mb-4">
            <Megaphone className="w-7 h-7 text-base-content/40" />
          </div>
          <p className="text-base font-semibold text-base-content mb-1">
            No announcements yet
          </p>
          <p className="text-sm text-base-content/50 mb-5 max-w-xs">
            Keep your team informed by posting project updates and important
            notices here.
          </p>
          {canCreate && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Create Announcement
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pinned section */}
          {pinned.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Pin className="w-3.5 h-3.5 text-warning" />
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
                  Pinned
                </span>
              </div>
              <div className="space-y-2">
                {pinned.map((a) => (
                  <AnnouncementCard
                    key={a.id}
                    announcement={a}
                    author={memberMap.get(a.author_id)}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onView={() => openView(a)}
                    onEdit={() => openEdit(a)}
                    onDelete={() => setDeleteTarget(a)}
                    onTogglePin={() =>
                      pinMutation.mutate({ id: a.id, pinned: !a.pinned })
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Recent / all section */}
          {unpinned.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <div className="flex items-center gap-1.5 mb-2 mt-5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
                    Recent
                  </span>
                </div>
              )}
              <div className="space-y-2">
                {unpinned.map((a) => (
                  <AnnouncementCard
                    key={a.id}
                    announcement={a}
                    author={memberMap.get(a.author_id)}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onView={() => openView(a)}
                    onEdit={() => openEdit(a)}
                    onDelete={() => setDeleteTarget(a)}
                    onTogglePin={() =>
                      pinMutation.mutate({ id: a.id, pinned: !a.pinned })
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Create Modal ── */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          reset();
          setError("");
        }}
        title="New Announcement"
      >
        {error && (
          <div role="alert" className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-4"
        >
          <Input
            label="Title"
            placeholder="Announcement title"
            {...register("title", { required: "Title is required" })}
            error={formErrors.title?.message}
          />
          <Textarea
            label="Body"
            placeholder="Write your announcement..."
            {...register("body", { required: "Body is required" })}
            error={formErrors.body?.message}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text font-medium text-sm">Priority</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                {...register("priority")}
                defaultValue="normal"
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Expires At" type="date" {...register("expires_at")} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-warning"
              {...register("pinned")}
            />
            <span className="text-sm">Pin this announcement</span>
          </label>
          <div className="modal-action pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Publish
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal
        open={!!editTarget}
        onClose={() => {
          setEditTarget(null);
          resetEdit();
          setError("");
        }}
        title="Edit Announcement"
      >
        {error && (
          <div role="alert" className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <form
          onSubmit={handleEditSubmit((data) => updateMutation.mutate(data))}
          className="space-y-4"
        >
          <Input
            label="Title"
            placeholder="Announcement title"
            {...registerEdit("title", { required: "Title is required" })}
            error={editErrors.title?.message}
          />
          <Textarea
            label="Body"
            placeholder="Write your announcement..."
            {...registerEdit("body", { required: "Body is required" })}
            error={editErrors.body?.message}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text font-medium text-sm">Priority</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                {...registerEdit("priority")}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Expires At"
              type="date"
              {...registerEdit("expires_at")}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-warning"
              {...registerEdit("pinned")}
            />
            <span className="text-sm">Pin this announcement</span>
          </label>
          <div className="modal-action pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditTarget(null);
                resetEdit();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── View Modal ── */}
      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title={viewTarget?.title || "Announcement"}
      >
        {viewTarget && (() => {
          const author = memberMap.get(viewTarget.author_id);
          const expiryStatus = getExpiryStatus(viewTarget.expires_at ?? undefined);
          return (
            <div className="space-y-4">
              {/* Priority + meta row */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={PRIORITY_BADGE[viewTarget.priority] || "badge-ghost"}
                  className="capitalize"
                >
                  {viewTarget.priority}
                </Badge>
                {viewTarget.pinned && (
                  <span className="badge badge-outline badge-sm gap-1">
                    <Pin className="w-3 h-3" /> Pinned
                  </span>
                )}
                {viewTarget.read_count > 0 && (
                  <span className="badge badge-ghost badge-sm gap-1 ml-auto">
                    <Eye className="w-3 h-3" /> {viewTarget.read_count} read
                  </span>
                )}
              </div>

              {/* Author info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-base-200/60">
                <Avatar
                  name={author?.display_name || "Unknown"}
                  src={author?.avatar_url}
                  size="sm"
                />
                <div>
                  <p className="text-sm font-medium leading-tight">
                    {author?.display_name || "Unknown"}
                  </p>
                  <p className="text-xs text-base-content/50">
                    {formatDateTime(viewTarget.created_at)}
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="text-sm text-base-content/80 leading-relaxed whitespace-pre-wrap">
                {viewTarget.body}
              </div>

              {/* Expiry */}
              {viewTarget.expires_at && (
                <div
                  className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 ${
                    expiryStatus === "expired"
                      ? "bg-error/10 text-error"
                      : expiryStatus === "soon"
                      ? "bg-warning/10 text-warning"
                      : "bg-base-200 text-base-content/50"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  {expiryStatus === "expired"
                    ? `Expired on ${formatDate(viewTarget.expires_at)}`
                    : `Expires ${formatDate(viewTarget.expires_at)}`}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Announcement"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── AnnouncementCard ──────────────────────────────────────────────────────────

interface AnnouncementCardProps {
  announcement: Announcement;
  author?: OrgMember;
  canUpdate: boolean;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function AnnouncementCard({
  announcement: a,
  author,
  canUpdate,
  canDelete,
  onView,
  onEdit,
  onDelete,
  onTogglePin,
}: AnnouncementCardProps) {
  const expiryStatus = getExpiryStatus(a.expires_at ?? undefined);
  const borderClass = PRIORITY_BORDER[a.priority] || PRIORITY_BORDER.normal;
  const bgClass = a.unread
    ? (PRIORITY_UNREAD_BG[a.priority] ?? "bg-primary/5")
    : "bg-base-100";

  return (
    <div
      className={`group card shadow-sm border border-base-200 card-compact ${borderClass} ${bgClass} transition-shadow hover:shadow-md`}
    >
      <div className="card-body">
        <div className="flex items-start gap-3">
          {/* Clickable content area */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={onView}
          >
            {/* Title row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-semibold text-sm leading-snug ${
                  a.unread ? "text-primary" : "text-base-content"
                }`}
              >
                {a.title}
              </span>
              {a.unread && (
                <span className="badge badge-primary badge-xs">New</span>
              )}
              <Badge
                variant={PRIORITY_BADGE[a.priority] || "badge-ghost"}
                className="badge-xs capitalize"
              >
                {a.priority}
              </Badge>
              {a.pinned && (
                <Pin className="w-3 h-3 text-warning shrink-0" />
              )}
              {expiryStatus === "expired" && (
                <span className="badge badge-ghost badge-xs text-base-content/40">
                  Expired
                </span>
              )}
              {expiryStatus === "soon" && (
                <span className="badge badge-warning badge-xs gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Expiring soon
                </span>
              )}
            </div>

            {/* Body preview */}
            <p className="text-xs text-base-content/60 mt-1 line-clamp-1 leading-relaxed">
              {a.body}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-2.5 mt-2 text-xs text-base-content/50">
              {author && (
                <div className="flex items-center gap-1">
                  <Avatar
                    name={author.display_name || "?"}
                    src={author.avatar_url}
                    size="xs"
                  />
                  <span>{author.display_name}</span>
                </div>
              )}
              <span>
                {new Date(a.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {a.read_count > 0 && (
                <span className="flex items-center gap-0.5">
                  <Eye className="w-3 h-3" />
                  {a.read_count}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons — visible on hover */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {canUpdate && (
              <>
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={onTogglePin}
                  title={a.pinned ? "Unpin" : "Pin"}
                >
                  {a.pinned ? (
                    <PinOff className="w-3.5 h-3.5" />
                  ) : (
                    <Pin className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={onEdit}
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {canDelete && (
              <button
                className="btn btn-ghost btn-xs btn-square text-error"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
