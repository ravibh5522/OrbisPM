"use client";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import {
  Avatar,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
} from "@/components/ui/shared";
import { usePermissions } from "@/hooks/use-permissions";
import { api, ApiError } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Role, Team, TeamMember } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface TeamForm {
  name: string;
  description: string;
}

const PAGE_SIZE = 18; // 3 cols × 6 rows

export default function TeamsPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const { can } = usePermissions();

  // Server-side pagination, search, sort
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

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
    ],
    queryFn: () =>
      api.teams.list(currentOrg!.id, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    enabled: !!currentOrg,
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

  const createMutation = useMutation({
    mutationFn: (data: TeamForm) => api.teams.create(currentOrg!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setDeleteTarget(null);
      toast.success("Team deleted");
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

  const SortButton = ({ col, label }: { col: string; label: string }) => (
    <button
      className={cn(
        "btn btn-xs btn-ghost gap-0.5",
        sortBy === col && "btn-active",
      )}
      onClick={() => handleSort(col)}
    >
      {label}
      <ChevronDown
        className={cn(
          "w-3 h-3 transition-transform",
          sortBy === col ? "opacity-100" : "opacity-30",
          sortBy === col && sortOrder === "asc" && "rotate-180",
        )}
      />
    </button>
  );

  return (
    <div>
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

      {/* Search + Sort + Count */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search teams..."
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

        <div className="flex items-center gap-1">
          <span className="text-xs text-base-content/50 mr-1">Sort:</span>
          <SortButton col="name" label="Name" />
          <SortButton col="created_at" label="Created" />
        </div>

        <div className="flex-1" />
        <span className="text-sm text-base-content/50">
          {total} team{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 bg-base-200 rounded-xl border border-base-200"
            />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users className="w-16 h-16" />}
          title={debouncedSearch ? "No matching teams" : "No teams yet"}
          description={
            debouncedSearch
              ? "Try a different search term"
              : "Create your first team to organize members"
          }
          action={
            debouncedSearch ? (
              <Button variant="ghost" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : can("teams", "create") ? (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> Create Team
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team: Team) => (
            <Card key={team.id} compact>
              <div
                className="cursor-pointer"
                onClick={() => setSelectedTeam(team)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lg truncate">
                      {team.name}
                    </h3>
                    {team.description && (
                      <p className="text-sm text-base-content/60 mt-1 line-clamp-2">
                        {team.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <Link
                      href={`/${orgSlug}/teams/${team.id}`}
                      className="btn btn-ghost btn-xs btn-square"
                      onClick={(e) => e.stopPropagation()}
                      title="Team Dashboard"
                    >
                      <BarChart3 className="w-3 h-3" />
                    </Link>
                    {can("teams", "delete") && (
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(team);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm text-base-content/50">
                    Created {formatDate(team.created_at)}
                  </span>
                  <Link
                    href={`/${orgSlug}/teams/${team.id}`}
                    className="btn btn-ghost btn-xs gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <BarChart3 className="w-3 h-3" /> Dashboard
                  </Link>
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

      {/* Team Detail Modal */}
      {selectedTeam && (
        <TeamDetailModal
          team={selectedTeam}
          orgId={currentOrg!.id}
          onClose={() => setSelectedTeam(null)}
        />
      )}

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

function TeamDetailModal({
  team,
  orgId,
  onClose,
}: {
  team: Team;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");

  const { data: members, isLoading } = useQuery({
    queryKey: ["team-members", orgId, team.id],
    queryFn: () => api.teamMembers.list(orgId, team.id),
  });

  const { data: orgMembers } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
  });

  const { data: teamRoles } = useQuery({
    queryKey: ["team-roles", orgId],
    queryFn: () => api.permissions.roles.list(orgId, "team"),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.teamMembers.add(orgId, team.id, {
        user_id: addUserId,
        role: addRole,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", orgId, team.id] });
      setAddUserId("");
      setAddRole("member");
      toast.success("Member added to team");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.teamMembers.remove(orgId, team.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", orgId, team.id] });
      toast.success("Member removed from team");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.teamMembers.update(orgId, team.id, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", orgId, team.id] });
      toast.success("Member role updated");
    },
  });

  const memberIds = new Set(
    (members?.data || []).map((m: TeamMember) => m.user_id),
  );
  const availableOrg = (orgMembers?.data || []).filter(
    (m) => !memberIds.has(m.user_id),
  );
  const roleOptions = (teamRoles || []).map((r: Role) => ({
    value: r.slug,
    label: r.name + (r.is_system ? "" : " (Custom)"),
  }));

  return (
    <Modal open onClose={onClose} title={team.name} className="max-w-lg">
      {team.description && (
        <p className="text-base-content/60 mb-4">{team.description}</p>
      )}

      <h4 className="font-semibold mb-2">
        Members ({members?.data?.length ?? 0})
      </h4>
      {isLoading ? (
        <span className="loading loading-spinner loading-sm" />
      ) : !members?.data || members.data.length === 0 ? (
        <p className="text-sm text-base-content/50 mb-4">No members yet</p>
      ) : (
        <ul className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {members.data.map((m: TeamMember) => (
            <li
              key={m.user_id}
              className="flex items-center gap-2 text-sm group"
            >
              <Avatar
                name={m.display_name || m.email || m.user_id.slice(0, 4)}
                src={m.avatar_url}
                size="xs"
              />
              <span className="text-xs flex-1 truncate">
                {m.display_name || m.email || m.user_id.slice(0, 12)}
              </span>
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
              <button
                className="btn btn-ghost btn-xs btn-square text-error opacity-0 group-hover:opacity-100"
                onClick={() => removeMutation.mutate(m.user_id)}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="divider text-xs">Add Member</div>
      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (addUserId) addMutation.mutate();
        }}
      >
        <div className="flex-1">
          <select
            className="select select-bordered select-sm w-full"
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
          >
            <option value="">Select org member...</option>
            {availableOrg.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.email || m.user_id.slice(0, 16)}
              </option>
            ))}
          </select>
        </div>
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
        <Button
          type="submit"
          size="sm"
          loading={addMutation.isPending}
          disabled={!addUserId}
        >
          <UserPlus className="w-4 h-4" />
        </Button>
      </form>

      <div className="modal-action">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
