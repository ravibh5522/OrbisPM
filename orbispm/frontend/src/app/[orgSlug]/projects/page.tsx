"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { FolderKanban, Plus, Trash2, LayoutGrid, Table2, Users, Calendar, Activity } from "lucide-react";
import { formatDate, statusLabel, cn } from "@/lib/utils";
import type { Project, Team } from "@/types/domain";
import { PermissionGate } from "@/components/permission-gate";

interface ProjectForm {
  name: string;
  description: string;
  team_id: string;
  team_ids: string[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", currentOrg?.id],
    queryFn: () => api.projects.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: teams } = useQuery({
    queryKey: ["teams", currentOrg?.id],
    queryFn: () => api.teams.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { register, handleSubmit, reset, formState: { errors: formErrors }, watch, setValue } = useForm<ProjectForm>({
    defaultValues: { team_ids: [] },
  });

  const selectedTeamIds = watch("team_ids") || [];

  // Filter projects by team
  const filteredProjects = useMemo(() => {
    const allProjects = projects?.data || [];
    if (teamFilter === "all") return allProjects;
    // Filter by team - would need team linkage info on project
    return allProjects.filter((p: Project) => {
      // Check if team_id matches or if project has team_ids array
      return p.team_id === teamFilter || (p.team_ids && p.team_ids.includes(teamFilter));
    });
  }, [projects?.data, teamFilter]);

  // Group projects by team for stats
  const teamStats = useMemo(() => {
    const stats: Record<string, number> = { all: (projects?.data || []).length };
    const teamList = teams?.data || [];
    teamList.forEach((t: Team) => {
      stats[t.id] = (projects?.data || []).filter((p: Project) => 
        p.team_id === t.id || (p.team_ids && p.team_ids.includes(t.id))
      ).length;
    });
    return stats;
  }, [projects?.data, teams?.data]);

  const createMutation = useMutation({
    mutationFn: (data: ProjectForm) => {
      const teamIds = data.team_ids?.length ? data.team_ids : data.team_id ? [data.team_id] : [];
      return api.projects.create(currentOrg!.id, {
        name: data.name,
        description: data.description,
        team_id: teamIds[0] || "",
        team_ids: teamIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setShowCreate(false);
      reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create project"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <LoadingPage />;

  const teamOptions = (teams?.data || []).map((t: Team) => ({ value: t.id, label: t.name }));
  const teamList = teams?.data || [];

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <PageHeader
        title="Projects"
        description="Manage your organization's projects"
        actions={
          <PermissionGate resource="projects" action="create">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> New Project
            </Button>
          </PermissionGate>
        }
      />

      {/* Filters and View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Team:</span>
          <button
            className={cn(
              "btn btn-sm gap-1",
              teamFilter === "all" ? "btn-primary" : "btn-outline"
            )}
            onClick={() => setTeamFilter("all")}
          >
            All ({teamStats.all || 0})
          </button>
          {teamList.map((t: Team) => (
            <button
              key={t.id}
              className={cn(
                "btn btn-sm gap-1",
                teamFilter === t.id ? "btn-primary" : "btn-outline"
              )}
              onClick={() => setTeamFilter(t.id)}
            >
              <Users className="w-3 h-3" />
              {t.name} ({teamStats[t.id] || 0})
            </button>
          ))}
        </div>
        <div className="join">
          <button
            className={cn("btn btn-sm join-item", viewMode === "grid" && "btn-active")}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            className={cn("btn btn-sm join-item", viewMode === "table" && "btn-active")}
            onClick={() => setViewMode("table")}
          >
            <Table2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {(!filteredProjects || filteredProjects.length === 0) ? (
        <EmptyState
          icon={<FolderKanban className="w-16 h-16" />}
          title={teamFilter === "all" ? "No projects yet" : "No projects for this team"}
          description={teamFilter === "all" ? "Create your first project to get started" : "Create a project or change the team filter"}
          action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Project</Button>}
        />
      ) : viewMode === "table" ? (
        /* Table View */
        <Card className="flex-1">
          <div className="w-full">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th><Users className="w-3.5 h-3.5 inline mr-1" />Teams</th>
                  <th><Calendar className="w-3.5 h-3.5 inline mr-1" />Created</th>
                  <th><Activity className="w-3.5 h-3.5 inline mr-1" />Updated</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project: Project) => {
                  // Find team names
                  const projectTeams = teamList.filter((t: Team) => 
                    t.id === project.team_id || (project.team_ids && project.team_ids.includes(t.id))
                  );
                  return (
                    <tr
                      key={project.id}
                      className="hover cursor-pointer"
                      onClick={() => router.push(`/${currentOrg!.slug}/projects/${project.id}`)}
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                          <span className="font-medium">{project.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm text-base-content/60 line-clamp-1 max-w-xs">
                          {project.description || "—"}
                        </span>
                      </td>
                      <td>
                        <span className={cn(
                          "badge badge-sm",
                          project.status === "active" ? "badge-success" : 
                          project.status === "archived" ? "badge-ghost" : "badge-info"
                        )}>
                          {statusLabel(project.status)}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {projectTeams.length > 0 ? projectTeams.map((t: Team) => (
                            <span key={t.id} className="badge badge-sm badge-outline gap-1">
                              <Users className="w-2.5 h-2.5" />
                              {t.name}
                            </span>
                          )) : <span className="text-base-content/40 text-sm">—</span>}
                        </div>
                      </td>
                      <td className="text-sm text-base-content/60">
                        {formatDate(project.created_at)}
                      </td>
                      <td className="text-sm text-base-content/60">
                        {project.updated_at ? formatDate(project.updated_at) : "—"}
                      </td>
                      <td>
                        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          <PermissionGate resource="projects" action="delete">
                            <button
                              className="btn btn-ghost btn-xs btn-square text-error"
                              onClick={() => setDeleteTarget(project)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project: Project) => (
            <Card key={project.id} compact>
              <div
                className="cursor-pointer"
                onClick={() => router.push(`/${currentOrg!.slug}/projects/${project.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-base-content/60 mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <div className={`badge badge-sm ${project.status === "active" ? "badge-success" : project.status === "archived" ? "badge-ghost" : "badge-info"}`}>
                    {statusLabel(project.status)}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 text-sm text-base-content/50">
                  <span>Created {formatDate(project.created_at)}</span>
                  <div className="flex gap-1">
                    <PermissionGate resource="projects" action="delete">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </PermissionGate>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setError(""); }} title="New Project">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="My Project"
            {...register("name", { required: "Name is required" })}
            error={formErrors.name?.message}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            {...register("description")}
          />
          <Select
            label="Team"
            placeholder="Select a team"
            options={teamOptions}
            {...register("team_id", { required: "Team is required" })}
            error={formErrors.team_id?.message}
          />
          {/* Multi-team selection */}
          {teamOptions.length > 1 && (
            <div>
              <label className="label"><span className="label-text font-medium">Additional Teams (optional)</span></label>
              <div className="grid grid-cols-2 gap-2">
                {teamOptions.map((t: { value: string; label: string }) => (
                  <label key={t.value} className="flex items-center gap-2 p-2 rounded border border-base-300 cursor-pointer hover:bg-base-200">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={selectedTeamIds.includes(t.value)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...selectedTeamIds, t.value]
                          : selectedTeamIds.filter((id: string) => id !== t.value);
                        setValue("team_ids", ids);
                      }}
                    />
                    <span className="text-sm">{t.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-base-content/50 mt-1">Check teams to link this project to multiple teams</p>
            </div>
          )}
          <div className="modal-action">
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
