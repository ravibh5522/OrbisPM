"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Badge, Avatar, LoadingPage } from "@/components/ui/shared";
import { formatRelative, statusColor, statusLabel, formatDate } from "@/lib/utils";
import type { ProjectDashboardStats } from "@/types/domain";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  CalendarClock,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  todo: "#6b7280",
  in_progress: "#3b82f6",
  done: "#22c55e",
  blocked: "#f59e0b",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#6b7280",
};

const PIE_COLORS = ["#6b7280", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

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
  if (!stats) return <p className="text-base-content/50 text-center py-8">No data available</p>;

  const statusData = Object.entries(stats.tasks_by_status).map(([name, value]) => ({
    name: statusLabel(name),
    value,
    fill: STATUS_COLORS[name] || "#6b7280",
  }));

  const priorityData = Object.entries(stats.tasks_by_priority).map(([name, value]) => ({
    name: statusLabel(name),
    value,
    fill: PRIORITY_COLORS[name] || "#6b7280",
  }));

  const velocity = stats.completed_last_7_days - stats.created_last_7_days;

  return (
    <div className="space-y-6">
      {/* KPI metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Total Tasks" value={stats.total_tasks} />
        <StatCard
          label="Completion"
          value={`${Math.round(stats.completion_rate)}%`}
          color="text-success"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <StatCard
          label="In Progress"
          value={stats.tasks_by_status?.in_progress || 0}
          color="text-info"
        />
        <StatCard
          label="Blocked"
          value={stats.tasks_by_status?.blocked || 0}
          color="text-warning"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue_tasks}
          color="text-error"
        />
        <StatCard
          label="Velocity (7d)"
          value={`${velocity >= 0 ? "+" : ""}${velocity}`}
          color={velocity >= 0 ? "text-success" : "text-error"}
          icon={velocity >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        />
        <StatCard
          label="Members"
          value={stats.total_members}
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      {/* Velocity summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-base-100 rounded-lg border border-base-200 p-4 flex items-center gap-3">
          <div className="bg-success/10 text-success p-2 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-base-content/60">Completed (7d)</p>
            <p className="text-lg font-semibold">{stats.completed_last_7_days}</p>
          </div>
        </div>
        <div className="bg-base-100 rounded-lg border border-base-200 p-4 flex items-center gap-3">
          <div className="bg-info/10 text-info p-2 rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-base-content/60">Created (7d)</p>
            <p className="text-lg font-semibold">{stats.created_last_7_days}</p>
          </div>
        </div>
        <div className="bg-base-100 rounded-lg border border-base-200 p-4 flex items-center gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-base-content/60">Hours (est / actual)</p>
            <p className="text-lg font-semibold">
              {stats.estimated_hours.toFixed(1)}h / {stats.actual_hours.toFixed(1)}h
            </p>
          </div>
        </div>
      </div>

      {/* Charts row: Burndown + Created over time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Burndown chart */}
        <Card title="Burndown (30 days)">
          {stats.burndown_data && stats.burndown_data.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={stats.burndown_data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-base-300" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval={Math.floor(stats.burndown_data.length / 6)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(var(--b1))",
                    border: "1px solid oklch(var(--b3))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Remaining"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-base-content/50 text-center py-8">No burndown data yet</p>
          )}
        </Card>

        {/* Tasks created over time */}
        <Card title="Tasks Created (30 days)">
          {stats.created_over_time && stats.created_over_time.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.created_over_time}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-base-300" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval={Math.floor(stats.created_over_time.length / 6)}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(var(--b1))",
                    border: "1px solid oklch(var(--b3))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name="Created" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-base-content/50 text-center py-8">No data yet</p>
          )}
        </Card>
      </div>

      {/* Distribution row: Status + Priority pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Status Distribution">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={(props: PieLabelRenderProps) =>
                    `${props.name || ""} ${(((props.percent ?? 0) as number) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-base-content/50 text-center py-8">No tasks yet</p>
          )}
        </Card>

        <Card title="Priority Distribution">
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={(props: PieLabelRenderProps) =>
                    `${props.name || ""} ${(((props.percent ?? 0) as number) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {priorityData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-base-content/50 text-center py-8">No tasks yet</p>
          )}
        </Card>
      </div>

      {/* Time tracking progress */}
      {stats.estimated_hours > 0 && (
        <Card title="Time Tracking">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/60">Estimated Hours</span>
              <span className="font-mono text-lg">{stats.estimated_hours.toFixed(1)}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/60">Actual Hours</span>
              <span className="font-mono text-lg">{stats.actual_hours.toFixed(1)}h</span>
            </div>
            <progress
              className="progress progress-primary w-full"
              value={stats.actual_hours}
              max={stats.estimated_hours}
            />
            <p className="text-xs text-base-content/50 text-center">
              {Math.round((stats.actual_hours / stats.estimated_hours) * 100)}% of estimated time used
            </p>
          </div>
        </Card>
      )}

      {/* Label distribution */}
      {stats.label_counts && stats.label_counts.length > 0 && (
        <Card title="Label Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.label_counts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-base-300" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(var(--b1))",
                  border: "1px solid oklch(var(--b3))",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" name="Tasks" radius={[0, 4, 4, 0]}>
                {stats.label_counts.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Member workload + Due soon + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Member workload */}
        <Card title="Member Workload">
          {stats.member_workload && stats.member_workload.length > 0 ? (
            <div className="space-y-3">
              {stats.member_workload.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3">
                  <Avatar
                    src={m.avatar_url}
                    name={m.display_name || m.email}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.display_name || m.email}
                    </p>
                    <div className="flex gap-2 text-xs text-base-content/60">
                      <span>{m.total} tasks</span>
                      <span className="text-info">{m.in_progress} active</span>
                      <span className="text-success">{m.done} done</span>
                      {m.overdue > 0 && (
                        <span className="text-error">{m.overdue} overdue</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <progress
                      className="progress progress-success w-20"
                      value={m.done}
                      max={m.total || 1}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-base-content/50">No member data</p>
          )}
        </Card>

        {/* Due soon */}
        <Card title="Due Soon (Next 7 Days)">
          {stats.due_soon_tasks && stats.due_soon_tasks.length > 0 ? (
            <div className="space-y-2">
              {stats.due_soon_tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 text-sm py-1">
                  <Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
                  <span className="flex-1 truncate">{task.title}</span>
                  <span className="flex items-center gap-1 text-xs text-base-content/50">
                    <CalendarClock className="w-3 h-3" />
                    {task.due_date ? formatDate(task.due_date) : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-base-content/50">No upcoming deadlines</p>
          )}
        </Card>
      </div>

      {/* Recently updated tasks */}
      <Card title="Recently Updated">
        {stats.recent_tasks && stats.recent_tasks.length > 0 ? (
          <div className="space-y-2">
            {stats.recent_tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-sm py-1">
                <Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
                <span className="flex-1 truncate">{task.title}</span>
                <span className="text-xs text-base-content/40">
                  {formatRelative(task.updated_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-base-content/50">No tasks yet</p>
        )}
      </Card>
    </div>
  );
}

/* ─── Helper ─── */

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
      <div className="stat-title text-xs flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`stat-value text-lg ${color || ""}`}>{value}</div>
    </div>
  );
}
