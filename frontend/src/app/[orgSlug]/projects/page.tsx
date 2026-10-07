"use client";

import { PermissionGate } from "@/components/permission-gate";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
} from "@/components/ui/shared";
import { useOrgPolicies } from "@/hooks/use-policies";
import type { ListResponse } from "@/lib/api";
import { api, ApiError } from "@/lib/api";
import { STATUS_BADGE } from "@/lib/task-colors";
import { cn, formatDate, statusLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Project, TaskStatus, Team } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Calendar,
  ChevronDown,
  FolderKanban,
  LayoutGrid,
  Pencil,
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
  status?: string;
  team_id: string;
  team_ids: string[];
}

const PAGE_SIZE = 20;

export default function ProjectsPage() {
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const policies = useOrgPolicies();

  // Server-side pagination, search, filter, sort state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState("active");
  const [teamFilter, setTeamFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const updateSearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };

  const updateStatus = (v: string) => {
    setStatusFilter(v);
    setPage(0);
  };

  const updateTeam = (v: string) => {
    setTeamFilter(v);
    setPage(0);
  };

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
      policies.canViewAllProjects,
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
        ...policies.projectListParams(),
      }),
    enabled: !!currentOrg && !policies.isLoading,
  });

  // Fetch teams for the filter dropdown and create form (smaller request)
  const { data: teamsResponse } = useQuery({
    queryKey: ["teams-all", currentOrg?.id, policies.canViewAllTeams],
    queryFn: () =>
      api.teams.list(currentOrg!.id, {
        limit: 500,
        ...policies.teamListParams(),
      }),
    enabled: !!currentOrg && !policies.isLoading,
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

  // Helper: update all matching project caches + force server sync.
  const refreshProjectCaches = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats", currentOrg!.id] });
    // Force an immediate refetch of any currently-mounted projects query
    // so the list updates even if the query's `enabled` gate is momentarily false.
    qc.refetchQueries({ queryKey: ["projects"], type: "active" });
  };

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
    onSuccess: (newProject: Project) => {
      // 1. Optimistic: immediately prepend the new project to all matching list caches
      qc.setQueriesData<ListResponse<Project>>(
        { queryKey: ["projects"] },
        (old) => {
          if (!old) return old;
          if (old.data?.some((p) => p.id === newProject.id)) return old;
          return {
            ...old,
            data: [newProject, ...old.data],
            total: old.total + 1,
          };
        },
      );
      // 2. Then sync with server
      refreshProjectCaches();
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
    onSuccess: (_, deletedId: string) => {
      // Optimistic: immediately remove from all matching list caches
      qc.setQueriesData<ListResponse<Project>>(
        { queryKey: ["projects"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.filter((p) => p.id !== deletedId),
            total: Math.max(0, old.total - 1),
          };
        },
      );
      refreshProjectCaches();
      setDeleteTarget(null);
      toast.success("Project deleted");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProjectForm & { id: string }) =>
      api.projects.update(currentOrg!.id, data.id, {
        name: data.name,
        description: data.description,
        status: data.status as Project["status"],
        team_ids: data.team_ids?.length
          ? data.team_ids
          : data.team_id
            ? [data.team_id]
            : undefined,
      }),
    onSuccess: (updatedProject: Project) => {
      // Optimistic: immediately replace the matching project in all list caches
      qc.setQueriesData<ListResponse<Project>>(
        { queryKey: ["projects"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((p) =>
              p.id === updatedProject.id ? updatedProject : p,
            ),
          };
        },
      );
      refreshProjectCaches();
      setEditTarget(null);
      setError("");
      toast.success("Project updated");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to update project"),
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

  const activeFilterCount = [
    statusFilter && statusFilter !== "active" ? statusFilter : "",
    teamFilter,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter("active");
    setTeamFilter("");
    setSearch("");
    setPage(0);
  };

  const statusFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
    { value: "on_hold", label: "On Hold" },
  ];

  const teamFilterOptions = [
    { value: "", label: "All teams" },
    ...teamList.map((t: Team) => ({ value: t.id, label: t.name })),
  ];

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
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-base-content/85" />
          <input
            type="text"
            placeholder="Search projects..."
            className="h-10 w-full rounded-xl search-anchor-surface bg-transparent px-3 pl-8 pr-9 text-sm text-base-content placeholder:text-base-content/45 focus:outline-none focus:ring-2 focus:ring-oklch(64%_0.18_180_/_0.35)"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-100/45 hover:text-base-content"
              onClick={() => updateSearch("")}
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant={showFilters ? "primary" : "ghost"}
          className="gap-1"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-xs badge-secondary">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="flex-1" />

        <span className="text-sm text-base-content/50">
          {total} project{total !== 1 ? "s" : ""}
        </span>

        <div className="inline-flex items-center rounded-xl border border-base-200/55 bg-base-100/26 p-1 backdrop-blur-xl">
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              viewMode === "table"
                ? "bg-base-100/70 text-base-content shadow-[inset_0_0_0_1px_oklch(100%_0_0_/_0.16)]"
                : "text-base-content/70 hover:bg-base-100/30",
            )}
            onClick={() => setViewMode("table")}
          >
            <Table2 className="w-4 h-4" />
            <span>Table</span>
            {viewMode === "table" ? (
              <span className="text-[10px]">✓</span>
            ) : null}
          </button>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              viewMode === "grid"
                ? "bg-base-100/70 text-base-content shadow-[inset_0_0_0_1px_oklch(100%_0_0_/_0.16)]"
                : "text-base-content/70 hover:bg-base-100/30",
            )}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Grid</span>
            {viewMode === "grid" ? (
              <span className="text-[10px]">✓</span>
            ) : null}
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
            <div className="dropdown dropdown-bottom">
              <div
                tabIndex={0}
                role="button"
                className="inline-flex h-9 min-h-9 w-32 items-center justify-between rounded-xl border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md"
              >
                <span>
                  {statusFilterOptions.find((o) => o.value === statusFilter)
                    ?.label || "All"}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 text-base-content/60"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <ul className="dropdown-content task-status-menu z-[80] mt-1 w-32 rounded-xl border p-1 shadow-xl backdrop-blur-2xl">
                {statusFilterOptions.map((opt) => (
                  <li key={opt.value || "all"}>
                    <button
                      className={cn(
                        "task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                        statusFilter === opt.value
                          ? "task-status-item-active"
                          : "text-base-content/80 hover:bg-base-200/35",
                      )}
                      onClick={() => updateStatus(opt.value)}
                    >
                      <span>{opt.label}</span>
                      {statusFilter === opt.value ? (
                        <span className="text-xs">✓</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">Team:</span>
            <div className="dropdown dropdown-bottom">
              <div
                tabIndex={0}
                role="button"
                className="inline-flex h-9 min-h-9 w-44 items-center justify-between rounded-xl border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md"
              >
                <span className="truncate">
                  {teamFilterOptions.find((o) => o.value === teamFilter)
                    ?.label || "All teams"}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 text-base-content/60"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <ul className="dropdown-content task-status-menu z-[80] mt-1 max-h-64 w-44 overflow-y-auto rounded-xl border p-1 shadow-xl backdrop-blur-2xl">
                {teamFilterOptions.map((opt) => (
                  <li key={opt.value || "all"}>
                    <button
                      className={cn(
                        "task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                        teamFilter === opt.value
                          ? "task-status-item-active"
                          : "text-base-content/80 hover:bg-base-200/35",
                      )}
                      onClick={() => updateTeam(opt.value)}
                    >
                      <span className="truncate">{opt.label}</span>
                      {teamFilter === opt.value ? (
                        <span className="text-xs">✓</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="xs" onClick={clearFilters}>
              <X className="w-3 h-3" /> Clear all
            </Button>
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
            debouncedSearch ||
            (statusFilter && statusFilter !== "active") ||
            teamFilter
              ? "No matching projects"
              : "No projects yet"
          }
          description={
            debouncedSearch ||
            (statusFilter && statusFilter !== "active") ||
            teamFilter
              ? "Try adjusting your search or filters"
              : "Create your first project to get started"
          }
          action={
            debouncedSearch ||
            (statusFilter && statusFilter !== "active") ||
            teamFilter ? (
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <PermissionGate resource="projects" action="create">
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" /> Create Project
                </Button>
              </PermissionGate>
            )
          }
        />
      ) : viewMode === "table" ? (
        <Card className="flex-1">
          <div className="w-full overflow-x-auto">
            <table className="table w-full border-separate border-spacing-y-1">
              <thead className="table-header-surface [&_th]:backdrop-blur-sm [&_th]:border-b [&_th]:font-semibold [&_th:first-child]:rounded-l-xl [&_th:last-child]:rounded-r-xl">
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
              <tbody className="[&_tr]:transition-colors [&_tr]:duration-150 [&_tr:hover]:bg-base-200/32 [&_tr:hover>td:first-child]:rounded-l-xl [&_tr:hover>td:last-child]:rounded-r-xl">
                {projects.map((project: Project) => {
                  const projectTeams = teamList.filter(
                    (t: Team) =>
                      t.id === project.team_id ||
                      (project.team_ids && project.team_ids.includes(t.id)),
                  );
                  return (
                    <tr
                      key={project.id}
                      className="cursor-pointer"
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
                            STATUS_BADGE[project.status as TaskStatus] ??
                              "badge-ghost",
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
                          <PermissionGate resource="projects" action="update">
                            <button
                              className="btn btn-ghost btn-xs btn-square"
                              onClick={() => setEditTarget(project)}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </PermissionGate>
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
                    className={cn(
                      "badge badge-sm",
                      STATUS_BADGE[project.status as TaskStatus] ??
                        "badge-ghost",
                    )}
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
                    <PermissionGate resource="projects" action="update">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={() => setEditTarget(project)}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </PermissionGate>
                    <PermissionGate resource="projects" action="delete">
                      <button
                        className="btn btn-ghost btn-xs btn-square text-error"
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
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

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
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
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

      {/* Edit Modal */}
      {editTarget && (
        <EditProjectModal
          project={editTarget}
          teamOptions={teamOptions}
          teamList={teamList}
          onClose={() => {
            setEditTarget(null);
            setError("");
          }}
          onSubmit={(data) =>
            updateMutation.mutate({ ...data, id: editTarget.id })
          }
          loading={updateMutation.isPending}
          error={error}
        />
      )}

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

function EditProjectModal({
  project,
  teamOptions,
  teamList,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  project: Project;
  teamOptions: { value: string; label: string }[];
  teamList: Team[];
  onClose: () => void;
  onSubmit: (data: ProjectForm) => void;
  loading: boolean;
  error: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
    watch,
    setValue,
  } = useForm<ProjectForm>({
    defaultValues: {
      name: project.name,
      description: project.description || "",
      status: project.status,
      team_id: project.team_ids?.[0] || project.team_id || "",
      team_ids: project.team_ids || (project.team_id ? [project.team_id] : []),
    },
  });
  const selectedTeamIds = watch("team_ids") || [];

  return (
    <Modal open onClose={onClose} title="Edit Project">
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          label="Status"
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
            { value: "completed", label: "Completed" },
          ]}
          {...register("status")}
        />
        <Select
          label="Primary Team"
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
              {teamOptions.map((t) => (
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
          </div>
        )}
        <div className="modal-action">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
