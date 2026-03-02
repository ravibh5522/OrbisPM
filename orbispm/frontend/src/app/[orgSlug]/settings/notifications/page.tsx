"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { PageHeader, Card, LoadingPage } from "@/components/ui/shared";
import { Bell } from "lucide-react";
import type { NotificationPreference } from "@/types/domain";

export default function NotificationsPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-prefs", currentOrg?.id],
    queryFn: () => api.notificationPreferences.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ pref }: { pref: NotificationPreference }) =>
      api.notificationPreferences.upsert(currentOrg!.id, {
        event_type: pref.event_type,
        channel: pref.channel,
        enabled: !pref.enabled,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });

  if (isLoading) return <LoadingPage />;

  const prefList = prefs?.data || [];

  return (
    <div>
      <PageHeader title="Notifications" description="Configure your notification preferences" />

      {prefList.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <Bell className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
            <p className="text-base-content/50">No notification preferences configured</p>
            <p className="text-sm text-base-content/40 mt-1">Preferences will appear here once events are generated</p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Channel</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {prefList.map((pref: NotificationPreference) => (
                  <tr key={pref.id}>
                    <td className="font-medium">{pref.event_type}</td>
                    <td><span className="badge badge-ghost badge-sm">{pref.channel}</span></td>
                    <td>
                      <input
                        type="checkbox"
                        className="toggle toggle-primary toggle-sm"
                        checked={pref.enabled}
                        onChange={() =>
                          toggleMutation.mutate({ pref })
                        }
                        disabled={toggleMutation.isPending}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
