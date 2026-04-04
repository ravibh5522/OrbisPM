"use client";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { Avatar, ConfirmDialog } from "@/components/ui/shared";
import { usePermissions } from "@/hooks/use-permissions";
import { api, ApiError } from "@/lib/api";
import type { Announcement, OrgMember } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle,
    CalendarDays,
    Clock,
    Eye,
    Megaphone,
    MoreHorizontal,
    Pencil,
    Pin,
    PinOff,
    Plus,
    Trash2,
    Users,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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

const PRIORITY_CONFIG: Record<
  string,
  { badge: string; dot: string; bg: string; border: string; icon: string }
> = {
  low: {
    badge: "badge-ghost",
    dot: "bg-base-content/30",
    bg: "",
    border: "border-base-200",
    icon: "text-base-content/40",
  },
  normal: {
    badge: "badge-info",
    dot: "bg-info",
    bg: "",
    border: "border-base-200",
    icon: "text-info",
  },
  high: {
    badge: "badge-warning",
    dot: "bg-warning",
    bg: "bg-warning/3",
    border: "border-warning/20",
    icon: "text-warning",
  },
  urgent: {
    badge: "badge-error",
    dot: "bg-error",
    bg: "bg-error/3",
    border: "border-error/20",
    icon: "text-error",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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

function AnnouncementPriorityDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const selectedLabel =
    PRIORITY_OPTIONS.find((o) => o.value === value)?.label || "Normal";

  return (
    <details className="dropdown dropdown-bottom relative z-[40] open:z-[240] w-full">
      <summary className="inline-flex h-10 min-h-10 w-full cursor-pointer list-none items-center justify-between rounded-xl border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md task-filter-select">
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
      <ul className="dropdown-content task-status-menu z-[260] mt-1 max-h-64 w-full overflow-y-auto rounded-xl border p-1 shadow-xl backdrop-blur-2xl">
        {PRIORITY_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <li key={opt.value}>
              <button
                type="button"
                className={`task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "task-status-item-active"
                    : "text-base-content/80 hover:bg-base-200/35"
                }`}
                onClick={(e) => {
                  onChange(opt.value);
                  const details = e.currentTarget.closest("details");
                  if (details) details.removeAttribute("open");
                }}
              >
                <span className="truncate">{opt.label}</span>
                {active ? <span className="text-xs">✓</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
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

  // Real-time updates via WebSocket (event bus invalidation in use-org-socket.ts)
  // No polling needed — announcement.* events trigger query invalidation automatically
  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements", orgId, projectId],
    queryFn: () =>
      api.announcements.list(orgId, `project_id=${projectId}&limit=50`),
    enabled: !!orgId && !!projectId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
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
    setValue: setCreateValue,
    watch: watchCreate,
    formState: { errors: formErrors },
  } = useForm<AnnouncementForm>({
    defaultValues: {
      priority: "normal",
      pinned: false,
      expires_at: "",
      title: "",
      body: "",
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    setValue: setEditValue,
    watch: watchEdit,
    formState: { errors: editErrors },
  } = useForm<AnnouncementForm>({
    defaultValues: {
      priority: "normal",
      pinned: false,
      expires_at: "",
      title: "",
      body: "",
    },
  });

  const queryKey = ["announcements", orgId, projectId] as const;
  type CacheData =
    | { data: Announcement[]; total: number; limit: number; offset: number }
    | undefined;

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
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return { ...old, data: [created, ...old.data], total: old.total + 1 };
      });
      qc.invalidateQueries({ queryKey });
      setShowCreate(false);
      reset();
      setError("");
      toast.success("Announcement created");
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to create announcement",
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
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((a) => (a.id === updated.id ? updated : a)),
        };
      });
      qc.invalidateQueries({ queryKey });
      setEditTarget(null);
      resetEdit();
      setError("");
      toast.success("Announcement updated");
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to update announcement",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.announcements.delete(orgId, id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<CacheData>(queryKey);
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((a) => a.id !== id),
          total: old.total - 1,
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      setDeleteTarget(null);
      toast.success("Announcement deleted");
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.announcements.markRead(orgId, id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<CacheData>(queryKey);
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((a) =>
            a.id === id ? { ...a, unread: false } : a,
          ),
        };
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
      qc.setQueryData(queryKey, (old: CacheData) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((a) => (a.id === id ? { ...a, pinned } : a)),
        };
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
      <div className="space-y-3 p-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl bg-base-200/50 h-24"
          />
        ))}
      </div>
    );
  }

  const list = announcements?.data || [];
  const pinned = list.filter((a) => a.pinned);
  const unpinned = list.filter((a) => !a.pinned);
  const unreadCount = list.filter((a) => a.unread).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-base-content leading-tight">
              Announcements
            </h2>
            <p className="text-xs text-base-content/50">
              {list.length} total
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="badge badge-primary badge-sm font-semibold ml-1">
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
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </Button>
        )}
      </div>

      {/* Empty state */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-5 shadow-sm">
            <Megaphone className="w-8 h-8 text-primary/60" />
          </div>
          <h3 className="text-base font-semibold text-base-content mb-1.5">
            No announcements yet
          </h3>
          <p className="text-sm text-base-content/50 mb-6 max-w-sm">
            Keep your team informed by posting project updates, decisions, and
            important notices.
          </p>
          {canCreate && (
            <Button onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Create First Announcement
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned section */}
          {pinned.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Pin className="w-3.5 h-3.5 text-warning" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-base-content/40">
                  Pinned
                </span>
                <div className="flex-1 h-px bg-base-200" />
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

          {/* Recent section */}
          {unpinned.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Clock className="w-3.5 h-3.5 text-base-content/30" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-base-content/40">
                    Recent
                  </span>
                  <div className="flex-1 h-px bg-base-200" />
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
          <div role="alert" className="alert alert-error alert-sm mb-4">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-4"
        >
          <Input
            label="Title"
            placeholder="What's the announcement about?"
            {...register("title", { required: "Title is required" })}
            error={formErrors.title?.message}
          />
          <Textarea
            label="Body"
            placeholder="Write your announcement details..."
            rows={4}
            {...register("body", { required: "Body is required" })}
            error={formErrors.body?.message}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text font-medium text-sm">Priority</span>
              </label>
              <input type="hidden" {...register("priority")} />
              <AnnouncementPriorityDropdown
                value={watchCreate("priority") || "normal"}
                onChange={(v) => setCreateValue("priority", v)}
              />
            </div>
            <Input label="Expires At" type="date" {...register("expires_at")} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-warning"
              {...register("pinned")}
            />
            <span className="text-sm text-base-content/70">Pin to top</span>
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
              <Megaphone className="w-4 h-4" /> Publish
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
          <div role="alert" className="alert alert-error alert-sm mb-4">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
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
            rows={4}
            {...registerEdit("body", { required: "Body is required" })}
            error={editErrors.body?.message}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text font-medium text-sm">Priority</span>
              </label>
              <input type="hidden" {...registerEdit("priority")} />
              <AnnouncementPriorityDropdown
                value={watchEdit("priority") || "normal"}
                onChange={(v) => setEditValue("priority", v)}
              />
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
            <span className="text-sm text-base-content/70">Pin to top</span>
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
        title=""
        className="max-w-lg"
      >
        {viewTarget &&
          (() => {
            const author = memberMap.get(viewTarget.author_id);
            const expiryStatus = getExpiryStatus(
              viewTarget.expires_at ?? undefined,
            );
            const cfg =
              PRIORITY_CONFIG[viewTarget.priority] || PRIORITY_CONFIG.normal;
            return (
              <div className="space-y-5">
                {/* Title + badges */}
                <div>
                  <h3 className="text-lg font-bold text-base-content mb-2">
                    {viewTarget.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`badge ${cfg.badge} badge-sm capitalize gap-1`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {viewTarget.priority}
                    </span>
                    {viewTarget.pinned && (
                      <span className="badge badge-warning badge-outline badge-sm gap-1">
                        <Pin className="w-3 h-3" /> Pinned
                      </span>
                    )}
                    {viewTarget.read_count > 0 && (
                      <span className="badge badge-ghost badge-sm gap-1 ml-auto">
                        <Users className="w-3 h-3" /> {viewTarget.read_count}{" "}
                        read
                      </span>
                    )}
                  </div>
                </div>

                {/* Author */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-base-200/40 border border-base-200">
                  <Avatar
                    name={author?.display_name || "Unknown"}
                    src={author?.avatar_url}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-base-content leading-tight">
                      {author?.display_name || "Unknown"}
                    </p>
                    <p className="text-xs text-base-content/50">
                      {formatDateTime(viewTarget.created_at)}
                    </p>
                  </div>
                </div>

                {/* Body */}
                <div className="text-sm text-base-content/80 leading-relaxed whitespace-pre-wrap px-1">
                  {viewTarget.body}
                </div>

                {/* Expiry */}
                {viewTarget.expires_at && (
                  <div
                    className={`flex items-center gap-2 text-xs rounded-xl px-4 py-2.5 ${
                      expiryStatus === "expired"
                        ? "bg-error/8 text-error border border-error/15"
                        : expiryStatus === "soon"
                          ? "bg-warning/8 text-warning border border-warning/15"
                          : "bg-base-200/60 text-base-content/50 border border-base-200"
                    }`}
                  >
                    <CalendarDays className="w-3.5 h-3.5 shrink-0" />
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
        message={`Delete "${deleteTarget?.title}"? This action cannot be undone.`}
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
  const [showMenu, setShowMenu] = useState(false);
  const expiryStatus = getExpiryStatus(a.expires_at ?? undefined);
  const cfg = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.normal;

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 ${cfg.border} ${cfg.bg} ${
        a.unread ? "ring-1 ring-primary/20 shadow-sm" : "hover:shadow-sm"
      }`}
    >
      <div
        className="flex items-start gap-4 p-4 cursor-pointer"
        onClick={onView}
      >
        {/* Priority indicator + avatar */}
        <div className="relative shrink-0 mt-0.5">
          <Avatar
            name={author?.display_name || "?"}
            src={author?.avatar_url}
            size="sm"
          />
          {a.unread && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-base-100" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-1">
            <h3
              className={`text-sm font-semibold leading-snug truncate ${a.unread ? "text-base-content" : "text-base-content/90"}`}
            >
              {a.title}
            </h3>
            {a.pinned && <Pin className="w-3 h-3 text-warning shrink-0" />}
          </div>

          {/* Body preview */}
          <p className="text-[13px] text-base-content/55 line-clamp-2 leading-relaxed mb-2">
            {a.body}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[11px] text-base-content/40">
            <span className="font-medium text-base-content/55">
              {author?.display_name || "Unknown"}
            </span>
            <span>{timeAgo(a.created_at)}</span>
            <span
              className={`inline-flex items-center gap-1 capitalize ${cfg.icon}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {a.priority}
            </span>
            {a.read_count > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Eye className="w-3 h-3" /> {a.read_count}
              </span>
            )}
            {expiryStatus === "expired" && (
              <span className="text-base-content/30 line-through">Expired</span>
            )}
            {expiryStatus === "soon" && (
              <span className="text-warning inline-flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> Expiring soon
              </span>
            )}
          </div>
        </div>

        {/* Action menu */}
        {(canUpdate || canDelete) && (
          <div
            className="shrink-0 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <ul className="menu menu-sm task-status-menu border shadow-xl rounded-xl w-44 absolute right-0 top-8 z-[120] p-1.5 backdrop-blur-2xl">
                  {canUpdate && (
                    <>
                      <li>
                        <button
                          onClick={() => {
                            onTogglePin();
                            setShowMenu(false);
                          }}
                          className="task-status-item gap-2 text-xs"
                        >
                          {a.pinned ? (
                            <PinOff className="w-3.5 h-3.5" />
                          ) : (
                            <Pin className="w-3.5 h-3.5" />
                          )}
                          {a.pinned ? "Unpin" : "Pin to top"}
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            onEdit();
                            setShowMenu(false);
                          }}
                          className="task-status-item gap-2 text-xs"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      </li>
                    </>
                  )}
                  {canDelete && (
                    <li>
                      <button
                        onClick={() => {
                          onDelete();
                          setShowMenu(false);
                        }}
                        className="task-status-item gap-2 text-xs text-error"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
