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
import { Plus, Users, Trash2, UserPlus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Team, TeamMember } from "@/types/domain";

interface TeamForm {
  name: string;
  description: string;
}

export default function TeamsPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams", currentOrg?.id],
    queryFn: () => api.teams.list(currentOrg!.id),
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
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Team
          </Button>
        }
      />

      {(!teams?.data || teams.data.length === 0) ? (
        <EmptyState
          icon={<Users className="w-16 h-16" />}
          title="No teams yet"
          description="Create your first team to organize members"
          action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Team</Button>}
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
                  <button
                    className="btn btn-ghost btn-xs btn-square"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(team); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-sm text-base-content/50 mt-3">
                  Created {formatDate(team.created_at)}
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
  const { data: members, isLoading } = useQuery({
    queryKey: ["team-members", orgId, team.id],
    queryFn: () => api.teamMembers.list(orgId, team.id),
  });

  return (
    <Modal open onClose={onClose} title={team.name} className="max-w-lg">
      {team.description && <p className="text-base-content/60 mb-4">{team.description}</p>}
      <h4 className="font-semibold mb-2">Members</h4>
      {isLoading ? (
        <span className="loading loading-spinner loading-sm" />
      ) : (!members?.data || members.data.length === 0) ? (
        <p className="text-sm text-base-content/50">No members</p>
      ) : (
        <ul className="space-y-2">
          {members.data.map((m: TeamMember) => (
            <li key={m.user_id} className="flex items-center gap-2 text-sm">
              <Avatar name={m.user_id.slice(0, 4)} size="xs" />
              <span className="font-mono text-xs">{m.user_id.slice(0, 12)}</span>
              <span className="badge badge-sm badge-ghost">{m.role}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-action">
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
