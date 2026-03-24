"use client";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
} from "@/components/ui/shared";
import { api, ApiError } from "@/lib/api";
import { cn, formatDate, statusLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Project, Team } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Calendar,
  ChevronDown,
  FolderKanban,
  LayoutGrid,
  Plus,
  Search,
  SlidersHorizontal,
  Table2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface ProjectForm {
  name: string;
  description: string;
  team_id: string;
  team_ids: string[];
}

const PAGE_SIZE = 20;

export default function ProjectsPage() {
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");

  // Server-side pagination, search, filter, sort state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: projectsResponse, isLoading } = useQuery({
    queryKey: [
      "projects",
      currentOrg?.id,
      debouncedSearch,
      page,
      sortBy,
      sortOrder,
      statusFilter,
      teamFilter,
    ],
    queryFn: () =>
      api.projects.list(currentOrg!.id, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        team_id: teamFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    enabled: !!currentOrg,
  });

  // Fetch teams for the filter dropdown and create form (smaller request)
  const { data: teamsResponse } = useQuery({
    queryKey: ["teams-all", currentOrg?.id],
    queryFn: () => api.teams.list(currentOrg!.id, { limit: 500 }),
    enabled: !!currentOrg,
    staleTime: 5 * 60_000,
  });

  const projects = projectsResponse?.data || [];
  const total = projectsResponse?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const teamList = teamsResponse?.data || [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors },
    watch,
    setValue,
  } = useForm<ProjectForm>({
    defaultValues: { team_ids: [] },
  });
  const selectedTeamIds = watch("team_ids") || [];

  const createMutation = useMutation({
    mutationFn: (data: ProjectForm) => {
      const teamIds = data.team_ids?.length
        ? data.team_ids
        : data.team_id
          ? [data.team_id]
          : [];
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
      toast.success("Project created");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to create project"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDeleteTarget(null);
      toast.success("Project deleted");
    },
  });

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(0);
  };

  const activeFilterCount = [statusFilter, teamFilter].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter("");
    setTeamFilter("");
    setSearch("");
    setPage(0);
  };

  const SortIcon = ({ col }: { col: string }) => (
    <ChevronDown
      className={cn(
        "w-3 h-3 inline ml-0.5 transition-transform",
        sortBy === col ? "opacity-100" : "opacity-30",
        sortBy === col && sortOrder === "asc" && "rotate-180",
      )}
    />
  );

  const teamOptions = teamList.map((t: Team) => ({
    value: t.id,
    label: t.name,
  }));

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

      {/* Search bar + Filter toggle + View toggle */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search projects..."
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

        <button
          className={cn(
            "btn btn-sm gap-1",
            showFilters ? "btn-primary" : "btn-ghost",
          )}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-xs badge-secondary">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="flex-1" />

        <span className="text-sm text-base-content/50">
          {total} project{total !== 1 ? "s" : ""}
        </span>

        <div className="join">
          <button
            className={cn(
              "btn btn-sm join-item",
              viewMode === "table" && "btn-active",
            )}
            onClick={() => setViewMode("table")}
          >
            <Table2 className="w-4 h-4" />
          </button>
          <button
            className={cn(
              "btn btn-sm join-item",
              viewMode === "grid" && "btn-active",
            )}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">
              Status:
            </span>
            <select
              className="select select-bordered select-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">Team:</span>
            <select
              className="select select-bordered select-sm max-w-[200px]"
              value={teamFilter}
              onChange={(e) => {
                setTeamFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All teams</option>
              {teamList.map((t: Team) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {activeFilterCount > 0 && (
            <button className="btn btn-ghost btn-xs" onClick={clearFilters}>
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-base-200 rounded-lg border border-base-200"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="w-16 h-16" />}
          title={
            debouncedSearch || statusFilter || teamFilter
              ? "No matching projects"
              : "No projects yet"
          }
          description={
            debouncedSearch || statusFilter || teamFilter
              ? "Try adjusting your search or filters"
              : "Create your first project to get started"
          }
          action={
            debouncedSearch || statusFilter || teamFilter ? (
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> Create Project
              </Button>
            )
          }
        />
      ) : viewMode === "table" ? (
        <Card className="flex-1">
          <div className="w-full overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                  >
                    Project Name <SortIcon col="name" />
                  </th>
                  <th>Description</th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("status")}
                  >
                    Status <SortIcon col="status" />
                  </th>
                  <th>
                    <Users className="w-3.5 h-3.5 inline mr-1" />
                    Teams
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("created_at")}
                  >
                    <Calendar className="w-3.5 h-3.5 inline mr-1" />
                    Created <SortIcon col="created_at" />
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("updated_at")}
                  >
                    <Activity className="w-3.5 h-3.5 inline mr-1" />
                    Updated <SortIcon col="updated_at" />
                  </th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project: Project) => {
                  const projectTeams = teamList.filter(
                    (t: Team) =>
                      t.id === project.team_id ||
                      (project.team_ids && project.team_ids.includes(t.id)),
                  );
                  return (
                    <tr
                      key={project.id}
                      className="hover cursor-pointer"
                      onClick={() =>
                        router.push(
                          `/${currentOrg!.slug}/projects/${project.id}`,
                        )
                      }
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                          <span className="font-medium">{project.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm text-base-content/60 line-clamp-1 max-w-xs">
                          {project.description || "\u2014"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={cn(
                            "badge badge-sm",
                            project.status === "active"
                              ? "badge-success"
                              : project.status === "archived"
                                ? "badge-ghost"
                                : "badge-info",
                          )}
                        >
                          {statusLabel(project.status)}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {projectTeams.length > 0 ? (
                            projectTeams.map((t: Team) => (
                              <span
                                key={t.id}
                                className="badge badge-sm badge-outline gap-1"
                              >
                                <Users className="w-2.5 h-2.5" />
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-base-content/40 text-sm">
                              {"\u2014"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-sm text-base-content/60">
                        {formatDate(project.created_at)}
                      </td>
                      <td className="text-sm text-base-content/60">
                        {project.updated_at
                          ? formatDate(project.updated_at)
                          : "\u2014"}
                      </td>
                      <td>
                        <div
                          className="flex gap-1 justify-end"
                          onClick={(e) => e.stopPropagation()}
                        >
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project: Project) => (
            <Card key={project.id} compact>
              <div
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/${currentOrg!.slug}/projects/${project.id}`)
                }
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-base-content/60 mt-1 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div
                    className={`badge badge-sm ${project.status === "active" ? "badge-success" : project.status === "archived" ? "badge-ghost" : "badge-info"}`}
                  >
                    {statusLabel(project.status)}
                  </div>
                </div>
                {project.member_count || project.task_count ? (
                  <div className="flex gap-3 mt-2 text-xs text-base-content/50">
                    {project.member_count != null && (
                      <span>{project.member_count} members</span>
                    )}
                    {project.task_count != null && (
                      <span>{project.task_count} tasks</span>
                    )}
                  </div>
                ) : null}
                <div className="flex items-center justify-between mt-3 text-sm text-base-content/50">
                  <span>Created {formatDate(project.created_at)}</span>
                  <div
                    className="flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PermissionGate resource="projects" action="delete">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={() => setDeleteTarget(project)}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-base-200">
          <span className="text-sm text-base-content/60">
            Showing {page * PAGE_SIZE + 1}&ndash;
            {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="join">
            <button
              className="join-item btn btn-sm"
              disabled={page === 0}
              onClick={() => setPage(0)}
            >
              &laquo;
            </button>
            <button
              className="join-item btn btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              &lsaquo;
            </button>
            <button className="join-item btn btn-sm">
              Page {page + 1} of {totalPages}
            </button>
            <button
              className="join-item btn btn-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              &rsaquo;
            </button>
            <button
              className="join-item btn btn-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
            >
              &raquo;
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          reset();
          setError("");
        }}
        title="New Project"
      >
        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-4"
        >
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
          {teamOptions.length > 1 && (
            <div>
              <label className="label">
                <span className="label-text font-medium">
                  Additional Teams (optional)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {teamOptions.map((t: { value: string; label: string }) => (
                  <label
                    key={t.value}
                    className="flex items-center gap-2 p-2 rounded border border-base-300 cursor-pointer hover:bg-base-200"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={selectedTeamIds.includes(t.value)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...selectedTeamIds, t.value]
                          : selectedTeamIds.filter(
                              (id: string) => id !== t.value,
                            );
                        setValue("team_ids", ids);
                      }}
                    />
                    <span className="text-sm truncate">{t.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-base-content/50 mt-1">
                Check teams to link this project to multiple teams
              </p>
            </div>
          )}
          <div className="modal-action">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

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
