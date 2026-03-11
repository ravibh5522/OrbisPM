"use client";

import { Badge, Card, PageHeader } from "@/components/ui/shared";
import { api } from "@/lib/api";
import { cn, formatRelative, priorityColor, statusLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { DashboardStats, Project } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Clock,
    FolderKanban,
    ListTodo,
    TrendingUp,
    Users2
} from "lucide-react";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  in_review: "#a855f7",
  done: "#22c55e",
  blocked: "#ef4444",
  cancelled: "#6b7280",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  none: "#94a3b8",
};

function MiniStat({ label, value, icon, color, sub }: { label: string; value: number; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-base-100 rounded-xl border border-base-200 shadow-sm glass-card">
      <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg", color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-base-content/50 truncate">{label}</div>
        {sub && <div className="text-[10px] text-base-content/40">{sub}</div>}
      </div>
    </div>
  );
}

function DonutChart({ data, colors, title }: { data: { name: string; value: number }[]; colors: Record<string, string>; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-base-content/50 text-sm py-8 text-center">No data</p>;

  return (
    <div className="flex items-center gap-4">
      <div className="w-32 h-32 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={52} paddingAngle={2} strokeWidth={0}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={colors[entry.name] || "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [value, "Tasks"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[entry.name] || "#94a3b8" }} />
              <span className="truncate capitalize">{statusLabel(entry.name)}</span>
            </div>
            <span className="font-semibold tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
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

  if (isLoading || !stats) return (
    <div className="animate-pulse">
      <div className="h-8 bg-base-300 rounded w-48 mb-2" />
      <div className="h-4 bg-base-300 rounded w-64 mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-base-200 rounded-xl border border-base-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 bg-base-200 rounded-xl border border-base-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 h-64 bg-base-200 rounded-xl border border-base-200" />
        <div className="lg:col-span-3 h-64 bg-base-200 rounded-xl border border-base-200" />
      </div>
    </div>
  );

  const statusData = Object.entries(stats.tasks_by_status || {}).map(([k, v]) => ({ name: k, value: v }));
  const priorityData = Object.entries(stats.tasks_by_priority || {}).map(([k, v]) => ({ name: k, value: v }));
  const projectList = projects?.data || [];
  const completedTasks = (stats.tasks_by_status?.done || 0);
  const inProgress = (stats.tasks_by_status?.in_progress || 0);
  const completionPct = stats.total_tasks > 0 ? Math.round((completedTasks / stats.total_tasks) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overview of ${currentOrg?.name}`}
        actions={
          currentMembership ? (
            <span className="badge badge-outline badge-sm capitalize">{currentMembership.role}</span>
          ) : undefined
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <MiniStat label="Projects" value={stats.total_projects} icon={<FolderKanban className="w-5 h-5 text-primary-content" />} color="bg-primary" />
        <MiniStat label="Total Tasks" value={stats.total_tasks} icon={<ListTodo className="w-5 h-5 text-secondary-content" />} color="bg-secondary" />
        <MiniStat label="In Progress" value={inProgress} icon={<TrendingUp className="w-5 h-5 text-info-content" />} color="bg-info" />
        <MiniStat label="Completed" value={completedTasks} icon={<CheckCircle2 className="w-5 h-5 text-success-content" />} color="bg-success" sub={`${completionPct}% done`} />
        <MiniStat label="Teams" value={stats.total_teams} icon={<Users2 className="w-5 h-5 text-accent-content" />} color="bg-accent" />
        <MiniStat label="Overdue" value={stats.overdue_tasks} icon={<AlertTriangle className="w-5 h-5 text-error-content" />} color="bg-error" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Task Status" compact>
          <DonutChart data={statusData} colors={STATUS_COLORS} title="By Status" />
        </Card>
        <Card title="Task Priority" compact>
          <DonutChart data={priorityData} colors={PRIORITY_COLORS} title="By Priority" />
        </Card>
        {/* Completion overview */}
        <Card title="Completion" compact>
          <div className="flex flex-col items-center justify-center h-full py-4 gap-3">
            <div className="radial-progress text-primary" style={{ "--value": completionPct, "--size": "5rem", "--thickness": "6px" } as React.CSSProperties} role="progressbar">
              <span className="text-lg font-bold">{completionPct}%</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{completedTasks} of {stats.total_tasks} tasks done</p>
              <p className="text-xs text-base-content/50">{stats.total_members} members • {stats.total_teams} teams</p>
            </div>
            <div className="w-full mt-2">
              <progress className="progress progress-primary w-full" value={completedTasks} max={stats.total_tasks || 1} />
            </div>
          </div>
        </Card>
      </div>

      {/* Projects + Recent tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Projects */}
        <div className="lg:col-span-2">
          <Card title="Projects" compact>
            {projectList.length === 0 ? (
              <p className="text-base-content/50 text-sm py-4">No projects yet</p>
            ) : (
              <div className="space-y-2">
                {projectList.slice(0, 5).map((p: Project) => (
                  <Link
                    key={p.id}
                    href={`/${orgSlug}/projects/${p.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-base-200/60 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[11px] text-base-content/40 capitalize">{p.status}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-base-content/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
                {projectList.length > 5 && (
                  <Link href={`/${orgSlug}/projects`} className="block text-center py-2 text-xs link link-primary">
                    View all {projectList.length} projects
                  </Link>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Recent Tasks */}
        <div className="lg:col-span-3">
          <Card title="Recent Tasks" compact>
            {(!stats.recent_tasks || stats.recent_tasks.length === 0) ? (
              <p className="text-base-content/50 text-sm py-4">No recent tasks</p>
            ) : (
              <div className="space-y-1.5">
                {stats.recent_tasks.slice(0, 8).map((task) => (
                  <Link
                    key={task.id}
                    href={`/${orgSlug}/projects/${task.project_id}/tasks/${task.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/60 transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[task.status] || "#94a3b8" }}
                    />
                    <span className="flex-1 text-sm truncate">{task.title}</span>
                    <Badge variant={priorityColor(task.priority)} className="text-[10px]">{statusLabel(task.priority)}</Badge>
                    <span className="text-[11px] text-base-content/40 flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatRelative(task.created_at)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
