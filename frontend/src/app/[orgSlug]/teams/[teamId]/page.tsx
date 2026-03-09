"use client";

import { Button } from "@/components/ui/button";
import {
  Avatar,
  Badge,
  Card,
  LoadingPage,
  PageHeader,
} from "@/components/ui/shared";
import { useTeamPermissions } from "@/hooks/use-scoped-permissions";
import { api } from "@/lib/api";
import {
  formatRelative,
  priorityColor,
  statusColor,
  statusLabel,
} from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type {
  OrgMember,
  Role,
  Team,
  TeamDashboardStats,
  TeamMember,
} from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  FolderKanban,
  ListTodo,
  Shield,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

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
  if (total === 0)
    return <span className="text-xs text-base-content/40">No tasks</span>;
  const pct = (v: number) => `${(v / total) * 100}%`;
  return (
    <div
      className="flex h-2 rounded-full overflow-hidden bg-base-200 w-full"
      title={`Todo: ${todo}, In Progress: ${inProgress}, Done: ${done}, Blocked: ${blocked}`}
    >
      {done > 0 && <div className="bg-success" style={{ width: pct(done) }} />}
      {inProgress > 0 && (
        <div className="bg-info" style={{ width: pct(inProgress) }} />
      )}
      {todo > 0 && <div className="bg-warning" style={{ width: pct(todo) }} />}
      {blocked > 0 && (
        <div className="bg-error" style={{ width: pct(blocked) }} />
      )}
    </div>
  );
}

/* ── Team Members Management ── */
function TeamMembersSection({
  orgId,
  teamId,
  canManage,
}: {
  orgId: string;
  teamId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");

  const { data: members, isLoading } = useQuery<{ data: TeamMember[] }>({
    queryKey: ["team-members", orgId, teamId],
    queryFn: () => api.teamMembers.list(orgId, teamId),
    enabled: !!orgId && !!teamId,
  });

  const { data: teamRoles } = useQuery<Role[]>({
    queryKey: ["permissions-roles", orgId, "team"],
    queryFn: () => api.permissions.roles.list(orgId, "team"),
    enabled: !!orgId && canManage,
  });

  const { data: orgMembers } = useQuery<{ data: OrgMember[] }>({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
    enabled: !!orgId && canManage,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.teamMembers.add(orgId, teamId, { user_id: addUserId, role: addRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", orgId, teamId] });
      setAddUserId("");
      setAddRole("member");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.teamMembers.remove(orgId, teamId, userId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["team-members", orgId, teamId] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.teamMembers.update(orgId, teamId, userId, { role }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["team-members", orgId, teamId] }),
  });

  const memberList = members?.data || [];
  const memberIds = new Set(memberList.map((m) => m.user_id));
  const availableOrg = (orgMembers?.data || []).filter(
    (m) => !memberIds.has(m.user_id),
  );

  // Build role options: use DB-driven team roles if available, else built-in slugs
  const roleOptions =
    teamRoles && teamRoles.length > 0
      ? teamRoles.map((r) => ({ value: r.slug, label: r.name }))
      : [
          { value: "team_lead", label: "Team Lead" },
          { value: "member", label: "Member" },
          { value: "viewer", label: "Viewer" },
        ];

  if (isLoading) return <LoadingPage />;

  return (
    <div className="space-y-4 mt-2">
      {/* Add member row — only for users with manage permission */}
      {canManage && (
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Team Member
          </h3>
          <form
            className="flex gap-2 items-end flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              if (addUserId) addMutation.mutate();
            }}
          >
            <div className="flex-1 min-w-40">
              <label className="label">
                <span className="label-text text-xs">Org Member</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
              >
                <option value="">Select member…</option>
                {availableOrg.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email || m.user_id.slice(0, 16)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                <span className="label-text text-xs">Team Role</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
              >
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              size="sm"
              loading={addMutation.isPending}
              disabled={!addUserId}
            >
              <UserPlus className="w-4 h-4" /> Add
            </Button>
          </form>
        </Card>
      )}

      {/* Members table */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Members ({memberList.length})
          </h3>
        </div>
        {memberList.length === 0 ? (
          <p className="text-center py-6 text-base-content/50">
            No team members yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Team Role</th>
                  <th>Permissions</th>
                  <th>Joined</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {memberList.map((m) => {
                  const dbRole = teamRoles?.find((r) => r.slug === m.role);
                  const permCount = dbRole?.permissions?.length ?? null;
                  return (
                    <tr key={m.user_id} className="hover">
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={m.display_name || m.email || "?"}
                            src={m.avatar_url}
                            size="sm"
                          />
                          <div>
                            <span className="text-sm font-medium">
                              {m.display_name ||
                                m.email ||
                                m.user_id.slice(0, 12)}
                            </span>
                            {m.email && m.display_name && (
                              <span className="block text-xs text-base-content/50">
                                {m.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {canManage ? (
                          <select
                            className="select select-ghost select-xs capitalize"
                            value={m.role}
                            onChange={(e) =>
                              updateRoleMutation.mutate({
                                userId: m.user_id,
                                role: e.target.value,
                              })
                            }
                          >
                            {roleOptions.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge badge-ghost badge-sm capitalize">
                            {m.role.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      <td>
                        {permCount !== null ? (
                          <span className="flex items-center gap-1 text-xs text-base-content/60">
                            <Shield className="w-3 h-3" /> {permCount}{" "}
                            permissions
                          </span>
                        ) : (
                          <span className="text-xs text-base-content/40">
                            —
                          </span>
                        )}
                      </td>
                      <td className="text-sm text-base-content/60">
                        {m.joined_at
                          ? new Date(m.joined_at).toLocaleDateString()
                          : "—"}
                      </td>
                      {canManage && (
                        <td>
                          <button
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() => removeMutation.mutate(m.user_id)}
                            title="Remove from team"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Role permissions reference */}
      {teamRoles && teamRoles.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Team Role Permissions Reference
          </h3>
          <div className="space-y-2">
            {teamRoles.map((role) => (
              <div
                key={role.id}
                className="flex items-start gap-3 py-2 border-b border-base-200 last:border-0"
              >
                <div className="min-w-32">
                  <span className="font-medium text-sm">{role.name}</span>
                  {role.is_system && (
                    <span className="ml-1 badge badge-xs badge-ghost">
                      System
                    </span>
                  )}
                  {role.description && (
                    <p className="text-xs text-base-content/50 mt-0.5">
                      {role.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(role.permissions || []).map((p) => (
                    <span key={p.id} className="badge badge-outline badge-xs">
                      {p.resource}.{p.action}
                    </span>
                  ))}
                  {(!role.permissions || role.permissions.length === 0) && (
                    <span className="text-xs text-base-content/40">
                      No permissions assigned
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "members">(
    "dashboard",
  );
  const { can: canTeam } = useTeamPermissions(teamId);

  const { data: team, isLoading: teamLoading } = useQuery<Team>({
    queryKey: ["team", orgId, teamId],
    queryFn: () => api.teams.get(orgId, teamId),
    enabled: !!orgId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<TeamDashboardStats>(
    {
      queryKey: ["team-dashboard", orgId, teamId],
      queryFn: () => api.teams.dashboard(orgId, teamId),
      enabled: !!orgId,
    },
  );

  if (teamLoading || (activeTab === "dashboard" && statsLoading))
    return <LoadingPage />;

  const canManageMembers = canTeam("team", "manage_members");

  return (
    <div>
      {/* Back link + Header */}
      <div className="mb-2">
        <Link href={`/${orgSlug}/teams`} className="btn btn-ghost btn-sm gap-1">
          <ArrowLeft className="w-4 h-4" /> Teams
        </Link>
      </div>
      <PageHeader
        title={team?.name || "Team"}
        description={
          team?.description || "Team workload, members, and task breakdown"
        }
      />

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-boxed bg-base-200/50 mb-6 w-fit">
        <button
          role="tab"
          className={`tab tab-sm ${activeTab === "dashboard" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          <TrendingUp className="w-3.5 h-3.5 mr-1" /> Dashboard
        </button>
        <button
          role="tab"
          className={`tab tab-sm ${activeTab === "members" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("members")}
        >
          <Users className="w-3.5 h-3.5 mr-1" /> Members
        </button>
      </div>

      {/* Members Tab */}
      {activeTab === "members" && (
        <TeamMembersSection
          orgId={orgId}
          teamId={teamId}
          canManage={canManageMembers}
        />
      )}

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && stats && (
        <>
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
              <span className="text-sm text-base-content/70">
                Completed (7d):
              </span>
              <span className="font-bold text-lg">
                {stats.completed_last_7_days}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-warning" />
              <span className="text-sm text-base-content/70">
                Created (7d):
              </span>
              <span className="font-bold text-lg">
                {stats.created_last_7_days}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-error" />
              <span className="text-sm text-base-content/70">Blockers:</span>
              <span className="font-bold text-lg">
                {stats.tasks_by_status?.["blocked"] || 0}
              </span>
            </div>
          </div>

          {/* ── Status / Priority ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card title="Tasks by Status">
              {Object.entries(stats.tasks_by_status || {}).length === 0 ? (
                <p className="text-base-content/50 text-sm">No tasks yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.tasks_by_status || {}).map(
                    ([status, count]) => (
                      <div
                        key={status}
                        className="flex items-center justify-between"
                      >
                        <Badge variant={statusColor(status)}>
                          {statusLabel(status)}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {count as number}
                          </span>
                          <progress
                            className="progress progress-primary w-24"
                            value={count as number}
                            max={stats.total_tasks || 1}
                          />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </Card>

            <Card title="Tasks by Priority">
              {Object.entries(stats.tasks_by_priority || {}).length === 0 ? (
                <p className="text-base-content/50 text-sm">No tasks yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.tasks_by_priority || {}).map(
                    ([priority, count]) => (
                      <div
                        key={priority}
                        className="flex items-center justify-between"
                      >
                        <Badge variant={priorityColor(priority)}>
                          {statusLabel(priority)}
                        </Badge>
                        <span className="font-semibold">{count as number}</span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* ── Member Workload ── */}
          <Card title="Member Workload" className="mb-8">
            {(stats.member_workload || []).length === 0 ? (
              <p className="text-base-content/50 text-sm">
                No team members yet
              </p>
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
                    {(stats.member_workload || []).map((m) => (
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
                                {m.display_name ||
                                  m.email?.split("@")[0] ||
                                  "User"}
                              </p>
                              <p className="text-xs text-base-content/50">
                                {m.email}
                              </p>
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
                            <span className="badge badge-error badge-sm">
                              {m.overdue}
                            </span>
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
            {!stats.recent_tasks || stats.recent_tasks.length === 0 ? (
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
                          (window.location.href = `/${orgSlug}/projects/${task.project_id}`)
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
        </>
      )}
    </div>
  );
}
