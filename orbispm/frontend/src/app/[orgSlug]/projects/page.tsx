"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { formatDate, statusLabel } from "@/lib/utils";
import type { Project, Team } from "@/types/domain";

interface ProjectForm {
  name: string;
  description: string;
  team_id: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [error, setError] = useState("");

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

  const { register, handleSubmit, reset, formState: { errors: formErrors } } = useForm<ProjectForm>();

  const createMutation = useMutation({
    mutationFn: (data: ProjectForm) => api.projects.create(currentOrg!.id, data),
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

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Manage your organization's projects"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Project
          </Button>
        }
      />

      {(!projects?.data || projects.data.length === 0) ? (
        <EmptyState
          icon={<FolderKanban className="w-16 h-16" />}
          title="No projects yet"
          description="Create your first project to get started"
          action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Project</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.data.map((project: Project) => (
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
                    <button
                      className="btn btn-ghost btn-xs btn-square"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
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
