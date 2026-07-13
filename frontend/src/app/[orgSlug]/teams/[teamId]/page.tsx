"use client";

import { CalendarView, getDateRange } from "@/components/calendar";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  LoadingPage,
  PageHeader,
} from "@/components/ui/shared";
import { Tabs } from "@/components/ui/tabs";
import { useTeamPolicies } from "@/hooks/use-policies";
import { api } from "@/lib/api";
import { PRIORITY_BADGE, STATUS_BADGE } from "@/lib/task-colors";
import { cn, formatDate, formatRelative, statusLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type {
  Role,
  Task,
  Team,
  TeamDashboardStats,
  TeamMember,
} from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Clock,
  FolderKanban,
  ListTodo,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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

/* ── Page ── */
export default function TeamDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamId: string }>;
}) {
  const { orgSlug, teamId } = use(params);
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id || "";
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "overview" | "calendar" | "members"
  >("overview");

  // Calendar state
  const calInitRange = useMemo(() => getDateRange(new Date(), "month"), []);
  const [calDateRange, setCalDateRange] = useState(calInitRange);

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

  // Fetch team's projects for calendar
  const { data: teamProjects } = useQuery({
    queryKey: ["projects", orgId, teamId],
    queryFn: () => api.projects.list(orgId, { team_id: teamId }),
    enabled: !!orgId && activeTab === "calendar",
  });

  // Fetch tasks for calendar from all team projects
  const { data: calTasksData, isLoading: calTasksLoading } = useQuery({
    queryKey: [
      "calendar-tasks-team",
      orgId,
      teamId,
      calDateRange.from,
      calDateRange.to,
      teamProjects?.data?.map((p) => p.id),
    ],
    queryFn: async () => {
      const projects = teamProjects?.data || [];
      if (projects.length === 0) return [] as Task[];
      const results = await Promise.all(
        projects.map((p) => {
          const params = new URLSearchParams();
          // Overlap window so tasks spanning the view edges still render.
          params.set("range_from", calDateRange.from);
          params.set("range_to", calDateRange.to);
          params.set("limit", "500");
          return api.tasks
            .list(orgId, p.id, params.toString())
            .then((r) => r.data || []);
        }),
      );
      return results.flat();
    },
    enabled:
      !!orgId &&
      activeTab === "calendar" &&
      (teamProjects?.data?.length ?? 0) > 0,
  });

  // Fetch org members for calendar avatars
  const { data: orgMembersForCal } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
    enabled: !!orgId && activeTab === "calendar",
    staleTime: 5 * 60_000,
  });

  const calMembers = useMemo(() => {
    return (orgMembersForCal?.data || []).map((m) => ({
      project_id: "",
      user_id: m.user_id,
      email: m.email,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      role: m.role,
      joined_at: m.joined_at,
    }));
  }, [orgMembersForCal]);

  const handleCalRangeChange = useCallback((from: string, to: string) => {
    setCalDateRange({ from, to });
  }, []);

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
        description={
          team?.description || "Team workload, velocity, and task breakdown"
        }
      />

      {/* Tab switcher */}
      <Tabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            icon: <ListTodo className="w-3.5 h-3.5" />,
          },
          {
            id: "members",
            label: "Members",
            icon: <Users className="w-3.5 h-3.5" />,
          },
          {
            id: "calendar",
            label: "Calendar",
            icon: <CalendarDays className="w-3.5 h-3.5" />,
          },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="boxed"
        size="sm"
        className="mb-6 w-fit bg-base-200/50"
      />

      {/* Members Tab */}
      {activeTab === "members" && (
        <MembersTab orgId={orgId} orgSlug={orgSlug} teamId={teamId} />
      )}

      {/* Calendar Tab */}
      {activeTab === "calendar" && (
        <div className="h-[calc(100vh-220px)]">
          <CalendarView
            tasks={calTasksData || []}
            members={calMembers}
            isLoading={calTasksLoading}
            onTaskClick={(task) => {
              router.push(
                `/${orgSlug}/projects/${task.project_id}?task=${task.id}`,
              );
            }}
            onRangeChange={handleCalRangeChange}
          />
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && (
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
              {statusEntries.length === 0 ? (
                <p className="text-base-content/50 text-sm">No tasks yet</p>
              ) : (
                <div className="space-y-3">
                  {statusEntries.map(([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between"
                    >
                      <Badge
                        variant={
                          STATUS_BADGE[status as keyof typeof STATUS_BADGE]
                        }
                      >
                        {statusLabel(status)}
                      </Badge>
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
                    <div
                      key={priority}
                      className="flex items-center justify-between"
                    >
                      <Badge
                        variant={
                          PRIORITY_BADGE[
                            priority as keyof typeof PRIORITY_BADGE
                          ]
                        }
                      >
                        {statusLabel(priority)}
                      </Badge>
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
                          router.push(
                            `/${orgSlug}/projects/${task.project_id}?task=${task.id}`,
                          )
                        }
                      >
                        <td className="font-medium">{task.title}</td>
                        <td>
                          <Badge variant={STATUS_BADGE[task.status]}>
                            {statusLabel(task.status)}
                          </Badge>
                        </td>
                        <td>
                          <Badge variant={PRIORITY_BADGE[task.priority]}>
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

/* ════════════════════════════════════════════════════════
   Members Tab — full CRUD with RBAC
   ════════════════════════════════════════════════════════ */

const MEMBER_PAGE_SIZE = 20;

function MembersTab({
  orgId,
  orgSlug,
  teamId,
}: {
  orgId: string;
  orgSlug: string;
  teamId: string;
}) {
  const qc = useQueryClient();
  const policies = useTeamPolicies(teamId);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("display_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("");
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [localRoles, setLocalRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Team members (paginated)
  const { data: membersResponse, isLoading } = useQuery({
    queryKey: [
      "team-members",
      orgId,
      teamId,
      debouncedSearch,
      roleFilter,
      page,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      api.teamMembers.list(orgId, teamId, {
        limit: MEMBER_PAGE_SIZE,
        offset: page * MEMBER_PAGE_SIZE,
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    enabled: !!orgId,
  });

  const membersList = membersResponse?.data || [];
  const totalMembers = membersResponse?.total || 0;
  const totalPages = Math.ceil(totalMembers / MEMBER_PAGE_SIZE);

  // Org members (for add dropdown — exclude existing team members)
  const { data: orgMembers } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
    enabled: !!orgId && showAddForm,
    staleTime: 5 * 60_000,
  });

  // Team roles
  const { data: teamRoles } = useQuery({
    queryKey: ["team-roles", orgId],
    queryFn: () => api.permissions.roles.list(orgId, "team"),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });

  const roleOptions = (teamRoles || []).map((r: Role) => ({
    value: r.slug,
    label: r.name + (r.is_system ? "" : " (Custom)"),
  }));

  // Keep addRole in sync with available options
  useEffect(() => {
    if (teamRoles && teamRoles.length > 0 && !addRole) {
      setAddRole(teamRoles[0].slug);
    }
  }, [teamRoles, addRole]);

  // Sync local role state
  useEffect(() => {
    if (membersList.length > 0) {
      setLocalRoles((prev) => {
        const next = { ...prev };
        for (const m of membersList) {
          if (!(m.user_id in next)) next[m.user_id] = m.role;
        }
        return next;
      });
    }
  }, [membersList]);

  const refreshMembers = () => {
    qc.invalidateQueries({ queryKey: ["team-members", orgId, teamId] });
    qc.invalidateQueries({ queryKey: ["team-dashboard", orgId, teamId] });
    qc.invalidateQueries({ queryKey: ["teams"] });
    qc.refetchQueries({
      queryKey: ["team-members", orgId, teamId],
      type: "active",
    });
  };

  const addMutation = useMutation({
    mutationFn: () =>
      api.teamMembers.add(orgId, teamId, {
        user_id: addUserId,
        role: addRole,
      }),
    onSuccess: () => {
      refreshMembers();
      setAddUserId("");
      setAddRole(teamRoles?.[0]?.slug ?? "");
      setShowAddForm(false);
      toast.success("Member added to team");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.teamMembers.remove(orgId, teamId, userId),
    onSuccess: (_, userId) => {
      setLocalRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      refreshMembers();
      setRemoveTarget(null);
      toast.success("Member removed from team");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.teamMembers.update(orgId, teamId, userId, { role }),
    onSuccess: () => {
      refreshMembers();
      toast.success("Member role updated");
    },
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    const prevRole = localRoles[userId];
    setLocalRoles((prev) => ({ ...prev, [userId]: newRole }));
    updateRoleMutation.mutate(
      { userId, role: newRole },
      {
        onError: () => {
          setLocalRoles((prev) => ({ ...prev, [userId]: prevRole }));
          toast.error("Failed to update role");
        },
      },
    );
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(0);
  };

  const memberIds = new Set(membersList.map((m: TeamMember) => m.user_id));
  const availableOrg = (orgMembers?.data || []).filter(
    (m) => !memberIds.has(m.user_id),
  );

  const SortIcon = ({ col }: { col: string }) => (
    <ChevronDown
      className={cn(
        "w-3 h-3 inline ml-0.5 transition-transform",
        sortBy === col ? "opacity-100" : "opacity-30",
        sortBy === col && sortOrder === "asc" && "rotate-180",
      )}
    />
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search members..."
            className="input input-bordered input-sm w-full pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2 top-2 btn btn-ghost btn-xs btn-circle"
              onClick={() => setSearch("")}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {roleOptions.length > 0 && (
          <select
            className="select select-bordered select-sm"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All roles</option>
            {roleOptions.map((r: { value: string; label: string }) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        <span className="text-sm text-base-content/50">
          {totalMembers} member{totalMembers !== 1 ? "s" : ""}
        </span>

        {policies.canManageMembers && (
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <UserPlus className="w-4 h-4" /> Add Member
          </Button>
        )}
      </div>

      {/* Add member form */}
      {showAddForm && policies.canManageMembers && (
        <Card className="mb-4">
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (addUserId) addMutation.mutate();
            }}
          >
            <div className="flex-1">
              <label className="label">
                <span className="label-text text-sm font-medium">
                  Select Org Member
                </span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
              >
                <option value="">Choose a member...</option>
                {availableOrg.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email || m.user_id.slice(0, 16)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                <span className="label-text text-sm font-medium">Role</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
              >
                {roleOptions.map((r: { value: string; label: string }) => (
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
              <Plus className="w-4 h-4" /> Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
          </form>
        </Card>
      )}

      {/* Members table */}
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-base-200 rounded-lg border border-base-200"
            />
          ))}
        </div>
      ) : membersList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-base-content/50">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No members found</p>
          {policies.canManageMembers && !showAddForm && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowAddForm(true)}
            >
              <UserPlus className="w-4 h-4" /> Add first member
            </Button>
          )}
        </div>
      ) : (
        <Card>
          <div className="w-full overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("display_name")}
                  >
                    Member <SortIcon col="display_name" />
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("email")}
                  >
                    Email <SortIcon col="email" />
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("role")}
                  >
                    Role <SortIcon col="role" />
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("joined_at")}
                  >
                    Joined <SortIcon col="joined_at" />
                  </th>
                  {policies.canManageMembers && (
                    <th className="text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {membersList.map((m: TeamMember) => (
                  <tr key={m.user_id} className="hover">
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={
                            m.display_name || m.email || m.user_id.slice(0, 4)
                          }
                          src={m.avatar_url}
                          size="sm"
                        />
                        <span className="font-medium text-sm">
                          {m.display_name ||
                            m.email?.split("@")[0] ||
                            m.user_id.slice(0, 12)}
                        </span>
                      </div>
                    </td>
                    <td className="text-sm text-base-content/60">
                      {m.email || "\u2014"}
                    </td>
                    <td>
                      {policies.canManageMembers ? (
                        <select
                          className="select select-ghost select-xs capitalize"
                          value={localRoles[m.user_id] ?? m.role}
                          onChange={(e) =>
                            handleRoleChange(m.user_id, e.target.value)
                          }
                          disabled={roleOptions.length === 0}
                        >
                          {roleOptions.map(
                            (r: { value: string; label: string }) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ),
                          )}
                        </select>
                      ) : (
                        <span className="badge badge-sm badge-outline capitalize">
                          {statusLabel(m.role)}
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-base-content/60">
                      {formatDate(m.joined_at)}
                    </td>
                    {policies.canManageMembers && (
                      <td>
                        <div className="flex gap-1 justify-end">
                          <button
                            className="btn btn-ghost btn-xs btn-square text-error"
                            onClick={() => setRemoveTarget(m)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            className="btn btn-sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-base-content/60">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Remove confirmation */}
      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() =>
          removeTarget && removeMutation.mutate(removeTarget.user_id)
        }
        title="Remove Member"
        message={`Remove "${removeTarget?.display_name || removeTarget?.email || "this member"}" from the team?`}
        loading={removeMutation.isPending}
      />
    </div>
  );
}
