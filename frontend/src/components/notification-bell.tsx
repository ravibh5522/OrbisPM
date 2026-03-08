"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Bell, CheckCheck } from "lucide-react";
import { formatRelative, cn } from "@/lib/utils";
import type { Notification } from "@/types/domain";

export function NotificationBell() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", currentOrg?.id],
    queryFn: () => api.notifications.list(currentOrg!.id, "limit=10"),
    enabled: !!currentOrg,
    refetchInterval: 30000, // Poll every 30s
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(currentOrg!.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(currentOrg!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = notifications?.data || [];
  const unread = items.filter((n: Notification) => !n.read_at).length;

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
                  onClick={() => !notif.read_at && markReadMutation.mutate(notif.id)}
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
