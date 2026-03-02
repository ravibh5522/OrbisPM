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
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import type { DashboardStats, Project } from "@/types/domain";

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200">
      <div className={`stat-figure ${color}`}>{icon}</div>
      <div className="stat-title">{label}</div>
      <div className="stat-value text-2xl">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const currentMembership = useAuthStore((s) => s.currentMembership);
  const orgSlug = currentOrg?.slug || "";

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", currentOrg?.id],
    queryFn: () => api.dashboard.stats(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects", currentOrg?.id],
    queryFn: () => api.projects.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  if (isLoading || !stats) return <LoadingPage />;

  const statusEntries = Object.entries(stats.tasks_by_status || {});
  const priorityEntries = Object.entries(stats.tasks_by_priority || {});
  const projectList = projects?.data || [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overview of ${currentOrg?.name}`}
      />

      {/* Role badge */}
      {currentMembership && (
        <div className="mb-4">
          <span className="badge badge-lg badge-outline">
            Your role: <span className="font-semibold ml-1 capitalize">{currentMembership.role}</span>
          </span>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Projects" value={stats.total_projects} icon={<FolderKanban className="w-8 h-8" />} color="text-primary" />
        <StatCard label="Tasks" value={stats.total_tasks} icon={<ListTodo className="w-8 h-8" />} color="text-secondary" />
        <StatCard label="Members" value={stats.total_members} icon={<Users className="w-8 h-8" />} color="text-info" />
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

      {/* Projects quick nav */}
      {projectList.length > 0 && (
        <Card title="Projects" className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projectList.slice(0, 6).map((p: Project) => (
              <Link
                key={p.id}
                href={`/${orgSlug}/projects/${p.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-base-200 hover:bg-base-200 transition-colors"
              >
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-base-content/50 capitalize">{p.status}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-base-content/40" />
              </Link>
            ))}
          </div>
          {projectList.length > 6 && (
            <div className="mt-3 text-center">
              <Link href={`/${orgSlug}/projects`} className="link link-primary text-sm">View all {projectList.length} projects</Link>
            </div>
          )}
        </Card>
      )}

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
                  <tr key={task.id} className="hover cursor-pointer" onClick={() => window.location.href = `/${orgSlug}/projects/${task.project_id}/tasks/${task.id}`}>
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
