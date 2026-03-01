"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { PageHeader, Card, LoadingPage, Badge } from "@/components/ui/shared";
import { formatRelative } from "@/lib/utils";
import { Activity, User } from "lucide-react";
import type { ActivityLog } from "@/types/domain";

export default function ActivityPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);

  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", currentOrg?.id],
    queryFn: () => api.activity.list(currentOrg!.id, "limit=50"),
    enabled: !!currentOrg,
  });

  if (isLoading) return <LoadingPage />;

  const logs = activity?.data || [];

  return (
    <div>
      <PageHeader title="Activity" description="Recent activity across the organization" />

      {logs.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="w-16 h-16 text-base-content/20 mx-auto mb-4" />
          <p className="text-base-content/50">No activity yet</p>
        </div>
      ) : (
        <Card>
          <div className="space-y-0 divide-y divide-base-200">
            {logs.map((log: ActivityLog) => (
              <div key={log.id} className="flex items-start gap-3 py-3">
                <div className="w-8 h-8 bg-base-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-base-content/60">{log.actor_id.slice(0, 8)}</span>
                    <Badge variant="badge-ghost">{log.action}</Badge>
                    <span className="text-sm">{log.entity_type}</span>
                    <span className="font-mono text-xs text-base-content/40">{log.entity_id.slice(0, 8)}</span>
                  </div>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="mt-1 text-xs text-base-content/50">
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
