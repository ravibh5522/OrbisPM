"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, LoadingPage, Avatar, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { UserPlus, Trash2, Shield } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { OrgMember, OrgRole } from "@/types/domain";

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "billing_admin", label: "Billing Admin" },
];

interface InviteForm {
  user_id: string;
  role: string;
}

export default function MembersPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null);
  const [error, setError] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", currentOrg?.id],
    queryFn: () => api.members.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { register, handleSubmit, reset, formState: { errors: formErrors } } = useForm<InviteForm>({
    defaultValues: { role: "member" },
  });

  const addMutation = useMutation({
    mutationFn: (data: InviteForm) => api.members.add(currentOrg!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setShowInvite(false);
      reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to add member"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.members.update(currentOrg!.id, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setEditTarget(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.members.remove(currentOrg!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setRemoveTarget(null);
    },
  });

  if (isLoading) return <LoadingPage />;

  const memberList = members?.data || [];

  return (
    <div>
      <PageHeader
        title="Members"
        description={`${memberList.length} member${memberList.length !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="w-4 h-4" /> Add Member
          </Button>
        }
      />

      <Card>
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
              {memberList.map((m: OrgMember) => (
                <tr key={m.user_id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={m.display_name || m.email || m.user_id.slice(0, 4)} size="sm" />
                      <div>
                        <span className="text-sm font-medium">{m.display_name || m.email || m.user_id.slice(0, 12)}</span>
                        {m.email && m.display_name && <span className="block text-xs text-base-content/50">{m.email}</span>}
                        {m.user_id === currentUser?.id && (
                          <span className="badge badge-xs badge-primary ml-2">You</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-sm ${m.role === "owner" ? "badge-primary" : m.role === "admin" ? "badge-secondary" : "badge-ghost"}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="text-sm text-base-content/60">{formatDate(m.joined_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => setEditTarget(m)}
                        disabled={m.user_id === currentUser?.id}
                      >
                        <Shield className="w-3 h-3" />
                      </button>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => setRemoveTarget(m)}
                        disabled={m.user_id === currentUser?.id}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add member modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); reset(); setError(""); }} title="Add Member">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        <form onSubmit={handleSubmit((data) => addMutation.mutate(data))} className="space-y-4">
          <Input
            label="User ID"
            placeholder="Enter user UUID"
            {...register("user_id", { required: "User ID is required" })}
            error={formErrors.user_id?.message}
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            {...register("role")}
          />
          <div className="modal-action">
            <Button type="button" variant="ghost" onClick={() => { setShowInvite(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={addMutation.isPending}>Add Member</Button>
          </div>
        </form>
      </Modal>

      {/* Edit role modal */}
      {editTarget && (
        <Modal open onClose={() => setEditTarget(null)} title="Change Role">
          <div className="space-y-4">
            <p className="text-sm">Update role for <strong>{editTarget.display_name || editTarget.email || editTarget.user_id.slice(0, 12)}</strong></p>
            <div className="flex gap-2 flex-wrap">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  className={`btn btn-sm ${editTarget.role === r.value ? "btn-primary" : "btn-outline"}`}
                  onClick={() =>
                    updateRoleMutation.mutate({ userId: editTarget.user_id, role: r.value })
                  }
                  disabled={updateRoleMutation.isPending}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-action">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Close</Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.user_id)}
        title="Remove Member"
        message="Are you sure you want to remove this member?"
        confirmLabel="Remove"
        loading={removeMutation.isPending}
      />
    </div>
  );
}
