"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, PageHeader, LoadingPage, Badge } from "@/components/ui/shared";
import { statusColor, priorityColor, statusLabel, formatRelative } from "@/lib/utils";
import {
  FolderKanban,
  ListTodo,
  Users,
  AlertTriangle,
  Clock,
  Users2,
} from "lucide-react";
import Link from "next/link";
import type { DashboardStats } from "@/types/domain";

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200">
      <div className={`stat-figure ${color}`}>{icon}</div>
      <div className="stat-title">{label}</div>
      <div className="stat-value text-2xl">{value}</div>
    </div>
  );
}

export default function DashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const currentOrg = useAuthStore((s) => s.currentOrg);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", currentOrg?.id],
    queryFn: () => api.dashboard.stats(currentOrg!.id),
    enabled: !!currentOrg,
  });

  if (isLoading || !stats) return <LoadingPage />;

  const statusEntries = Object.entries(stats.tasks_by_status || {});
  const priorityEntries = Object.entries(stats.tasks_by_priority || {});

  return (
    <div>
      <PageHeader title="Dashboard" description={`Overview of ${currentOrg?.name}`} />

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Projects" value={stats.total_projects} icon={<FolderKanban className="w-8 h-8" />} color="text-primary" />
        <StatCard label="Tasks" value={stats.total_tasks} icon={<ListTodo className="w-8 h-8" />} color="text-secondary" />
        <StatCard label="Teams" value={stats.total_teams} icon={<Users2 className="w-8 h-8" />} color="text-accent" />
        <StatCard label="Overdue" value={stats.overdue_tasks} icon={<AlertTriangle className="w-8 h-8" />} color="text-error" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Tasks by Status */}
        <Card title="Tasks by Status">
          {statusEntries.length === 0 ? (
            <p className="text-base-content/50 text-sm">No tasks yet</p>
          ) : (
            <div className="space-y-3">
              {statusEntries.map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColor(status)}>{statusLabel(status)}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{count as number}</span>
                    <progress
                      className="progress progress-primary w-24"
                      value={count as number}
                      max={stats.total_tasks || 1}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Tasks by Priority */}
        <Card title="Tasks by Priority">
          {priorityEntries.length === 0 ? (
            <p className="text-base-content/50 text-sm">No tasks yet</p>
          ) : (
            <div className="space-y-3">
              {priorityEntries.map(([priority, count]) => (
                <div key={priority} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={priorityColor(priority)}>{statusLabel(priority)}</Badge>
                  </div>
                  <span className="font-semibold">{count as number}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card title="Recent Tasks">
        {(!stats.recent_tasks || stats.recent_tasks.length === 0) ? (
          <p className="text-base-content/50 text-sm">No recent tasks</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_tasks.map((task) => (
                  <tr key={task.id} className="hover">
                    <td className="font-medium">{task.title}</td>
                    <td><Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge></td>
                    <td><Badge variant={priorityColor(task.priority)}>{statusLabel(task.priority)}</Badge></td>
                    <td className="text-sm text-base-content/60">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelative(task.created_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
