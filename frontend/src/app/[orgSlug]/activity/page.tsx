"use client";

import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/shared";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { ActivityLog, OrgMember } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

const ACTION_COLOR: Record<string, string> = {
  created: "badge-success",
  updated: "badge-info",
  deleted: "badge-error",
  assigned: "badge-warning",
  completed: "badge-success",
  commented: "badge-ghost",
};

export default function ActivityPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);

  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", currentOrg?.id],
    queryFn: () => api.activity.list(currentOrg!.id, "limit=50"),
    enabled: !!currentOrg,
  });

  const { data: membersData } = useQuery({
    queryKey: ["org-members", currentOrg?.id],
    queryFn: () => api.members.list(currentOrg!.id),
    enabled: !!currentOrg,
    staleTime: 5 * 60_000,
  });

  if (isLoading) return (
    <div className="animate-pulse">
      <div className="h-8 bg-base-300 rounded w-32 mb-2" />
      <div className="h-4 bg-base-300 rounded w-72 mb-6" />
      <div className="bg-base-200 rounded-xl border border-base-200 p-4 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-base-300 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-base-300 rounded w-3/4" />
              <div className="h-3 bg-base-300 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const logs = activity?.data || [];
  const members: OrgMember[] = membersData?.data || [];

  function memberName(id: string): string {
    const m = members.find((x) => x.user_id === id);
    return m ? (m.display_name || m.email || id.slice(0, 8) + "…") : id.slice(0, 8) + "…";
  }

  function memberAvatar(id: string): { name: string; src?: string } {
    const m = members.find((x) => x.user_id === id);
    return {
      name: m ? (m.display_name || m.email || "?") : "?",
      src: m?.avatar_url || undefined,
    };
  }

  return (
    <div>
      <PageHeader title="Activity" description="Recent activity across the organization" />

      {logs.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-16 h-16" />}
          title="No activity yet"
          description="Activity will appear here as your team works on tasks and projects"
        />
      ) : (
        <Card>
          <div className="space-y-0 divide-y divide-base-200">
            {logs.map((log: ActivityLog) => (
              <div key={log.id} className="flex items-start gap-3 py-4">
                <Avatar name={memberAvatar(log.actor_id).name} src={memberAvatar(log.actor_id).src} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{memberName(log.actor_id)}</span>
                    <Badge variant={ACTION_COLOR[log.action] || "badge-ghost"}>{log.action}</Badge>
                    <span className="text-sm text-base-content/60 capitalize">{log.entity_type}</span>
                    <span className="font-mono text-xs text-base-content/30">{log.entity_id.slice(0, 8)}…</span>
                  </div>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="mt-1 text-xs text-base-content/50 bg-base-200 rounded px-2 py-1 inline-block">
                      Changed: {Object.keys(log.changes).join(", ")}
                    </div>
                  )}
                  <div className="text-xs text-base-content/40 mt-1">{formatRelative(log.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

