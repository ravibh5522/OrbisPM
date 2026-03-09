"use client";

import { ProjectDashboard } from "@/components/projects/project-dashboard";
import { ProjectSettings } from "@/components/projects/project-settings";
import { ProjectChangeRequests } from "@/components/tasks/change-requests";
import { CSVImportDialog } from "@/components/tasks/csv-import-dialog";
import { TaskColumns } from "@/components/tasks/task-columns";
import { TaskListView } from "@/components/tasks/task-list-view";
import { TaskTreeView } from "@/components/tasks/task-tree-view";
import { Button } from "@/components/ui/button";
import { Avatar, Card, LoadingPage } from "@/components/ui/shared";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectTaskStore } from "@/stores/project-task-store";
import { useUIStore } from "@/stores/ui-store";
import type { ProjectMember, ProjectTeam, Team } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Columns3,
  Download,
  GitFork,
  GitPullRequest,
  Link2,
  List,
  ListTodo,
  Settings,
  Trash2,
  Unlink,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

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
  const [activeTab, setActiveTab] = useState<
    "tasks" | "members" | "teams" | "reviews" | "dashboard" | "settings"
  >("tasks");
  const [taskView, setTaskView] = useState<"columns" | "list" | "tree">(
    "columns",
  );
  const [importOpen, setImportOpen] = useState(false);
  const { can } = usePermissions();
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);

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

  if (projLoading) return <LoadingPage />;
  if (!project)
    return <div className="text-center py-12">Project not found</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Single consolidated toolbar row */}
      <div className="flex items-center justify-between gap-2 py-1.5 border-b border-base-200 mb-2 flex-wrap">
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
          {can("projects", "manage_members") && (
            <button
              role="tab"
              className={`tab tab-sm ${activeTab === "members" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              <Users className="w-3.5 h-3.5 mr-1" /> Members
            </button>
          )}
          {can("projects", "manage_members") && (
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
          {can("settings", "update") && (
            <button
              role="tab"
              className={`tab tab-sm ${activeTab === "settings" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <Settings className="w-3.5 h-3.5 mr-1" /> Settings
            </button>
          )}
        </div>

        {/* Actions: Import/Export + View toggle (only visible when Tasks tab is active) */}
        {activeTab === "tasks" && (
          <div className="flex items-center gap-2 flex-shrink-0">
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
                className="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-44"
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

      {/* Tasks tab — columns or list view */}
      {activeTab === "tasks" && (
        <div className="flex-1 flex flex-col min-h-0">
          <CSVImportDialog
            orgId={currentOrg!.id}
            projectId={projectId}
            open={importOpen}
            onClose={() => setImportOpen(false)}
          />

          {taskView === "columns" && (
            <TaskColumns
              orgId={currentOrg!.id}
              orgSlug={currentOrg!.slug}
              projectId={projectId}
              members={members?.data || []}
              focusTaskId={focusTaskId}
            />
          )}
          {taskView === "tree" && (
            <TaskTreeView
              orgId={currentOrg!.id}
              orgSlug={currentOrg!.slug}
              projectId={projectId}
              members={members?.data || []}
              onOpenTask={handleOpenTask}
            />
          )}
          {taskView === "list" && (
            <TaskListView
              orgId={currentOrg!.id}
              orgSlug={currentOrg!.slug}
              projectId={projectId}
              members={members?.data || []}
            />
          )}
        </div>
      )}

      {/* Members tab */}
      {activeTab === "members" && (
        <ProjectMembersSection
          orgId={currentOrg!.id}
          projectId={projectId}
          members={members?.data || []}
        />
      )}

      {/* Teams tab */}
      {activeTab === "teams" && (
        <ProjectTeamsSection orgId={currentOrg!.id} projectId={projectId} />
      )}

      {/* Reviews tab */}
      {activeTab === "reviews" && (
        <ProjectChangeRequests
          orgId={currentOrg!.id}
          projectId={projectId}
          members={
            (members?.data ||
              []) as unknown as import("@/types/domain").OrgMember[]
          }
        />
      )}

      {/* Settings tab */}
      {activeTab === "settings" && (
        <ProjectSettings orgId={currentOrg!.id} project={project} />
      )}
    </div>
  );
}

/* ─── Project Members Section ─── */

function ProjectMembersSection({
  orgId,
  projectId,
  members,
}: {
  orgId: string;
  projectId: string;
  members: ProjectMember[];
}) {
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");

  const { data: orgMembers } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
  });

  const { data: projectRoles } = useQuery({
    queryKey: ["permissions-roles", orgId, "project"],
    queryFn: () => api.permissions.roles.list(orgId, "project"),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.projectMembers.add(orgId, projectId, {
        user_id: addUserId,
        role: addRole,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] });
      setAddUserId("");
      setAddRole("member");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.projectMembers.remove(orgId, projectId, userId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.projectMembers.update(orgId, projectId, userId, { role }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] }),
  });

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableOrg = (orgMembers?.data || []).filter(
    (m) => !memberIds.has(m.user_id),
  );
  const roleOptions =
    projectRoles && projectRoles.length > 0
      ? projectRoles.map((r) => ({ value: r.slug, label: r.name }))
      : [
          { value: "lead", label: "Lead" },
          { value: "member", label: "Member" },
          { value: "viewer", label: "Viewer" },
        ];

  return (
    <div className="space-y-4">
      {/* Add member row */}
      <Card>
        <h3 className="font-semibold mb-3">Add Project Member</h3>
        <form
          className="flex gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (addUserId) addMutation.mutate();
          }}
        >
          <div className="flex-1">
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

      {/* Members table */}
      <Card>
        {members.length === 0 ? (
          <p className="text-center py-6 text-base-content/50">
            No project members yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Source</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={
                            m.display_name || m.email || m.user_id.slice(0, 4)
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
                        value={m.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({
                            userId: m.user_id,
                            role: e.target.value,
                          })
                        }
                        disabled={m.source === "team"}
                      >
                        {roleOptions.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {m.source === "team" ? (
                        <span className="badge badge-outline badge-sm">
                          Team: {m.source_team_name || "—"}
                        </span>
                      ) : (
                        <span className="badge badge-primary badge-sm">
                          Direct
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-base-content/60">
                      {formatDate(m.joined_at)}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => removeMutation.mutate(m.user_id)}
                        disabled={m.source === "team"}
                        title={
                          m.source === "team"
                            ? "Inherited from team — unlink team to remove"
                            : "Remove member"
                        }
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

  const { data: linkedTeams, isLoading } = useQuery({
    queryKey: ["project-teams", orgId, projectId],
    queryFn: () => api.projectTeams.list(orgId, projectId),
    enabled: !!orgId,
  });

  const { data: allTeams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", orgId],
    queryFn: () => api.teams.list(orgId),
    enabled: !!orgId && showLink,
  });

  const linkMutation = useMutation({
    mutationFn: (teamIds: string[]) =>
      api.projectTeams.link(orgId, projectId, teamIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-teams", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] });
      setShowLink(false);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (teamId: string) =>
      api.projectTeams.unlink(orgId, projectId, teamId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-teams", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] });
    },
  });

  const linkedIds = new Set(
    (linkedTeams || []).map((t: ProjectTeam) => t.team_id),
  );
  const availableTeams = (allTeams?.data || []).filter(
    (t: Team) => !linkedIds.has(t.id),
  );

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
            onClick={() => setShowLink(!showLink)}
            variant={showLink ? "secondary" : "primary"}
          >
            <Link2 className="w-4 h-4 mr-1" />{" "}
            {showLink ? "Cancel" : "Link Team"}
          </Button>
        </div>

        {showLink && (
          <div className="mb-4 p-3 bg-base-200 rounded-lg">
            <p className="text-sm font-medium mb-2">Select teams to link:</p>
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
                All teams are already linked to this project.
              </span>
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
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Linked</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {linkedTeams.map((pt: ProjectTeam) => (
                  <tr key={pt.team_id}>
                    <td className="font-medium">
                      {pt.team_name || pt.team_id.slice(0, 12)}
                    </td>
                    <td className="text-sm text-base-content/60">
                      {pt.added_at
                        ? new Date(pt.added_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => unlinkMutation.mutate(pt.team_id)}
                        disabled={
                          unlinkMutation.isPending || linkedTeams.length <= 1
                        }
                        title={
                          linkedTeams.length <= 1
                            ? "Cannot unlink the last team"
                            : "Unlink team"
                        }
                      >
                        <Unlink className="w-3 h-3" />
                      </button>
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
