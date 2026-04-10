"use client";

import { Avatar, Badge, Card, LoadingPage } from "@/components/ui/shared";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chart-utils";
import { PRIORITY_HEX, STATUS_BADGE, STATUS_HEX } from "@/lib/task-colors";
import { formatDate, formatRelative, statusLabel } from "@/lib/utils";
import type { ProjectDashboardStats } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Gauge,
  ListTodo,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DonutChart = dynamic(
  () =>
    import("@/components/charts/donut-chart").then((mod) => ({
      default: mod.DonutChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[152px] animate-pulse bg-base-200 rounded-lg" />
    ),
  },
);

const LABEL_COLORS = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
];

export function ProjectDashboard({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) {
  const { data: stats, isLoading } = useQuery<ProjectDashboardStats>({
    queryKey: ["project-dashboard", orgId, projectId],
    queryFn: () => api.projects.dashboard(orgId, projectId),
    enabled: !!orgId && !!projectId,
  });

  if (isLoading) return <LoadingPage />;
  if (!stats)
    return (
      <p className="text-base-content/50 text-center py-8">No data available</p>
    );

  const statusData = Object.entries(stats.tasks_by_status).map(
    ([name, value]) => ({ name, value }),
  );
  const priorityData = Object.entries(stats.tasks_by_priority).map(
    ([name, value]) => ({ name, value }),
  );
  const velocity = stats.completed_last_7_days - stats.created_last_7_days;
  const completionPct = Math.round(stats.completion_rate);
  const timeUsedPct =
    stats.estimated_hours > 0
      ? Math.round((stats.actual_hours / stats.estimated_hours) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* KPI row — unified grid, 2 rows of 5 on lg */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard
          compact
          title="Total Tasks"
          value={stats.total_tasks}
          icon={<ListTodo className="w-5 h-5" />}
          iconBg="bg-primary"
          iconColor="text-primary-content"
        />
        <StatCard
          compact
          title="Completion"
          value={`${completionPct}%`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBg="bg-success"
          iconColor="text-success-content"
        />
        <StatCard
          compact
          title="In Progress"
          value={stats.tasks_by_status?.in_progress || 0}
          icon={<Gauge className="w-5 h-5" />}
          iconBg="bg-info"
          iconColor="text-info-content"
        />
        <StatCard
          compact
          title="Blocked"
          value={stats.tasks_by_status?.blocked || 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          iconBg="bg-warning"
          iconColor="text-warning-content"
        />
        <StatCard
          compact
          title="Overdue"
          value={stats.overdue_tasks}
          icon={<AlertTriangle className="w-5 h-5" />}
          iconBg="bg-error"
          iconColor="text-error-content"
        />
        <StatCard
          compact
          title="Velocity (7d)"
          value={`${velocity >= 0 ? "+" : ""}${velocity}`}
          icon={
            velocity >= 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )
          }
          iconBg={velocity >= 0 ? "bg-accent" : "bg-error"}
          iconColor={
            velocity >= 0 ? "text-accent-content" : "text-error-content"
          }
        />
        <StatCard
          compact
          title="Members"
          value={stats.total_members}
          icon={<Users className="w-5 h-5" />}
          iconBg="bg-secondary"
          iconColor="text-secondary-content"
        />
        <StatCard
          compact
          title="Completed (7d)"
          value={stats.completed_last_7_days}
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBg="bg-success"
          iconColor="text-success-content"
        />
        <StatCard
          compact
          title="Created (7d)"
          value={stats.created_last_7_days}
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-info"
          iconColor="text-info-content"
        />
        <StatCard
          compact
          title="Hours (est / actual)"
          value={
            <>
              {stats.estimated_hours.toFixed(1)}h{" "}
              <span className="text-sm font-normal text-base-content/50">
                / {stats.actual_hours.toFixed(1)}h
              </span>
            </>
          }
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-primary"
          iconColor="text-primary-content"
        />
      </div>

      {/* Charts: Burndown + Created */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Burndown (30 days)" compact>
          {stats.burndown_data && stats.burndown_data.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.burndown_data}>
                <defs>
                  <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop
                      offset="100%"
                      stopColor="#3b82f6"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-base-300/70"
                />
                <XAxis
                  dataKey="date"
                  tick={CHART_AXIS_STYLE}
                  interval={Math.max(
                    1,
                    Math.floor(stats.burndown_data.length / 6),
                  )}
                />
                <YAxis tick={CHART_AXIS_STYLE} width={34} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Remaining"
                  stroke="#3b82f6"
                  fill="url(#burnGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-base-content/50 text-center py-8">
              No burndown data yet
            </p>
          )}
        </Card>

        <Card title="Tasks Created (30 days)" compact>
          {stats.created_over_time && stats.created_over_time.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.created_over_time}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-base-300/70"
                />
                <XAxis
                  dataKey="date"
                  tick={CHART_AXIS_STYLE}
                  interval={Math.max(
                    1,
                    Math.floor(stats.created_over_time.length / 6),
                  )}
                />
                <YAxis
                  tick={CHART_AXIS_STYLE}
                  width={34}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar
                  dataKey="count"
                  name="Created"
                  fill="url(#barGrad)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-base-content/50 text-center py-8">
              No data yet
            </p>
          )}
        </Card>
      </div>

      {/* Distribution row: Status + Priority donuts + Progress ring */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Status" compact>
          <DonutChart data={statusData} colors={STATUS_HEX} title="By Status" />
        </Card>
        <Card title="Priority" compact>
          <DonutChart
            data={priorityData}
            colors={PRIORITY_HEX}
            title="By Priority"
          />
        </Card>
        <Card title="Progress" compact>
          <div className="flex flex-col items-center justify-center py-5 gap-2.5">
            <div
              className="radial-progress text-primary"
              style={
                {
                  "--value": completionPct,
                  "--size": "5.75rem",
                  "--thickness": "7px",
                } as React.CSSProperties
              }
              role="progressbar"
            >
              <span className="text-xl font-extrabold">{completionPct}%</span>
            </div>
            <p className="text-sm text-base-content/70">
              {stats.tasks_by_status?.done || 0} of {stats.total_tasks} done
            </p>
            {stats.estimated_hours > 0 && (
              <>
                <progress
                  className="progress progress-primary w-full mt-1"
                  value={stats.actual_hours}
                  max={stats.estimated_hours}
                />
                <p className="text-xs text-base-content/55">
                  {timeUsedPct}% time used
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Label distribution */}
      {stats.label_counts && stats.label_counts.length > 0 && (
        <Card title="Labels" compact>
          <ResponsiveContainer
            width="100%"
            height={Math.max(170, stats.label_counts.length * 34)}
          >
            <BarChart
              data={stats.label_counts}
              layout="vertical"
              margin={{ left: 14, right: 8 }}
            >
              <CartesianGrid
                strokeDasharray="2 4"
                className="stroke-base-300/65"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={CHART_AXIS_STYLE}
                allowDecimals={false}
              />
              <YAxis
                dataKey="label"
                type="category"
                tick={CHART_AXIS_STYLE}
                width={118}
              />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="count" name="Tasks" radius={[0, 4, 4, 0]}>
                {stats.label_counts.map((_, i) => (
                  <Cell key={i} fill={LABEL_COLORS[i % LABEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Workload + Due soon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Member Workload" compact>
          {stats.member_workload && stats.member_workload.length > 0 ? (
            <div className="space-y-2.5">
              {stats.member_workload.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2.5">
                  <Avatar
                    src={m.avatar_url}
                    name={m.display_name || m.email}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.display_name || m.email}
                    </p>
                    <div className="flex gap-1.5 text-[10px] text-base-content/50">
                      <span>{m.total} total</span>
                      <span className="text-info">{m.in_progress} active</span>
                      <span className="text-success">{m.done} done</span>
                      {m.overdue > 0 && (
                        <span className="text-error">{m.overdue} overdue</span>
                      )}
                    </div>
                  </div>
                  <progress
                    className="progress progress-success w-16"
                    value={m.done}
                    max={m.total || 1}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-base-content/50 py-2">No member data</p>
          )}
        </Card>

        <Card title="Due Soon (7 Days)" compact>
          {stats.due_soon_tasks && stats.due_soon_tasks.length > 0 ? (
            <div className="space-y-1.5">
              {stats.due_soon_tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 text-sm py-1"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        STATUS_HEX[task.status as keyof typeof STATUS_HEX] ||
                        "#94a3b8",
                    }}
                  />
                  <span className="flex-1 truncate">{task.title}</span>
                  <span className="flex items-center gap-1 text-[11px] text-base-content/40 flex-shrink-0">
                    <CalendarClock className="w-3 h-3" />
                    {task.due_date ? formatDate(task.due_date) : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-base-content/50 py-2">
              No upcoming deadlines
            </p>
          )}
        </Card>
      </div>

      {/* Recent tasks */}
      <Card title="Recently Updated" compact>
        {stats.recent_tasks && stats.recent_tasks.length > 0 ? (
          <div className="space-y-1">
            {stats.recent_tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 text-sm py-1.5 px-1 rounded hover:bg-base-200/35 transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      STATUS_HEX[task.status as keyof typeof STATUS_HEX] ||
                      "#94a3b8",
                  }}
                />
                <span className="flex-1 truncate">{task.title}</span>
                <Badge
                  variant={
                    STATUS_BADGE[task.status as keyof typeof STATUS_BADGE]
                  }
                  className="text-[10px]"
                >
                  {statusLabel(task.status)}
                </Badge>
                <span className="text-[11px] text-base-content/40 flex-shrink-0">
                  {formatRelative(task.updated_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-base-content/50 py-2">No tasks yet</p>
        )}
      </Card>
    </div>
  );
}
