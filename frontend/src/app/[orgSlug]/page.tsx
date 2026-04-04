"use client";

import { AreaChartSkeleton } from "@/components/charts/chart-skeleton";
import { Badge, Card, PageHeader } from "@/components/ui/shared";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { useOrgPolicies } from "@/hooks/use-policies";
import { api } from "@/lib/api";
import { cn, formatRelative, priorityColor, statusLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type {
    DashboardAnalytics,
    DashboardStats,
    MetricAlert,
    Project,
} from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle,
    ArrowRight,
    Bell,
    CheckCircle2,
    Clock,
    FolderKanban,
    ListTodo,
    ShieldAlert,
    TrendingUp,
    Users2,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

const DonutChart = dynamic(
  () =>
    import("@/components/charts/donut-chart").then((mod) => ({
      default: mod.DonutChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-32 animate-pulse bg-base-200 rounded-lg" />
    ),
  },
);

const AreaChartWidget = dynamic(
  () =>
    import("@/components/charts/area-chart").then((mod) => ({
      default: mod.AreaChartWidget,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] animate-pulse bg-base-200 rounded-lg" />
    ),
  },
);

const HealthRing = dynamic(
  () =>
    import("@/components/charts/health-ring").then((mod) => ({
      default: mod.HealthRing,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[120px] w-[120px] animate-pulse bg-base-200 rounded-full mx-auto" />
    ),
  },
);

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

function MiniStat({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-base-100 rounded-xl border border-base-200 shadow-sm glass-card">
      <div
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-lg",
          color,
        )}
      >
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

export default function DashboardPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const currentMembership = useAuthStore((s) => s.currentMembership);
  const orgSlug = currentOrg?.slug || "";
  const policies = useOrgPolicies();
  const [days, setDays] = useState<7 | 30 | 90>(30);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", currentOrg?.id],
    queryFn: () => api.dashboard.stats(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects", currentOrg?.id, policies.canViewAllProjects],
    queryFn: () =>
      api.projects.list(currentOrg!.id, policies.projectListParams()),
    enabled: !!currentOrg && !policies.isLoading,
  });

  const { data: analytics, isLoading: analyticsLoading } =
    useQuery<DashboardAnalytics>({
      queryKey: ["analytics-dashboard", currentOrg?.id, days],
      queryFn: () => api.analytics.dashboard(currentOrg!.id, days),
      enabled: !!currentOrg,
    });

  if (isLoading || !stats)
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-base-300 rounded w-48 mb-2" />
        <div className="h-4 bg-base-300 rounded w-64 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 bg-base-200 rounded-xl border border-base-200"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-48 bg-base-200 rounded-xl border border-base-200"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 h-64 bg-base-200 rounded-xl border border-base-200" />
          <div className="lg:col-span-3 h-64 bg-base-200 rounded-xl border border-base-200" />
        </div>
      </div>
    );

  const statusData = Object.entries(stats.tasks_by_status || {}).map(
    ([k, v]) => ({ name: k, value: v }),
  );
  const priorityData = Object.entries(stats.tasks_by_priority || {}).map(
    ([k, v]) => ({ name: k, value: v }),
  );
  const projectList = projects?.data || [];
  const completedTasks = stats.tasks_by_status?.done || 0;
  const inProgress = stats.tasks_by_status?.in_progress || 0;
  const completionPct =
    stats.total_tasks > 0
      ? Math.round((completedTasks / stats.total_tasks) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overview of ${currentOrg?.name}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center rounded-full border border-base-200/55 bg-base-100/36 p-1 shadow-[inset_0_1px_0_oklch(100%_0_0_/_0.16)] backdrop-blur-xl">
              {([7, 30, 90] as const).map((d) => {
                const active = days === d;
                return (
                  <button
                    key={d}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-wide transition-all",
                      active
                        ? "bg-gradient-to-br from-oklch(45% 0.12 282 / 0.4) to-oklch(48% 0.14 270 / 0.35) text-base-content shadow-[inset_0_0_0_1px_oklch(100%_0_0_/_0.15)] border border-oklch(100%_0_0_/_0.12)"
                        : "text-base-content/72 hover:bg-oklch(100%_0_0_/_0.18) hover:text-base-content",
                    )}
                    onClick={() => setDays(d)}
                  >
                    {d}d
                  </button>
                );
              })}
            </div>

            {currentMembership && (
              <span className="inline-flex items-center rounded-full border border-base-200/55 bg-base-100/36 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-base-content/80 capitalize backdrop-blur-xl shadow-[inset_0_1px_0_oklch(100%_0_0_/_0.16)]">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                {currentMembership.role}
              </span>
            )}
          </div>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <MiniStat
          label="Projects"
          value={stats.total_projects}
          icon={<FolderKanban className="w-5 h-5 text-primary-content" />}
          color="bg-primary"
        />
        <MiniStat
          label="Total Tasks"
          value={stats.total_tasks}
          icon={<ListTodo className="w-5 h-5 text-secondary-content" />}
          color="bg-secondary"
        />
        <MiniStat
          label="In Progress"
          value={inProgress}
          icon={<TrendingUp className="w-5 h-5 text-info-content" />}
          color="bg-info"
        />
        <MiniStat
          label="Completed"
          value={completedTasks}
          icon={<CheckCircle2 className="w-5 h-5 text-success-content" />}
          color="bg-success"
          sub={`${completionPct}% done`}
        />
        <MiniStat
          label="Teams"
          value={stats.total_teams}
          icon={<Users2 className="w-5 h-5 text-accent-content" />}
          color="bg-accent"
        />
        <MiniStat
          label="Overdue"
          value={stats.overdue_tasks}
          icon={<AlertTriangle className="w-5 h-5 text-error-content" />}
          color="bg-error"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Task Status" compact>
          <DonutChart
            data={statusData}
            colors={STATUS_COLORS}
            title="By Status"
          />
        </Card>
        <Card title="Task Priority" compact>
          <DonutChart
            data={priorityData}
            colors={PRIORITY_COLORS}
            title="By Priority"
          />
        </Card>
        {/* Completion overview */}
        <Card title="Completion" compact>
          <div className="flex flex-col items-center justify-center h-full py-4 gap-4">
            <div
              className="radial-progress text-lg font-bold"
              style={
                {
                  "--value": completionPct,
                  "--size": "5rem",
                  "--thickness": "8px",
                  "--color": "oklch(64% 0.18 180)",
                } as React.CSSProperties
              }
              role="progressbar"
            >
              <span>{completionPct}%</span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium leading-tight">
                {completedTasks} of {stats.total_tasks} tasks done
              </p>
              <p className="text-xs text-base-content/50">
                {stats.total_members} members • {stats.total_teams} teams
              </p>
            </div>
            <div className="w-full px-2">
              <progress
                className="progress w-full h-1.5"
                style={{
                  "--progress-value": "oklch(64% 0.18 180)",
                } as React.CSSProperties}
                value={completedTasks}
                max={stats.total_tasks || 1}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Analytics row — Health + Velocity + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Health Score */}
        <Card title="Organization Health" compact>
          {analyticsLoading || !analytics ? (
            <div className="animate-pulse flex flex-col items-center py-4 gap-4">
              <div className="w-[120px] h-[120px] rounded-full bg-base-300" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full px-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <div className="h-3 rounded bg-base-300 w-16" />
                    <div className="h-3 rounded bg-base-300 w-8" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 relative">
              <HealthRing score={analytics.health.overall} size={120} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-base-content/60">Velocity</span>
                  <span className="font-semibold">
                    {Math.round(analytics.health.velocity_trend)}%
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-base-content/60">Completion</span>
                  <span className="font-semibold">
                    {Math.round(analytics.health.completion_rate)}%
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-base-content/60">Blocked</span>
                  <span className="font-semibold">
                    {Math.round(analytics.health.blocked_ratio)}%
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-base-content/60">Overdue</span>
                  <span className="font-semibold">
                    {Math.round(analytics.health.overdue_ratio)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Velocity Trend */}
        <Card title="Velocity Trend" compact>
          {analyticsLoading || !analytics ? (
            <AreaChartSkeleton height={180} />
          ) : (
            <AreaChartWidget
              data={analytics.velocity}
              dataKey="completed"
              secondaryKey="created"
              color="#22c55e"
              secondaryColor="#3b82f6"
              height={180}
            />
          )}
        </Card>

        {/* Alerts & Warnings */}
        <Card title="Active Warnings" compact>
          {analyticsLoading || !analytics ? (
            <div className="animate-pulse space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-lg bg-base-200"
                >
                  <div className="w-4 h-4 rounded bg-base-300 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 rounded bg-base-300 w-3/4" />
                    <div className="h-2.5 rounded bg-base-300 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : analytics.warnings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="w-8 h-8 text-success mb-2" />
              <p className="text-sm text-base-content/60">No active alerts</p>
            </div>
          ) : (
            <VirtualScrollList<MetricAlert>
              items={analytics.warnings}
              itemHeight={56}
              containerHeight={200}
              renderItem={(alert) => (
                <div
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg text-xs mb-1",
                    alert.severity === "critical"
                      ? "bg-error/10 text-error"
                      : alert.severity === "warning"
                        ? "bg-warning/10 text-warning"
                        : "bg-info/10 text-info",
                  )}
                >
                  {alert.severity === "critical" ? (
                    <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Bell className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{alert.title}</p>
                    <p className="text-[10px] opacity-70 truncate">
                      {alert.description}
                    </p>
                  </div>
                </div>
              )}
            />
          )}
        </Card>
      </div>

      {/* Projects + Recent tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Projects */}
        <div className="lg:col-span-2 overflow-hidden">
          <Card title="Projects" compact>
            {projectList.length === 0 ? (
              <div className="text-center py-8">
                <FolderKanban className="w-10 h-10 text-base-content/15 mx-auto mb-2" />
                <p className="text-base-content/50 text-sm">No projects yet</p>
                <Link
                  href={`/${orgSlug}/projects`}
                  className="btn btn-primary btn-sm mt-3"
                >
                  Create project
                </Link>
              </div>
            ) : (
              <VirtualScrollList<Project>
                items={projectList}
                itemHeight={52}
                containerHeight={260}
                renderItem={(p) => (
                  <Link
                    href={`/${orgSlug}/projects/${p.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-base-200/60 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[11px] text-base-content/40 capitalize">
                        {p.status}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-base-content/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                )}
                emptyState={
                  <div className="text-center py-8">
                    <FolderKanban className="w-10 h-10 text-base-content/15 mx-auto mb-2" />
                    <p className="text-base-content/50 text-sm">
                      No projects yet
                    </p>
                  </div>
                }
              />
            )}
          </Card>
        </div>

        {/* Recent Tasks */}
        <div className="lg:col-span-3 overflow-hidden">
          <Card title="Recent Tasks" compact>
            {!stats.recent_tasks || stats.recent_tasks.length === 0 ? (
              <div className="text-center py-8">
                <ListTodo className="w-10 h-10 text-base-content/15 mx-auto mb-2" />
                <p className="text-base-content/50 text-sm">No recent tasks</p>
              </div>
            ) : (
              <VirtualScrollList<(typeof stats.recent_tasks)[0]>
                items={stats.recent_tasks}
                itemHeight={44}
                containerHeight={260}
                renderItem={(task) => (
                  <Link
                    href={`/${orgSlug}/projects/${task.project_id}/tasks/${task.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/60 transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          STATUS_COLORS[task.status] || "#94a3b8",
                      }}
                    />
                    <span className="flex-1 text-sm truncate">
                      {task.title}
                    </span>
                    <Badge
                      variant={priorityColor(task.priority)}
                      className="text-[10px]"
                    >
                      {statusLabel(task.priority)}
                    </Badge>
                    <span className="text-[11px] text-base-content/40 flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatRelative(task.created_at)}
                    </span>
                  </Link>
                )}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
