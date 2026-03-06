"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, ConfirmDialog, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { Plus, Users, Trash2, UserPlus, BarChart3 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Team, TeamMember } from "@/types/domain";
import { usePermissions } from "@/hooks/use-permissions";
import Link from "next/link";

interface TeamForm {
  name: string;
  description: string;
}

export default function TeamsPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const { can } = usePermissions();

  // Role options for filtering
  const roleOptions = [
    { value: "all", label: "All Roles" },
    { value: "lead", label: "Lead" },
    { value: "member", label: "Member" },
    { value: "viewer", label: "Viewer" },
  ];

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams", currentOrg?.id, roleFilter !== "all" ? roleFilter : undefined],
    queryFn: () => api.teams.list(currentOrg!.id, {
      role: roleFilter !== "all" ? roleFilter : undefined,
    }),
    enabled: !!currentOrg,
  });

  const { register, handleSubmit, reset, formState: { errors: formErrors } } = useForm<TeamForm>();

  const createMutation = useMutation({
    mutationFn: (data: TeamForm) => api.teams.create(currentOrg!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setShowCreate(false);
      reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create team"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.teams.delete(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <LoadingPage />;

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

      {/* Role Filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium">My Role:</span>
        <select
          className="select select-sm select-bordered"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          {roleOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {(!teams?.data || teams.data.length === 0) ? (
        <EmptyState
          icon={<Users className="w-16 h-16" />}
          title="No teams yet"
          description="Create your first team to organize members"
          action={can("teams", "create") ? <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Team</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.data.map((team: Team) => (
            <Card key={team.id} compact>
              <div className="cursor-pointer" onClick={() => setSelectedTeam(team)}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{team.name}</h3>
                    {team.description && (
                      <p className="text-sm text-base-content/60 mt-1 line-clamp-2">{team.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
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
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(team); }}
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

      {/* Team Detail Modal */}
      {selectedTeam && (
        <TeamDetailModal
          team={selectedTeam}
          orgId={currentOrg!.id}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setError(""); }} title="New Team">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
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
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create</Button>
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

function TeamDetailModal({ team, orgId, onClose }: { team: Team; orgId: string; onClose: () => void }) {
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

  const { data: customRoles } = useQuery({
    queryKey: ["custom-roles", orgId],
    queryFn: () => api.customRoles.list(orgId),
  });

  const addMutation = useMutation({
    mutationFn: () => api.teamMembers.add(orgId, team.id, { user_id: addUserId, role: addRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", orgId, team.id] });
      setAddUserId("");
      setAddRole("member");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.teamMembers.remove(orgId, team.id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", orgId, team.id] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.teamMembers.update(orgId, team.id, userId, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", orgId, team.id] }),
  });

  const memberIds = new Set((members?.data || []).map((m: TeamMember) => m.user_id));
  const availableOrg = (orgMembers?.data || []).filter((m) => !memberIds.has(m.user_id));
  const roleOptions = [
    { value: "lead", label: "Lead" },
    { value: "member", label: "Member" },
    { value: "viewer", label: "Viewer" },
    ...(customRoles?.data || []).map((r) => ({ value: r.name, label: r.name })),
  ];

  return (
    <Modal open onClose={onClose} title={team.name} className="max-w-lg">
      {team.description && <p className="text-base-content/60 mb-4">{team.description}</p>}

      {/* Current members */}
      <h4 className="font-semibold mb-2">Members ({members?.data?.length ?? 0})</h4>
      {isLoading ? (
        <span className="loading loading-spinner loading-sm" />
      ) : (!members?.data || members.data.length === 0) ? (
        <p className="text-sm text-base-content/50 mb-4">No members yet</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {members.data.map((m: TeamMember) => (
            <li key={m.user_id} className="flex items-center gap-2 text-sm group">
              <Avatar name={m.display_name || m.email || m.user_id.slice(0, 4)} src={m.avatar_url} size="xs" />
              <span className="text-xs flex-1">{m.display_name || m.email || m.user_id.slice(0, 12)}</span>
              <select
                className="select select-ghost select-xs capitalize"
                value={m.role}
                onChange={(e) => updateRoleMutation.mutate({ userId: m.user_id, role: e.target.value })}
              >
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
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

      {/* Add member form */}
      <div className="divider text-xs">Add Member</div>
      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => { e.preventDefault(); if (addUserId) addMutation.mutate(); }}
      >
        <div className="flex-1">
          <select
            className="select select-bordered select-sm w-full"
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
          >
            <option value="">Select org member…</option>
            {availableOrg.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.display_name || m.email || m.user_id.slice(0, 16)}</option>
            ))}
          </select>
        </div>
        <select className="select select-bordered select-sm" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <Button type="submit" size="sm" loading={addMutation.isPending} disabled={!addUserId}>
          <UserPlus className="w-4 h-4" />
        </Button>
      </form>

      <div className="modal-action">
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
