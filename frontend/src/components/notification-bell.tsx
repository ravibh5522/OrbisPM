"use client";

import { api } from "@/lib/api";
import { cn, formatRelative } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Notification } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function getNotificationHref(notif: Notification, orgSlug: string): string | null {
  const p = notif.payload;
  if (!p) return null;
  const projectId = p.project_id as string | undefined;
  const taskId = p.task_id as string | undefined;
  if (projectId && taskId) return `/${orgSlug}/projects/${projectId}?task=${taskId}`;
  if (projectId) return `/${orgSlug}/projects/${projectId}`;
  const teamId = p.team_id as string | undefined;
  if (teamId) return `/${orgSlug}/teams`;
  return null;
}

export function NotificationBell() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", currentOrg?.id],
    queryFn: () => api.notifications.list(currentOrg!.id, "limit=10"),
    enabled: !!currentOrg,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(currentOrg!.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", currentOrg?.id] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(currentOrg!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", currentOrg?.id] }),
  });

  const items = notifications?.data || [];
  const unread = items.filter((n: Notification) => !n.read_at).length;
  const orgSlug = currentOrg?.slug || "";

  const handleNotifClick = (notif: Notification) => {
    if (!notif.read_at) markReadMutation.mutate(notif.id);
    const href = getNotificationHref(notif, orgSlug);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  };

  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-ghost btn-sm btn-square indicator" onClick={() => setOpen(!open)}>
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="indicator-item badge badge-xs badge-primary">{unread}</span>
        )}
      </label>
      {open && (
        <div tabIndex={0} className="dropdown-content z-50 shadow-lg bg-base-100 rounded-box w-80 border border-base-200">
          <div className="p-3 border-b border-base-200 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unread > 0 && (
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => markAllReadMutation.mutate()}
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-sm text-base-content/50 text-center">No notifications</p>
            ) : (
              items.map((notif: Notification) => (
                <div
                  key={notif.id}
                  className={cn(
                    "p-3 border-b border-base-200 last:border-0 hover:bg-base-200 cursor-pointer",
                    !notif.read_at && "bg-primary/5"
                  )}
                  onClick={() => handleNotifClick(notif)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{notif.title}</p>
                      <p className="text-xs text-base-content/60 line-clamp-2">{notif.body}</p>
                      <p className="text-xs text-base-content/40 mt-1">{formatRelative(notif.created_at)}</p>
                    </div>
                    {!notif.read_at && (
                      <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
