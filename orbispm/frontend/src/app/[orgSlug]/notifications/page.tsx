"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { PageHeader, Card, Badge, LoadingPage, EmptyState } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { formatRelative, cn } from "@/lib/utils";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useState } from "react";
import type { Notification } from "@/types/domain";

type FilterMode = "all" | "unread" | "read";

export default function NotificationsPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id || "";
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>("all");

  const { data: notificationsRes, isLoading } = useQuery({
    queryKey: ["notifications", orgId, "all"],
    queryFn: () => api.notifications.list(orgId, "limit=100"),
    enabled: !!orgId,
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(orgId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (isLoading) return <LoadingPage />;

  const all = notificationsRes?.data || [];
  const unread = all.filter((n: Notification) => !n.read_at);
  const filtered =
    filter === "unread"
      ? unread
      : filter === "read"
        ? all.filter((n: Notification) => !!n.read_at)
        : all;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${unread.length} unread notification${unread.length !== 1 ? "s" : ""}`}
        actions={
          unread.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              loading={markAllReadMutation.isPending}
            >
              <CheckCheck className="w-4 h-4 mr-1" /> Mark All Read
            </Button>
          ) : undefined
        }
      />

      {/* Filter tabs */}
      <div className="tabs tabs-boxed bg-base-200 w-fit mb-4">
        {(["all", "unread", "read"] as FilterMode[]).map((f) => (
          <button
            key={f}
            className={cn("tab tab-sm", filter === f && "tab-active")}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? `All (${all.length})` : f === "unread" ? `Unread (${unread.length})` : "Read"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-16 h-16" />}
          title={filter === "unread" ? "All caught up!" : "No notifications"}
          description={filter === "unread" ? "You have no unread notifications" : "Notifications will appear here"}
        />
      ) : (
        <Card>
          <div className="divide-y divide-base-200">
            {filtered.map((notif: Notification) => (
              <div
                key={notif.id}
                className={cn(
                  "flex items-start gap-4 py-4 px-2 hover:bg-base-200/50 rounded transition-colors",
                  !notif.read_at && "bg-primary/5"
                )}
              >
                {/* Unread dot */}
                <div className="mt-1.5 flex-shrink-0">
                  {!notif.read_at ? (
                    <div className="w-2.5 h-2.5 bg-primary rounded-full" />
                  ) : (
                    <div className="w-2.5 h-2.5" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm">{notif.title}</span>
                    {notif.type && (
                      <Badge variant="badge-ghost">{notif.type.replace(/_/g, " ")}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-base-content/70">{notif.body}</p>
                  <p className="text-xs text-base-content/40 mt-1">{formatRelative(notif.created_at)}</p>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0">
                  {!notif.read_at && (
                    <button
                      className="btn btn-ghost btn-xs tooltip"
                      data-tip="Mark as read"
                      onClick={() => markReadMutation.mutate(notif.id)}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
