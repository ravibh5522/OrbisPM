"use client";

import { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { PageHeader, Card, LoadingPage, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { TaskColumns } from "@/components/tasks/task-columns";
import { TaskListView } from "@/components/tasks/task-list-view";
import { CSVImportDialog } from "@/components/tasks/csv-import-dialog";
import { ProjectDashboard } from "@/components/projects/project-dashboard";
import {
  ArrowLeft,
  Settings,
  Users,
  ListTodo,
  Columns3,
  List,
  Trash2,
  UserPlus,
  Upload,
  Download,
  CalendarDays,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ProjectMember } from "@/types/domain";

export default function ProjectDetailPage({ params }: { params: Promise<{ orgSlug: string; projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const [activeTab, setActiveTab] = useState<"tasks" | "members" | "dashboard">("tasks");
  const [taskView, setTaskView] = useState<"columns" | "list">("columns");
  const [importOpen, setImportOpen] = useState(false);

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["project", currentOrg?.id, projectId],
    queryFn: () => api.projects.get(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", currentOrg?.id, projectId],
    queryFn: () => api.tasks.list(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  const { data: members } = useQuery({
    queryKey: ["project-members", currentOrg?.id, projectId],
    queryFn: () => api.projectMembers.list(currentOrg!.id, projectId),
    enabled: !!currentOrg,
  });

  if (projLoading || tasksLoading) return <LoadingPage />;
  if (!project) return <div className="text-center py-12">Project not found</div>;

  return (
    <div>
      <div className="mb-4">
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => router.push(`/${currentOrg!.slug}/projects`)}>
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </button>
      </div>

      <PageHeader
        title={project.name}
        description={project.description || ""}
      />

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-bordered mb-4">
        <button role="tab" className={`tab ${activeTab === "dashboard" ? "tab-active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          <Settings className="w-4 h-4 mr-1" /> Dashboard
        </button>
        <button role="tab" className={`tab ${activeTab === "tasks" ? "tab-active" : ""}`} onClick={() => setActiveTab("tasks")}>
          <ListTodo className="w-4 h-4 mr-1" /> Tasks
        </button>
        <button role="tab" className={`tab ${activeTab === "members" ? "tab-active" : ""}`} onClick={() => setActiveTab("members")}>
          <Users className="w-4 h-4 mr-1" /> Members
        </button>
      </div>

      {/* Dashboard tab */}
      {activeTab === "dashboard" && (
        <ProjectDashboard orgId={currentOrg!.id} projectId={projectId} />
      )}

      {/* Tasks tab — columns or list view */}
      {activeTab === "tasks" && (
        <div>
          {/* View toggle + Import/Export */}
          <div className="flex items-center justify-end mb-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1" /> Import CSV
            </Button>
            <div className="dropdown dropdown-end">
              <div tabIndex={0} role="button" className="btn btn-outline btn-sm">
                <Download className="w-4 h-4 mr-1" /> Export
              </div>
              <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-44">
                <li><a onClick={() => api.tasks.export(currentOrg!.id, projectId)}><Download className="w-4 h-4" /> CSV</a></li>
                <li><a onClick={() => api.tasks.exportCalendar(currentOrg!.id, projectId)}><CalendarDays className="w-4 h-4" /> iCal (.ics)</a></li>
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
                className={`join-item btn btn-sm ${taskView === "list" ? "btn-active" : ""}`}
                onClick={() => setTaskView("list")}
                title="Sortable List"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          <CSVImportDialog
            orgId={currentOrg!.id}
            projectId={projectId}
            open={importOpen}
            onClose={() => setImportOpen(false)}
          />

          {taskView === "columns" ? (
            <TaskColumns
              orgId={currentOrg!.id}
              orgSlug={currentOrg!.slug}
              projectId={projectId}
              members={members?.data || []}
            />
          ) : (
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
        <ProjectMembersSection orgId={currentOrg!.id} projectId={projectId} members={members?.data || []} />
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

  const addMutation = useMutation({
    mutationFn: () => api.projectMembers.add(orgId, projectId, { user_id: addUserId, role: addRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] });
      setAddUserId("");
      setAddRole("member");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.projectMembers.remove(orgId, projectId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.projectMembers.update(orgId, projectId, userId, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-members", orgId, projectId] }),
  });

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableOrg = (orgMembers?.data || []).filter((m) => !memberIds.has(m.user_id));

  return (
    <div className="space-y-4">
      {/* Add member row */}
      <Card>
        <h3 className="font-semibold mb-3">Add Project Member</h3>
        <form
          className="flex gap-2 items-end"
          onSubmit={(e) => { e.preventDefault(); if (addUserId) addMutation.mutate(); }}
        >
          <div className="flex-1">
            <label className="label"><span className="label-text text-xs">Org Member</span></label>
            <select
              className="select select-bordered select-sm w-full"
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
            >
              <option value="">Select member…</option>
              {availableOrg.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.display_name || m.email || m.user_id.slice(0, 16)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label"><span className="label-text text-xs">Role</span></label>
            <select className="select select-bordered select-sm" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
              <option value="lead">Lead</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <Button type="submit" size="sm" loading={addMutation.isPending} disabled={!addUserId}>
            <UserPlus className="w-4 h-4" /> Add
          </Button>
        </form>
      </Card>

      {/* Members table */}
      <Card>
        {members.length === 0 ? (
          <p className="text-center py-6 text-base-content/50">No project members yet</p>
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
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={m.display_name || m.email || m.user_id.slice(0, 4)} src={m.avatar_url} size="sm" />
                        <div>
                          <span className="text-sm font-medium">{m.display_name || m.email || m.user_id.slice(0, 12)}</span>
                          {m.email && m.display_name && <span className="block text-xs text-base-content/50">{m.email}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className="select select-ghost select-xs"
                        value={m.role}
                        onChange={(e) => updateRoleMutation.mutate({ userId: m.user_id, role: e.target.value })}
                      >
                        <option value="lead">Lead</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="text-sm text-base-content/60">{formatDate(m.joined_at)}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => removeMutation.mutate(m.user_id)}
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
