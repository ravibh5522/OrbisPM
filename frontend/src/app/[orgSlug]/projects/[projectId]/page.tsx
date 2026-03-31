"use client";

import { CalendarView, getDateRange } from "@/components/calendar";
import { ProjectAnnouncements } from "@/components/projects/project-announcements";
import { ProjectDashboard } from "@/components/projects/project-dashboard";
import { ProjectChangeRequests } from "@/components/tasks/change-requests";
import { CSVImportDialog } from "@/components/tasks/csv-import-dialog";
import {
  activeFilterCount,
  EMPTY_GLOBAL_FILTER,
  GlobalFilterDropdown,
  isGlobalFilterActive,
  type GlobalFilterState,
} from "@/components/tasks/global-filter-dropdown";
import { TaskColumns } from "@/components/tasks/task-columns";
import { TaskTreeView } from "@/components/tasks/task-tree-view";
import { Button } from "@/components/ui/button";
import { Avatar, Card } from "@/components/ui/shared";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectTaskStore } from "@/stores/project-task-store";
import { useUIStore } from "@/stores/ui-store";
import type { ProjectMember, ProjectTeam, Role, Team } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Columns3,
  Download,
  Filter,
  GitFork,
  GitPullRequest,
  Link2,
  List,
  ListTodo,
  Megaphone,
  Search,
  Settings,
  Trash2,
  Unlink,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const TaskListView = dynamic(
  () =>
    import("@/components/tasks/task-list-view").then((mod) => ({
      default: mod.TaskListView,
    })),
  {
    loading: () => (
      <div className="h-64 animate-pulse bg-base-200 rounded-lg" />
    ),
  },
);

const ProjectSettings = dynamic(
  () =>
    import("@/components/projects/project-settings").then((mod) => ({
      default: mod.ProjectSettings,
    })),
  {
    loading: () => (
      <div className="h-64 animate-pulse bg-base-200 rounded-lg" />
    ),
  },
);

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFocusTaskId = searchParams.get("task") || undefined;
  const [openedTaskId, setOpenedTaskId] = useState<string | undefined>(
    undefined,
  );
  const focusTaskId = openedTaskId || initialFocusTaskId;
  const currentOrg = useAuthStore((s) => s.currentOrg);

  // Persisted tab/view state per project
  const {
    getProjectTab,
    setProjectTab,
    getProjectTaskView,
    setProjectTaskView,
  } = useUIStore();
  const [activeTab, setActiveTabLocal] = useState<
    | "tasks"
    | "members"
    | "teams"
    | "reviews"
    | "announcements"
    | "dashboard"
    | "settings"
  >(
    getProjectTab(projectId) as
      | "tasks"
      | "members"
      | "teams"
      | "reviews"
      | "announcements"
      | "dashboard"
      | "settings",
  );
  const [taskView, setTaskViewLocal] = useState<
    "columns" | "list" | "tree" | "calendar"
  >(getProjectTaskView(projectId) as "columns" | "list" | "tree" | "calendar");
  const setActiveTab = useCallback(
    (tab: typeof activeTab) => {
      setActiveTabLocal(tab);
      setProjectTab(projectId, tab);
    },
    [projectId, setProjectTab],
  );
  const setTaskView = useCallback(
    (view: typeof taskView) => {
      setTaskViewLocal(view);
      setProjectTaskView(projectId, view);
    },
    [projectId, setProjectTaskView],
  );

  const [importOpen, setImportOpen] = useState(false);
  const [toolbarEl, setToolbarEl] = useState<HTMLDivElement | null>(null);
  const [globalFilter, setGlobalFilter] = useState<GlobalFilterState>({
    ...EMPTY_GLOBAL_FILTER,
  });
  const [showGlobalFilter, setShowGlobalFilter] = useState(false);
  const projPerms = useProjectPermissions(projectId);
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);

  // Calendar view state
  const calInitRange = useMemo(() => getDateRange(new Date(), "month"), []);
  const [calDateRange, setCalDateRange] = useState(calInitRange);

  // Callback for tree/list view "Open" action — switch to columns and expand the task
  const handleOpenTask = useCallback((taskId: string) => {
    setOpenedTaskId(taskId);
    setTaskView("columns");
  }, []);

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["project", currentOrg?.id, projectId],
    queryFn: () => api.projects.get(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  // Join/leave project room on the org-level WebSocket
  useEffect(() => {
    useProjectTaskStore.getState().setCurrentProjectId(projectId);
    return () => {
      useProjectTaskStore.getState().setCurrentProjectId(null);
    };
  }, [projectId]);

  const { data: members } = useQuery({
    queryKey: ["project-members", currentOrg?.id, projectId],
    queryFn: () => api.projectMembers.list(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  // Fetch org members for comprehensive name resolution in comments/previews
  const { data: orgMembersData } = useQuery({
    queryKey: ["org-members", currentOrg?.id],
    queryFn: () => api.members.list(currentOrg!.id),
    enabled: !!currentOrg,
    staleTime: 5 * 60_000,
  });

  // Calendar tasks fetched only when calendar view is active
  const { data: calTasksData, isLoading: calTasksLoading } = useQuery({
    queryKey: [
      "calendar-tasks-project",
      currentOrg?.id,
      projectId,
      calDateRange.from,
      calDateRange.to,
    ],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("due_date_from", calDateRange.from);
      p.set("due_date_to", calDateRange.to);
      p.set("limit", "200");
      return api.tasks.list(currentOrg!.id, projectId, p.toString());
    },
    enabled: !!currentOrg && taskView === "calendar",
  });

  const handleCalRangeChange = useCallback((from: string, to: string) => {
    setCalDateRange({ from, to });
  }, []);

  // Set breadcrumb in top bar
  useEffect(() => {
    if (project && currentOrg) {
      setBreadcrumb({
        label: project.name,
        backHref: `/${currentOrg.slug}/projects`,
      });
    }
    return () => setBreadcrumb(null);
  }, [project, currentOrg, setBreadcrumb]);

  if (projLoading)
    return (
      <div className="h-full flex flex-col animate-pulse">
        <div className="flex items-center gap-2 py-1.5 border-b border-base-200 mb-2">
          <div className="h-8 bg-base-300 rounded w-full max-w-96" />
        </div>
        <div className="flex-1 bg-base-200 rounded-lg border border-base-200" />
      </div>
    );
  if (!project)
    return <div className="text-center py-12">Project not found</div>;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Single consolidated toolbar row */}
      <div className="flex items-center justify-between gap-2 py-1.5 border-b border-base-200 flex-wrap">
        {/* Tabs */}
        <div
          role="tablist"
          className="tabs tabs-boxed bg-base-200/50 flex-shrink-0"
        >
          <button
            role="tab"
            className={`tab tab-sm ${activeTab === "dashboard" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <ListTodo className="w-3.5 h-3.5 mr-1" /> Dashboard
          </button>
          <button
            role="tab"
            className={`tab tab-sm ${activeTab === "tasks" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            <Columns3 className="w-3.5 h-3.5 mr-1" /> Tasks
          </button>
          {projPerms.can("members", "manage") && (
            <button
              role="tab"
              className={`tab tab-sm ${activeTab === "members" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              <Users className="w-3.5 h-3.5 mr-1" /> Members
            </button>
          )}
          {projPerms.can("members", "manage") && (
            <button
              role="tab"
              className={`tab tab-sm ${activeTab === "teams" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("teams")}
            >
              <Link2 className="w-3.5 h-3.5 mr-1" /> Teams
            </button>
          )}
          <button
            role="tab"
            className={`tab tab-sm ${activeTab === "reviews" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("reviews")}
          >
            <GitPullRequest className="w-3.5 h-3.5 mr-1" /> Reviews
          </button>
          <button
            role="tab"
            className={`tab tab-sm ${activeTab === "announcements" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("announcements")}
          >
            <Megaphone className="w-3.5 h-3.5 mr-1" /> Announcements
          </button>
          {projPerms.can("project", "update") && (
            <button
              role="tab"
              className={`tab tab-sm ${activeTab === "settings" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <Settings className="w-3.5 h-3.5 mr-1" /> Settings
            </button>
          )}
        </div>

        {/* Global filter button — affects all task views */}
        {(activeTab === "tasks" || activeTab === "dashboard") && (
          <div className="relative">
            <button
              className={cn(
                "btn btn-sm gap-1",
                isGlobalFilterActive(globalFilter)
                  ? "btn-primary"
                  : "btn-ghost",
              )}
              onClick={() => setShowGlobalFilter((p) => !p)}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {isGlobalFilterActive(globalFilter) && (
                <span className="badge badge-xs badge-neutral">
                  {activeFilterCount(globalFilter)}
                </span>
              )}
            </button>
            {showGlobalFilter && (
              <GlobalFilterDropdown
                filter={globalFilter}
                members={members?.data || []}
                onChange={setGlobalFilter}
                onClose={() => setShowGlobalFilter(false)}
              />
            )}
          </div>
        )}

        {/* Actions: Import/Export + View toggle (only visible when Tasks tab is active) */}
        {activeTab === "tasks" && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Toolbar buttons portaled from TaskColumns */}
            {taskView === "columns" && (
              <div ref={setToolbarEl} className="flex items-center gap-2" />
            )}
            <Button
              variant="outline"
              size="xs"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="w-3.5 h-3.5 mr-1" /> Import CSV
            </Button>
            <div className="dropdown dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-outline btn-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content z-50 menu p-2 shadow bg-base-100/95 backdrop-blur-[20px] rounded-box w-44"
              >
                <li>
                  <a
                    onClick={() => api.tasks.export(currentOrg!.id, projectId)}
                  >
                    <Download className="w-4 h-4" /> CSV
                  </a>
                </li>
                <li>
                  <a
                    onClick={() =>
                      api.tasks.exportCalendar(currentOrg!.id, projectId)
                    }
                  >
                    <CalendarDays className="w-4 h-4" /> iCal (.ics)
                  </a>
                </li>
              </ul>
            </div>
            <div className="join">
              <button
                className={`join-item btn btn-sm ${taskView === "columns" ? "btn-active" : ""}`}
                onClick={() => setTaskView("columns")}
                title="Miller Columns"
              >
                <Columns3 className="w-4 h-4" />
              </button>
              <button
                className={`join-item btn btn-sm ${taskView === "tree" ? "btn-active" : ""}`}
                onClick={() => setTaskView("tree")}
                title="Tree View"
              >
                <GitFork className="w-4 h-4" />
              </button>
              <button
                className={`join-item btn btn-sm ${taskView === "list" ? "btn-active" : ""}`}
                onClick={() => setTaskView("list")}
                title="Sortable List"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                className={`join-item btn btn-sm ${taskView === "calendar" ? "btn-active" : ""}`}
                onClick={() => setTaskView("calendar")}
                title="Calendar View"
              >
                <CalendarDays className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dashboard tab */}
      {activeTab === "dashboard" && (
        <div className="flex-1 overflow-auto">
          <ProjectDashboard orgId={currentOrg!.id} projectId={projectId} />
        </div>
      )}

      {/* Tasks tab — keep mounted but hidden to preserve expanded state */}
      <div
        className={cn(
          "flex-1 flex flex-col min-h-0",
          activeTab !== "tasks" && "hidden",
        )}
      >
        <CSVImportDialog
          orgId={currentOrg!.id}
          projectId={projectId}
          open={importOpen}
          onClose={() => setImportOpen(false)}
        />

        <div
          className={cn(
            "flex-1 flex flex-col min-h-0",
            taskView !== "columns" && "hidden",
          )}
        >
          <TaskColumns
            orgId={currentOrg!.id}
            orgSlug={currentOrg!.slug}
            projectId={projectId}
            members={members?.data || []}
            orgMembers={orgMembersData?.data}
            focusTaskId={focusTaskId}
            toolbarPortal={toolbarEl}
            globalFilter={globalFilter}
          />
        </div>
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0",
            taskView !== "tree" && "hidden",
          )}
        >
          <TaskTreeView
            orgId={currentOrg!.id}
            orgSlug={currentOrg!.slug}
            projectId={projectId}
            members={members?.data || []}
            onOpenTask={handleOpenTask}
            globalFilter={globalFilter}
          />
        </div>
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0",
            taskView !== "list" && "hidden",
          )}
        >
          <TaskListView
            orgId={currentOrg!.id}
            orgSlug={currentOrg!.slug}
            projectId={projectId}
            members={members?.data || []}
            globalFilter={globalFilter}
          />
        </div>
        {taskView === "calendar" && (
          <CalendarView
            tasks={calTasksData?.data || []}
            members={members?.data || []}
            isLoading={calTasksLoading}
            onTaskClick={(task) => {
              setOpenedTaskId(task.id);
              setTaskView("columns");
            }}
            onRangeChange={handleCalRangeChange}
          />
        )}
      </div>

      {/* Members tab */}
      {activeTab === "members" && (
        <div className="flex-1 overflow-auto">
          <ProjectMembersSection orgId={currentOrg!.id} projectId={projectId} />
        </div>
      )}

      {/* Teams tab */}
      {activeTab === "teams" && (
        <div className="flex-1 overflow-auto">
          <ProjectTeamsSection orgId={currentOrg!.id} projectId={projectId} />
        </div>
      )}

      {/* Reviews tab */}
      {activeTab === "reviews" && (
        <div className="flex-1 overflow-auto">
          <ProjectChangeRequests
            orgId={currentOrg!.id}
            projectId={projectId}
            members={
              (members?.data ||
                []) as unknown as import("@/types/domain").OrgMember[]
            }
          />
        </div>
      )}

      {/* Announcements tab */}
      {activeTab === "announcements" && (
        <div className="flex-1 overflow-auto">
          <ProjectAnnouncements orgId={currentOrg!.id} projectId={projectId} />
        </div>
      )}

      {/* Settings tab */}
      {activeTab === "settings" && (
        <div className="flex-1 overflow-auto">
          <ProjectSettings orgId={currentOrg!.id} project={project} />
        </div>
      )}
    </div>
  );
}

/* ─── Project Members Section (Internal / External tabs) ─── */

function ProjectMembersSection({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<"internal" | "external">("internal");
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");

  // Search, filter, pagination state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [page, setPage] = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const limit = 15;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Internal tab — add member from a linked team
  const [addInternalTeamId, setAddInternalTeamId] = useState("");
  const [addInternalUserId, setAddInternalUserId] = useState("");
  const [addInternalRole, setAddInternalRole] = useState("member");

  // Removal dialog state
  const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null);
  const [removeTaskCount, setRemoveTaskCount] = useState<number | null>(null);
  const [removeReassignTo, setRemoveReassignTo] = useState("");
  const [removeLoading, setRemoveLoading] = useState(false);

  // Local role state to prevent dirty reads/writes on concurrent updates
  const [localRoles, setLocalRoles] = useState<Record<string, string>>({});

  // Server-side paginated members query
  const { data: membersResponse, isLoading: membersLoading } = useQuery({
    queryKey: [
      "project-members",
      orgId,
      projectId,
      debouncedSearch,
      filterRole,
      page,
    ],
    queryFn: () =>
      api.projectMembers.list(orgId, projectId, {
        limit,
        offset: page * limit,
        search: debouncedSearch || undefined,
        role: filterRole || undefined,
      }),
    enabled: !!orgId,
  });

  const members = membersResponse?.data || [];

  const { data: orgMembers } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
  });

  const { data: projectRoles } = useQuery({
    queryKey: ["project-roles", orgId],
    queryFn: () => api.permissions.roles.list(orgId, "project"),
  });

  // Linked teams for the internal add form
  const { data: linkedTeams } = useQuery({
    queryKey: ["project-teams", orgId, projectId],
    queryFn: () => api.projectTeams.list(orgId, projectId),
    enabled: !!orgId,
  });

  // Members of the currently selected linked team (for internal add)
  const { data: selectedTeamMembers } = useQuery({
    queryKey: ["team-members", orgId, addInternalTeamId],
    queryFn: () => api.teamMembers.list(orgId, addInternalTeamId),
    enabled: !!addInternalTeamId,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.projectMembers.add(orgId, projectId, {
        user_id: addUserId,
        role: addRole,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members"] });
      setAddUserId("");
      setAddRole("member");
      toast.success("Member added to project");
    },
  });

  const addInternalMutation = useMutation({
    mutationFn: () =>
      api.projectMembers.add(orgId, projectId, {
        user_id: addInternalUserId,
        role: addInternalRole,
        source_team_id: addInternalTeamId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members"] });
      setAddInternalUserId("");
      setAddInternalRole("member");
      toast.success("Team member added to project");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.projectMembers.update(orgId, projectId, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members"] });
      toast.success("Member role updated");
    },
  });

  // Sync local role state when server data arrives (additive — preserves in-flight changes)
  useEffect(() => {
    if (membersResponse?.data) {
      setLocalRoles((prev) => {
        const next = { ...prev };
        for (const m of membersResponse.data) {
          if (!(m.user_id in next)) next[m.user_id] = m.role;
        }
        return next;
      });
    }
  }, [membersResponse?.data]);

  // Keep add-role selects in sync with available role options
  useEffect(() => {
    if (projectRoles && projectRoles.length > 0) {
      const validSlugs = (projectRoles as Role[]).map((r) => r.slug);
      if (!validSlugs.includes(addRole)) setAddRole(validSlugs[0]);
      if (!validSlugs.includes(addInternalRole))
        setAddInternalRole(validSlugs[0]);
    }
  }, [projectRoles, addRole, addInternalRole]);

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

  const internalMembers = members.filter((m) => m.source === "team");
  const externalMembers = members.filter((m) => m.source !== "team");

  // Group internal members by team
  const teamGroups = new Map<
    string,
    { teamName: string; members: ProjectMember[] }
  >();
  for (const m of internalMembers) {
    const key = m.source_team_id || "unknown";
    if (!teamGroups.has(key)) {
      teamGroups.set(key, {
        teamName: m.source_team_name || "Unknown Team",
        members: [],
      });
    }
    teamGroups.get(key)!.members.push(m);
  }

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableOrg = (orgMembers?.data || []).filter(
    (m) => !memberIds.has(m.user_id),
  );

  // For internal add: team members of the selected linked team who are not yet project members
  const availableTeamMembers =
    addInternalTeamId && selectedTeamMembers
      ? (selectedTeamMembers.data || []).filter(
          (tm) => !memberIds.has(tm.user_id),
        )
      : [];

  // For external add: org members NOT in any linked team AND not already project members
  const linkedTeamMemberIds = new Set<string>();
  for (const m of internalMembers) {
    linkedTeamMemberIds.add(m.user_id);
  }
  const availableExternal = availableOrg.filter(
    (m) => !linkedTeamMemberIds.has(m.user_id),
  );

  const roleOptions = (projectRoles || []).map((r: Role) => ({
    value: r.slug,
    label: r.name + (r.is_system ? "" : " (Custom)"),
  }));

  // Open remove dialog — fetch task count
  const openRemoveDialog = async (member: ProjectMember) => {
    setRemoveTarget(member);
    setRemoveReassignTo("");
    setRemoveTaskCount(null);
    try {
      const preview = await api.projectMembers.previewRemove(
        orgId,
        projectId,
        member.user_id,
      );
      setRemoveTaskCount(preview.task_count);
    } catch {
      setRemoveTaskCount(0);
    }
  };

  // Execute removal with optional reassignment
  const executeRemove = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      await api.projectMembers.remove(
        orgId,
        projectId,
        removeTarget.user_id,
        removeReassignTo || undefined,
      );
      qc.invalidateQueries({ queryKey: ["project-members"] });
      if (removeTarget.source === "team" && removeTarget.source_team_id) {
        qc.invalidateQueries({
          queryKey: ["team-members", orgId, removeTarget.source_team_id],
        });
      }
      setRemoveTarget(null);
    } catch (e) {
      console.error("Remove member failed", e);
    } finally {
      setRemoveLoading(false);
    }
  };

  // Members available for reassignment (everyone except the one being removed)
  const reassignCandidates = members.filter(
    (m) => m.user_id !== removeTarget?.user_id,
  );

  return (
    <div className="space-y-4">
      {/* Search bar + filter button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search members..."
            className="input input-bordered input-sm w-full pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className={`btn btn-sm ${showFilter ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setShowFilter(!showFilter)}
        >
          <Filter className="w-4 h-4" />
          {filterRole && (
            <span className="badge badge-xs badge-primary ml-1">1</span>
          )}
        </button>
      </div>

      {showFilter && (
        <div className="mb-4 p-3 bg-base-200 rounded-lg flex items-center gap-3">
          <span className="text-sm font-medium">Role:</span>
          <select
            className="select select-bordered select-sm"
            value={filterRole}
            onChange={(e) => {
              setFilterRole(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All roles</option>
            {(projectRoles || []).map((r: Role) => (
              <option key={r.slug} value={r.slug}>
                {r.name}
              </option>
            ))}
          </select>
          {filterRole && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => {
                setFilterRole("");
                setPage(0);
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div role="tablist" className="tabs tabs-bordered">
        <button
          role="tab"
          className={cn("tab", subTab === "internal" && "tab-active")}
          onClick={() => setSubTab("internal")}
        >
          <Users className="w-3.5 h-3.5 mr-1" /> Internal (
          {internalMembers.length})
        </button>
        <button
          role="tab"
          className={cn("tab", subTab === "external" && "tab-active")}
          onClick={() => setSubTab("external")}
        >
          <UserPlus className="w-3.5 h-3.5 mr-1" /> External (
          {externalMembers.length})
        </button>
      </div>

      {/* Loading state */}
      {membersLoading && (
        <div className="flex justify-center py-4">
          <div className="loading loading-spinner" />
        </div>
      )}

      {/* ── Removal confirmation dialog ── */}
      {removeTarget && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Remove Member</h3>
            <p className="py-2 text-sm">
              Remove{" "}
              <strong>
                {removeTarget.display_name ||
                  removeTarget.email ||
                  removeTarget.user_id.slice(0, 12)}
              </strong>{" "}
              from this project?
            </p>
            {removeTaskCount === null ? (
              <div className="flex items-center gap-2 py-2">
                <span className="loading loading-spinner loading-sm" /> Checking
                assigned tasks…
              </div>
            ) : removeTaskCount > 0 ? (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 my-2">
                <p className="text-sm font-medium text-warning">
                  This member is assigned to {removeTaskCount} task
                  {removeTaskCount > 1 ? "s" : ""}.
                </p>
                <p className="text-xs text-base-content/60 mt-1">
                  Choose a member to reassign their tasks, or skip to unassign
                  them from all tasks.
                </p>
                <select
                  className="select select-bordered select-sm w-full mt-2"
                  value={removeReassignTo}
                  onChange={(e) => setRemoveReassignTo(e.target.value)}
                >
                  <option value="">Skip — unassign all tasks</option>
                  {reassignCandidates.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email || m.user_id.slice(0, 12)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-base-content/60 py-1">
                This member has no assigned tasks.
              </p>
            )}
            <div className="modal-action">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setRemoveTarget(null)}
                disabled={removeLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-error btn-sm"
                onClick={executeRemove}
                disabled={removeLoading || removeTaskCount === null}
              >
                {removeLoading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Remove
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => !removeLoading && setRemoveTarget(null)}
          />
        </div>
      )}

      {/* Internal tab — members added from linked teams */}
      {subTab === "internal" && !membersLoading && (
        <>
          {/* Add Internal Member form */}
          <Card>
            <h3 className="font-semibold mb-1">Add Internal Member</h3>
            <p className="text-xs text-base-content/50 mb-3">
              Select a linked team and pick a member to add to this project.
            </p>
            <form
              className="flex gap-2 items-end flex-wrap"
              onSubmit={(e) => {
                e.preventDefault();
                if (addInternalUserId && addInternalTeamId)
                  addInternalMutation.mutate();
              }}
            >
              <div className="flex-1 min-w-[140px]">
                <label className="label">
                  <span className="label-text text-xs">Team</span>
                </label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={addInternalTeamId}
                  onChange={(e) => {
                    setAddInternalTeamId(e.target.value);
                    setAddInternalUserId("");
                  }}
                >
                  <option value="">Select team…</option>
                  {(linkedTeams || []).map((pt: ProjectTeam) => (
                    <option key={pt.team_id} value={pt.team_id}>
                      {pt.team_name || pt.team_id.slice(0, 12)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="label">
                  <span className="label-text text-xs">Member</span>
                </label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={addInternalUserId}
                  onChange={(e) => setAddInternalUserId(e.target.value)}
                  disabled={!addInternalTeamId}
                >
                  <option value="">Select member…</option>
                  {availableTeamMembers.map((tm) => (
                    <option key={tm.user_id} value={tm.user_id}>
                      {tm.display_name || tm.email || tm.user_id.slice(0, 16)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  <span className="label-text text-xs">Role</span>
                </label>
                <select
                  className="select select-bordered select-sm"
                  value={addInternalRole}
                  onChange={(e) => setAddInternalRole(e.target.value)}
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
                loading={addInternalMutation.isPending}
                disabled={!addInternalUserId || !addInternalTeamId}
              >
                <UserPlus className="w-4 h-4" /> Add
              </Button>
            </form>
          </Card>

          {internalMembers.length === 0 ? (
            <Card>
              <p className="text-center py-6 text-base-content/50">
                No internal members yet. Add members from linked teams above.
              </p>
            </Card>
          ) : (
            Array.from(teamGroups.entries()).map(([teamId, group]) => (
              <Card key={teamId}>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5" /> {group.teamName}
                </h4>
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.members.map((m) => (
                        <tr key={m.user_id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <Avatar
                                name={
                                  m.display_name ||
                                  m.email ||
                                  m.user_id.slice(0, 4)
                                }
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
                            <select
                              className="select select-ghost select-xs capitalize"
                              value={localRoles[m.user_id] ?? m.role}
                              onChange={(e) =>
                                handleRoleChange(m.user_id, e.target.value)
                              }
                              disabled={roleOptions.length === 0}
                            >
                              {roleOptions.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="text-sm text-base-content/60">
                            {formatDate(m.joined_at)}
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => openRemoveDialog(m)}
                              title="Remove from project"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </>
      )}

      {/* External tab — directly-added members with add/remove/role */}
      {subTab === "external" && !membersLoading && (
        <>
          <Card>
            <h3 className="font-semibold mb-1">Add External Member</h3>
            <p className="text-xs text-base-content/50 mb-3">
              Add an organisation member who is not in any linked team directly
              to this project.
            </p>
            <form
              className="flex gap-2 items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (addUserId) addMutation.mutate();
              }}
            >
              <div className="flex-1">
                <label className="label">
                  <span className="label-text text-xs">Select Member</span>
                </label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                >
                  <option value="">Select member…</option>
                  {availableExternal.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email || m.user_id.slice(0, 16)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  <span className="label-text text-xs">Role</span>
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

          <Card>
            {externalMembers.length === 0 ? (
              <p className="text-center py-6 text-base-content/50">
                No external members yet. Add members above.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {externalMembers.map((m) => (
                      <tr key={m.user_id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={
                                m.display_name ||
                                m.email ||
                                m.user_id.slice(0, 4)
                              }
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
                          <select
                            className="select select-ghost select-xs capitalize"
                            value={localRoles[m.user_id] ?? m.role}
                            onChange={(e) =>
                              handleRoleChange(m.user_id, e.target.value)
                            }
                            disabled={roleOptions.length === 0}
                          >
                            {roleOptions.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="text-sm text-base-content/60">
                          {formatDate(m.joined_at)}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() => openRemoveDialog(m)}
                            title="Remove member"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
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

      {/* Pagination controls */}
      {membersResponse && membersResponse.total > limit && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-base-200">
          <span className="text-sm text-base-content/60">
            Showing {membersResponse.offset + 1}–
            {Math.min(membersResponse.offset + limit, membersResponse.total)} of{" "}
            {membersResponse.total}
          </span>
          <div className="join">
            <button
              className="join-item btn btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              «
            </button>
            <button className="join-item btn btn-sm">
              Page {page + 1} of {Math.ceil(membersResponse.total / limit)}
            </button>
            <button
              className="join-item btn btn-sm"
              disabled={(page + 1) * limit >= membersResponse.total}
              onClick={() => setPage((p) => p + 1)}
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Project Teams Section ─── */

function ProjectTeamsSection({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const [showLink, setShowLink] = useState(false);
  const [unlinkTeamId, setUnlinkTeamId] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");

  // Search and pagination for the link-team dialog
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 10;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: linkedTeams, isLoading } = useQuery({
    queryKey: ["project-teams", orgId, projectId],
    queryFn: () => api.projectTeams.list(orgId, projectId),
    enabled: !!orgId,
  });

  // Paginated search for available teams (only when link dialog is open)
  const { data: allTeams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", orgId, debouncedSearch, page],
    queryFn: () =>
      api.teams.list(orgId, {
        search: debouncedSearch || undefined,
        limit,
        offset: page * limit,
      }),
    enabled: !!orgId && showLink,
  });

  const { data: unlinkPreview, isLoading: previewLoading } = useQuery({
    queryKey: ["unlink-preview", orgId, projectId, unlinkTeamId],
    queryFn: () =>
      api.projectTeams.unlinkPreview(orgId, projectId, unlinkTeamId!),
    enabled: !!unlinkTeamId,
  });

  // Fetch project members for the reassign dropdown
  const { data: projectMembers } = useQuery({
    queryKey: ["project-members", orgId, projectId],
    queryFn: () => api.projectMembers.list(orgId, projectId),
    enabled: !!unlinkTeamId,
  });

  const linkMutation = useMutation({
    mutationFn: (teamIds: string[]) =>
      api.projectTeams.link(orgId, projectId, teamIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-teams", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["project-members"] });
      qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
      setShowLink(false);
      setSearch("");
      setPage(0);
      toast.success("Team linked to project");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: ({
      teamId,
      reassignTo,
    }: {
      teamId: string;
      reassignTo?: string;
    }) => api.projectTeams.unlink(orgId, projectId, teamId, reassignTo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-teams", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["project-members"] });
      qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
      setUnlinkTeamId(null);
      setReassignTo("");
      toast.success("Team unlinked from project");
    },
  });

  const linkedIds = new Set(
    (linkedTeams || []).map((t: ProjectTeam) => t.team_id),
  );
  const availableTeams = (allTeams?.data || []).filter(
    (t: Team) => !linkedIds.has(t.id),
  );

  // Members available for reassignment (exclude affected members from the team being unlinked)
  const affectedUserIds = new Set(
    (unlinkPreview?.affected_members || []).map((m) => m.user_id),
  );
  const reassignCandidates = (projectMembers?.data || []).filter(
    (m) => !affectedUserIds.has(m.user_id),
  );

  const handleUnlinkClick = (teamId: string) => {
    setUnlinkTeamId(teamId);
    setReassignTo("");
  };

  const handleConfirmUnlink = () => {
    if (!unlinkTeamId) return;
    unlinkMutation.mutate({
      teamId: unlinkTeamId,
      reassignTo: reassignTo || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Linked Teams</h3>
            <p className="text-sm text-base-content/60">
              Teams linked to this project. Team members inherit project roles
              based on the role mapping.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setShowLink(!showLink);
              setSearch("");
              setPage(0);
            }}
            variant={showLink ? "secondary" : "primary"}
          >
            <Link2 className="w-4 h-4 mr-1" />{" "}
            {showLink ? "Cancel" : "Link Team"}
          </Button>
        </div>

        {showLink && (
          <div className="mb-4 p-3 bg-base-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder="Search teams..."
                className="input input-bordered input-sm flex-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {teamsLoading ? (
              <div className="flex justify-center py-2">
                <div className="loading loading-spinner loading-sm" />
              </div>
            ) : availableTeams.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availableTeams.map((team: Team) => (
                  <button
                    key={team.id}
                    className="btn btn-outline btn-sm"
                    onClick={() => linkMutation.mutate([team.id])}
                    disabled={linkMutation.isPending}
                  >
                    {linkMutation.isPending ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <Link2 className="w-3 h-3 mr-1" />
                    )}
                    {team.name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm text-base-content/50">
                {debouncedSearch
                  ? "No teams match your search."
                  : "All teams are already linked to this project."}
              </span>
            )}
            {/* Pagination controls for link dialog */}
            {allTeams && allTeams.total > limit && (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-base-content/60">
                  {allTeams.total} teams total
                </span>
                <div className="join">
                  <button
                    className="join-item btn btn-xs"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    «
                  </button>
                  <button className="join-item btn btn-xs">
                    Page {page + 1}
                  </button>
                  <button
                    className="join-item btn btn-xs"
                    disabled={(page + 1) * limit >= allTeams.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="loading loading-spinner" />
          </div>
        ) : !linkedTeams || linkedTeams.length === 0 ? (
          <p className="text-center py-6 text-base-content/50">
            No teams linked yet
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {linkedTeams.map((pt: ProjectTeam) => (
              <div key={pt.team_id} className="badge badge-lg gap-1 pr-1">
                <Users className="w-3 h-3" />
                {pt.team_name || pt.team_id.slice(0, 8)}
                <button
                  className="btn btn-ghost btn-xs btn-circle"
                  onClick={() => handleUnlinkClick(pt.team_id)}
                  disabled={
                    unlinkMutation.isPending || (linkedTeams?.length || 0) <= 1
                  }
                  title={
                    (linkedTeams?.length || 0) <= 1
                      ? "Cannot unlink the last team"
                      : "Unlink team"
                  }
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Unlink confirmation dialog with reassignment */}
      {unlinkTeamId && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Unlink Team</h3>

            {previewLoading ? (
              <div className="flex justify-center py-6">
                <div className="loading loading-spinner" />
              </div>
            ) : unlinkPreview && unlinkPreview.affected_members.length > 0 ? (
              <>
                <p className="text-sm text-base-content/70 mb-3">
                  Unlinking <strong>{unlinkPreview.team_name}</strong> will
                  remove the following members from this project.
                  {unlinkPreview.total_tasks > 0 && (
                    <>
                      {" "}
                      They have <strong>
                        {unlinkPreview.total_tasks}
                      </strong>{" "}
                      task{unlinkPreview.total_tasks !== 1 ? "s" : ""} assigned.
                    </>
                  )}
                </p>

                {/* Affected members table */}
                <div className="overflow-x-auto mb-4 max-h-48 overflow-y-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th className="text-right">Tasks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unlinkPreview.affected_members.map((m) => (
                        <tr key={m.user_id}>
                          <td>
                            <span className="text-sm">
                              {m.display_name ||
                                m.email ||
                                m.user_id.slice(0, 12)}
                            </span>
                          </td>
                          <td className="text-right">
                            <span
                              className={cn(
                                "badge badge-sm",
                                m.task_count > 0
                                  ? "badge-warning"
                                  : "badge-ghost",
                              )}
                            >
                              {m.task_count}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Reassignment option */}
                {unlinkPreview.total_tasks > 0 && (
                  <div className="form-control mb-4">
                    <label className="label">
                      <span className="label-text text-sm font-medium">
                        Reassign tasks to:
                      </span>
                    </label>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                    >
                      <option value="">Skip — unassign all tasks</option>
                      {reassignCandidates.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name || m.email || m.user_id.slice(0, 12)}
                        </option>
                      ))}
                    </select>
                    <label className="label">
                      <span className="label-text-alt text-base-content/50">
                        {reassignTo
                          ? "All tasks from removed members will be reassigned to this member."
                          : "All tasks from removed members will be unassigned."}
                      </span>
                    </label>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-base-content/70 mb-4">
                {unlinkPreview
                  ? `No members will be affected. Unlink "${unlinkPreview.team_name}"?`
                  : "Are you sure you want to unlink this team?"}
              </p>
            )}

            <div className="modal-action">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setUnlinkTeamId(null);
                  setReassignTo("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-error btn-sm"
                onClick={handleConfirmUnlink}
                disabled={unlinkMutation.isPending || previewLoading}
              >
                {unlinkMutation.isPending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Unlink className="w-3.5 h-3.5 mr-1" />
                )}
                Unlink
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setUnlinkTeamId(null);
                setReassignTo("");
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}
    </div>
  );
}
