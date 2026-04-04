"use client";

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
import { usePermissions } from "@/hooks/use-permissions";
import { useOrgPolicies } from "@/hooks/use-policies";
import type { ListResponse } from "@/lib/api";
import { api, ApiError } from "@/lib/api";
import { cn, formatDate, statusLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Team } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ChevronDown,
    Pencil,
    Plus,
    Search,
    SlidersHorizontal,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface TeamForm {
  name: string;
  description: string;
  status?: string;
}

const PAGE_SIZE = 20;

export default function TeamsPage() {
  const router = useRouter();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const { can } = usePermissions();
  const policies = useOrgPolicies();

  // Server-side pagination, search, filter, sort state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showFilters, setShowFilters] = useState(false);

  const updateSearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };

  const updateStatus = (v: string) => {
    setStatusFilter(v);
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

  const { data: teamsResponse, isLoading } = useQuery({
    queryKey: [
      "teams",
      currentOrg?.id,
      debouncedSearch,
      page,
      sortBy,
      sortOrder,
      statusFilter,
      policies.canViewAllTeams,
    ],
    queryFn: () =>
      api.teams.list(currentOrg!.id, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        ...policies.teamListParams(),
      }),
    enabled: !!currentOrg && !policies.isLoading,
  });

  const teams = teamsResponse?.data || [];
  const total = teamsResponse?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors },
  } = useForm<TeamForm>();

  const refreshTeamCaches = () => {
    qc.invalidateQueries({ queryKey: ["teams"] });
    qc.invalidateQueries({ queryKey: ["teams-all"] });
    qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats", currentOrg!.id] });
    qc.refetchQueries({ queryKey: ["teams"], type: "active" });
  };

  const createMutation = useMutation({
    mutationFn: (data: TeamForm) => api.teams.create(currentOrg!.id, data),
    onSuccess: (newTeam: Team) => {
      qc.setQueriesData<ListResponse<Team>>({ queryKey: ["teams"] }, (old) => {
        if (!old) return old;
        if (old.data?.some((t) => t.id === newTeam.id)) return old;
        return { ...old, data: [newTeam, ...old.data], total: old.total + 1 };
      });
      refreshTeamCaches();
      setShowCreate(false);
      reset();
      setError("");
      toast.success("Team created");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to create team"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.teams.delete(currentOrg!.id, id),
    onSuccess: (_, deletedId: string) => {
      qc.setQueriesData<ListResponse<Team>>({ queryKey: ["teams"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((t) => t.id !== deletedId),
          total: Math.max(0, old.total - 1),
        };
      });
      refreshTeamCaches();
      setDeleteTarget(null);
      toast.success("Team deleted");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: TeamForm & { id: string }) =>
      api.teams.update(currentOrg!.id, data.id, {
        name: data.name,
        description: data.description,
        status: data.status as Team["status"],
      }),
    onSuccess: (updatedTeam: Team) => {
      qc.setQueriesData<ListResponse<Team>>({ queryKey: ["teams"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((t) =>
            t.id === updatedTeam.id ? updatedTeam : t,
          ),
        };
      });
      refreshTeamCaches();
      setEditTarget(null);
      setError("");
      toast.success("Team updated");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to update team"),
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
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter("active");
    setSearch("");
    setPage(0);
  };

  const statusFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
    { value: "closed", label: "Closed" },
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

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <PageHeader
        title="Teams"
        description="Organize members into teams"
        actions={
          can("teams", "create") && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> New Team
            </Button>
          )
        }
      />

      {/* Search bar + Filter toggle */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-base-content/85" />
          <input
            type="text"
            placeholder="Search teams..."
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
          {total} team{total !== 1 ? "s" : ""}
        </span>
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
          {(statusFilter !== "active" || search) && (
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
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users className="w-16 h-16" />}
          title={
            debouncedSearch || statusFilter !== "active"
              ? "No matching teams"
              : "No teams yet"
          }
          description={
            debouncedSearch || statusFilter !== "active"
              ? "Try adjusting your search or filters"
              : "Create your first team to get started"
          }
          action={
            debouncedSearch || statusFilter !== "active" ? (
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : can("teams", "create") ? (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> Create Team
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="flex-1">
          <div className="w-full overflow-x-auto">
            <table className="table w-full border-separate border-spacing-y-1">
              <thead className="table-header-surface [&_th]:backdrop-blur-sm [&_th]:border-b [&_th]:font-semibold [&_th:first-child]:rounded-l-xl [&_th:last-child]:rounded-r-xl">
                <tr>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                  >
                    Team Name <SortIcon col="name" />
                  </th>
                  <th>Description</th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("status")}
                  >
                    Status <SortIcon col="status" />
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("member_count")}
                  >
                    <Users className="w-3.5 h-3.5 inline mr-1" />
                    Members <SortIcon col="member_count" />
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("created_at")}
                  >
                    Created <SortIcon col="created_at" />
                  </th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&_tr]:transition-colors [&_tr]:duration-150 [&_tr:hover]:bg-base-200/32 [&_tr:hover>td:first-child]:rounded-l-xl [&_tr:hover>td:last-child]:rounded-r-xl">
                {teams.map((team: Team) => (
                  <tr
                    key={team.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/${orgSlug}/teams/${team.id}`)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-medium">{team.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-base-content/60 line-clamp-1 max-w-xs">
                        {team.description || "\u2014"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={cn(
                          "badge badge-sm",
                          team.status === "active"
                            ? "badge-success"
                            : team.status === "closed"
                              ? "badge-error"
                              : "badge-ghost",
                        )}
                      >
                        {statusLabel(team.status ?? "active")}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm">{team.member_count ?? 0}</span>
                    </td>
                    <td className="text-sm text-base-content/60">
                      {formatDate(team.created_at)}
                    </td>
                    <td>
                      <div
                        className="flex gap-1 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {can("teams", "update") && (
                          <button
                            className="btn btn-ghost btn-xs btn-square"
                            onClick={() => setEditTarget(team)}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {can("teams", "delete") && (
                          <button
                            className="btn btn-ghost btn-xs btn-square text-error"
                            onClick={() => setDeleteTarget(team)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
        title="New Team"
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
            label="Team Name"
            placeholder="Engineering"
            {...register("name", { required: "Name is required" })}
            error={formErrors.name?.message}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            {...register("description")}
          />
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
        <EditTeamModal
          team={editTarget}
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
        title="Delete Team"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function EditTeamModal({
  team,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  team: Team;
  onClose: () => void;
  onSubmit: (data: TeamForm) => void;
  loading: boolean;
  error: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<TeamForm>({
    defaultValues: {
      name: team.name,
      description: team.description || "",
      status: team.status || "active",
    },
  });

  return (
    <Modal open onClose={onClose} title="Edit Team">
      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Team Name"
          placeholder="Engineering"
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
            { value: "closed", label: "Closed" },
          ]}
          {...register("status")}
        />
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
