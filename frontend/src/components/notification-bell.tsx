"use client";

import { api } from "@/lib/api";
import { cn, formatRelative } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Notification } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function getNotificationHref(
  notif: Notification,
  orgSlug: string,
): string | null {
  const p = notif.payload;
  if (!p) return null;
  const projectId = p.project_id as string | undefined;
  const taskId = p.task_id as string | undefined;
  if (projectId && taskId)
    return `/${orgSlug}/projects/${projectId}?task=${taskId}`;
  if (projectId) return `/${orgSlug}/projects/${projectId}`;
  const teamId = p.team_id as string | undefined;
  if (teamId) return `/${orgSlug}/teams`;
  return null;
}

export function NotificationBell() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isEntered, setIsEntered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when navigating to a new page
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close dropdown on Escape.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Smooth entrance animation.
  useEffect(() => {
    if (!open) {
      setIsEntered(false);
      return;
    }

    const frame = requestAnimationFrame(() => setIsEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", currentOrg?.id],
    queryFn: () => api.notifications.list(currentOrg!.id, "limit=10"),
    enabled: !!currentOrg,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(currentOrg!.id, id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["notifications", currentOrg?.id] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(currentOrg!.id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["notifications", currentOrg?.id] }),
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
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        className="btn btn-ghost btn-sm btn-square indicator"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="indicator-item badge badge-xs badge-primary">
            {unread}
          </span>
        )}
      </button>

      {/* Dropdown card */}
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-2 z-50",
            "w-80 rounded-box border border-base-200 bg-base-100/95 backdrop-blur-[20px] shadow-lg",
            "transition-all duration-220 ease-out",
            isEntered
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 -translate-y-1 scale-[0.985]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-base-200 p-3">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unread > 0 && (
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-center text-sm text-base-content/50">
                No notifications
              </p>
            ) : (
              items.map((notif: Notification) => (
                <div
                  key={notif.id}
                  className={cn(
                    "cursor-pointer border-b border-base-200 p-3 last:border-0 hover:bg-base-200",
                    !notif.read_at && "bg-primary/5",
                  )}
                  onClick={() => handleNotifClick(notif)}
                >
                  <div className="flex items-start gap-2">
                    {/* Unread dot */}
                    <div className="mt-1.5 flex-shrink-0">
                      {!notif.read_at ? (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      ) : (
                        <div className="h-2 w-2" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">
                        {notif.title}
                      </p>
                      <p className="line-clamp-2 text-xs text-base-content/60">
                        {notif.body}
                      </p>
                      <p className="mt-1 text-xs text-base-content/40">
                        {formatRelative(notif.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-base-200 p-2">
            <Link
              href={`/${orgSlug}/notifications`}
              className="btn btn-ghost btn-sm w-full"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
