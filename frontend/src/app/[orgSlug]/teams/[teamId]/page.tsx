"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, PageHeader, LoadingPage, Badge, Avatar } from "@/components/ui/shared";
import { statusColor, priorityColor, statusLabel, formatRelative } from "@/lib/utils";
import {
  FolderKanban,
  ListTodo,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { use } from "react";
import type { Team, TeamDashboardStats } from "@/types/domain";

/* ── Stat Card ── */
function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200">
      <div className={`stat-figure ${color}`}>{icon}</div>
      <div className="stat-title">{label}</div>
      <div className="stat-value text-2xl">{value}</div>
    </div>
  );
}

/* ── Workload Bar ── */
function WorkloadBar({
  todo,
  inProgress,
  done,
  blocked,
  total,
}: {
  todo: number;
  inProgress: number;
  done: number;
  blocked: number;
  total: number;
}) {
  if (total === 0) return <span className="text-xs text-base-content/40">No tasks</span>;
  const pct = (v: number) => `${(v / total) * 100}%`;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-base-200 w-full" title={`Todo: ${todo}, In Progress: ${inProgress}, Done: ${done}, Blocked: ${blocked}`}>
      {done > 0 && <div className="bg-success" style={{ width: pct(done) }} />}
      {inProgress > 0 && <div className="bg-info" style={{ width: pct(inProgress) }} />}
      {todo > 0 && <div className="bg-warning" style={{ width: pct(todo) }} />}
      {blocked > 0 && <div className="bg-error" style={{ width: pct(blocked) }} />}
    </div>
  );
}

/* ── Page ── */
export default function TeamDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamId: string }>;
}) {
  const { orgSlug, teamId } = use(params);
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id || "";

  const { data: team, isLoading: teamLoading } = useQuery<Team>({
    queryKey: ["team", orgId, teamId],
    queryFn: () => api.teams.get(orgId, teamId),
    enabled: !!orgId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<TeamDashboardStats>({
    queryKey: ["team-dashboard", orgId, teamId],
    queryFn: () => api.teams.dashboard(orgId, teamId),
    enabled: !!orgId,
  });

  if (teamLoading || statsLoading || !stats) return <LoadingPage />;

  const statusEntries = Object.entries(stats.tasks_by_status || {});
  const priorityEntries = Object.entries(stats.tasks_by_priority || {});
  const members = stats.member_workload || [];

  return (
    <div>
      {/* Back link + Header */}
      <div className="mb-2">
        <Link href={`/${orgSlug}/teams`} className="btn btn-ghost btn-sm gap-1">
          <ArrowLeft className="w-4 h-4" /> Teams
        </Link>
      </div>
      <PageHeader
        title={team?.name || "Team Dashboard"}
        description={team?.description || "Team workload, velocity, and task breakdown"}
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Projects"
          value={stats.total_projects}
          icon={<FolderKanban className="w-8 h-8" />}
          color="text-primary"
        />
        <StatCard
          label="Tasks"
          value={stats.total_tasks}
          icon={<ListTodo className="w-8 h-8" />}
          color="text-secondary"
        />
        <StatCard
          label="Members"
          value={stats.total_members}
          icon={<Users className="w-8 h-8" />}
          color="text-info"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue_tasks}
          icon={<AlertTriangle className="w-8 h-8" />}
          color="text-error"
        />
        <StatCard
          label="Done (7d)"
          value={stats.completed_last_7_days}
          icon={<TrendingUp className="w-8 h-8" />}
          color="text-success"
        />
      </div>

      {/* ── Velocity Banner ── */}
      <div className="flex flex-wrap items-center gap-6 mb-8 p-4 rounded-lg bg-base-100 border border-base-200 shadow-sm">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-success" />
          <span className="text-sm text-base-content/70">Completed (7d):</span>
          <span className="font-bold text-lg">{stats.completed_last_7_days}</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-warning" />
          <span className="text-sm text-base-content/70">Created (7d):</span>
          <span className="font-bold text-lg">{stats.created_last_7_days}</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-error" />
          <span className="text-sm text-base-content/70">Blockers:</span>
          <span className="font-bold text-lg">{stats.tasks_by_status?.["blocked"] || 0}</span>
        </div>
      </div>

      {/* ── Status / Priority ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card title="Tasks by Status">
          {statusEntries.length === 0 ? (
            <p className="text-base-content/50 text-sm">No tasks yet</p>
          ) : (
            <div className="space-y-3">
              {statusEntries.map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <Badge variant={statusColor(status)}>{statusLabel(status)}</Badge>
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

        <Card title="Tasks by Priority">
          {priorityEntries.length === 0 ? (
            <p className="text-base-content/50 text-sm">No tasks yet</p>
          ) : (
            <div className="space-y-3">
              {priorityEntries.map(([priority, count]) => (
                <div key={priority} className="flex items-center justify-between">
                  <Badge variant={priorityColor(priority)}>{statusLabel(priority)}</Badge>
                  <span className="font-semibold">{count as number}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Member Workload ── */}
      <Card title="Member Workload" className="mb-8">
        {members.length === 0 ? (
          <p className="text-base-content/50 text-sm">No team members yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">Todo</th>
                  <th className="text-center">In Progress</th>
                  <th className="text-center">Done</th>
                  <th className="text-center">Blocked</th>
                  <th className="text-center">Overdue</th>
                  <th>Workload</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="hover">
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={m.display_name || m.email}
                          src={m.avatar_url}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium text-sm">
                            {m.display_name || m.email?.split("@")[0] || 'User'}
                          </p>
                          <p className="text-xs text-base-content/50">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center font-semibold">{m.total}</td>
                    <td className="text-center">{m.todo}</td>
                    <td className="text-center">{m.in_progress}</td>
                    <td className="text-center text-success">{m.done}</td>
                    <td className="text-center text-error">{m.blocked}</td>
                    <td className="text-center">
                      {m.overdue > 0 ? (
                        <span className="badge badge-error badge-sm">{m.overdue}</span>
                      ) : (
                        <span className="text-base-content/30">0</span>
                      )}
                    </td>
                    <td className="min-w-[120px]">
                      <WorkloadBar
                        todo={m.todo}
                        inProgress={m.in_progress}
                        done={m.done}
                        blocked={m.blocked}
                        total={m.total}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Recent Tasks ── */}
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
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover cursor-pointer"
                    onClick={() =>
                      (window.location.href = `/${orgSlug}/projects/${task.project_id}/tasks/${task.id}`)
                    }
                  >
                    <td className="font-medium">{task.title}</td>
                    <td>
                      <Badge variant={statusColor(task.status)}>
                        {statusLabel(task.status)}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={priorityColor(task.priority)}>
                        {statusLabel(task.priority)}
                      </Badge>
                    </td>
                    <td className="text-sm text-base-content/60">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelative(task.updated_at)}
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
