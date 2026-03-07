"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, LoadingPage, Avatar, ConfirmDialog, EmptyState } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { UserPlus, Trash2, Shield, Users, MoreHorizontal, Mail, Phone, Calendar, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { OrgMember } from "@/types/domain";
import { RequireAdmin } from "@/components/permission-gate";

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "billing_admin", label: "Billing Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  owner: "badge-primary",
  admin: "badge-secondary",
  member: "badge-ghost",
  viewer: "badge-info badge-outline",
  billing_admin: "badge-warning badge-outline",
};

type InviteMode = "email" | "create";

interface InviteForm {
  email: string;
  role: string;
}

interface CreateAccountForm {
  email: string;
  password: string;
  name: string;
  role: string;
}

export default function MembersPage() {
  return (
    <RequireAdmin>
      <MembersPageContent />
    </RequireAdmin>
  );
}

function MembersPageContent() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteMode, setInviteMode] = useState<InviteMode>("email");
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", currentOrg?.id],
    queryFn: () => api.members.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  // Invite existing user by email
  const inviteForm = useForm<InviteForm>({ defaultValues: { role: "member" } });
  const inviteMutation = useMutation({
    mutationFn: (data: InviteForm) => api.members.add(currentOrg!.id, { email: data.email, role: data.role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setShowInvite(false);
      inviteForm.reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to invite member"),
  });

  // Create new account and add to org
  const createForm = useForm<CreateAccountForm>({ defaultValues: { role: "member" } });
  const createAccountMutation = useMutation({
    mutationFn: async (data: CreateAccountForm) => {
      // 1. Create account via Zitadel sign-up
      await api.auth.signup(data.email, data.password, data.name);
      // 2. Add to org by email
      return api.members.add(currentOrg!.id, { email: data.email, role: data.role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setShowInvite(false);
      createForm.reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create account"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.members.update(currentOrg!.id, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setEditTarget(null);
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to update role"),
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
  const filteredMembers = searchQuery
    ? memberList.filter(
        (m: OrgMember) =>
          (m.display_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.role.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : memberList;

  const getMemberName = (m: OrgMember) => m.display_name || m.email || m.user_id.slice(0, 12);

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <PageHeader
        title="Members"
        description={`Manage ${memberList.length} organization member${memberList.length !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => { setShowInvite(true); setError(""); }}>
            <UserPlus className="w-4 h-4" /> Add Member
          </Button>
        }
      />

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search by name, email or role..."
            className="input input-bordered w-full pl-10 input-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {filteredMembers.length === 0 && !searchQuery ? (
        <EmptyState
          icon={<Users className="w-16 h-16" />}
          title="No members yet"
          description="Add members to collaborate on projects"
          action={
            <Button onClick={() => setShowInvite(true)}>
              <UserPlus className="w-4 h-4" /> Add Member
            </Button>
          }
        />
      ) : (
        <Card className="flex-1">
          <div className="w-full">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Member</th>
                  <th><Mail className="w-3.5 h-3.5 inline mr-1" />Email</th>
                  <th><Phone className="w-3.5 h-3.5 inline mr-1" />Phone</th>
                  <th><Shield className="w-3.5 h-3.5 inline mr-1" />Role</th>
                  <th><Calendar className="w-3.5 h-3.5 inline mr-1" />Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m: OrgMember) => (
                  <tr key={m.user_id} className="hover">
                    {/* Member */}
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={getMemberName(m)} src={m.avatar_url} size="sm" />
                        <div>
                          <span className="font-medium text-sm">
                            {m.display_name || "—"}
                          </span>
                          {m.user_id === currentUser?.id && (
                            <span className="badge badge-xs badge-primary ml-2">You</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Email */}
                    <td>
                      <span className="text-sm">{m.email || "—"}</span>
                    </td>
                    {/* Phone */}
                    <td>
                      <span className="text-sm text-base-content/60">{m.phone || "—"}</span>
                    </td>
                    {/* Role */}
                    <td>
                      <span className={`badge badge-sm ${ROLE_COLORS[m.role] || "badge-ghost"}`}>
                        {m.role.replace("_", " ")}
                      </span>
                    </td>
                    {/* Joined */}
                    <td>
                      <span className="text-sm text-base-content/60">{formatDate(m.joined_at)}</span>
                    </td>
                    {/* Actions */}
                    <td>
                      <div className="flex gap-1 justify-end">
                        <div className="dropdown dropdown-end">
                          <label tabIndex={0} className="btn btn-ghost btn-xs btn-square">
                            <MoreHorizontal className="w-4 h-4" />
                          </label>
                          <ul tabIndex={0} className="dropdown-content z-50 menu p-1 shadow-lg bg-base-100 rounded-box w-44 border border-base-200">
                            <li>
                              <button
                                onClick={() => setEditTarget(m)}
                                disabled={m.user_id === currentUser?.id}
                                className="text-sm"
                              >
                                <Shield className="w-3.5 h-3.5" /> Change Role
                              </button>
                            </li>
                            <li>
                              <button
                                onClick={() => setRemoveTarget(m)}
                                disabled={m.user_id === currentUser?.id}
                                className="text-sm text-error"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {searchQuery && filteredMembers.length === 0 && (
            <div className="text-center py-6 text-base-content/50 text-sm">
              No members match &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </Card>
      )}

      {/* Add Member Modal */}
      <Modal
        open={showInvite}
        onClose={() => { setShowInvite(false); inviteForm.reset(); createForm.reset(); setError(""); }}
        title="Add Member"
      >
        {error && <div className="alert alert-error mb-4 text-sm"><span>{error}</span></div>}

        {/* Mode tabs */}
        <div className="tabs tabs-boxed mb-4">
          <button
            className={`tab tab-sm ${inviteMode === "email" ? "tab-active" : ""}`}
            onClick={() => { setInviteMode("email"); setError(""); }}
          >
            <Mail className="w-3.5 h-3.5 mr-1" /> Invite Existing User
          </button>
          <button
            className={`tab tab-sm ${inviteMode === "create" ? "tab-active" : ""}`}
            onClick={() => { setInviteMode("create"); setError(""); }}
          >
            <UserPlus className="w-3.5 h-3.5 mr-1" /> Create New Account
          </button>
        </div>

        {inviteMode === "email" ? (
          <form onSubmit={inviteForm.handleSubmit((data) => inviteMutation.mutate(data))} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="user@example.com"
              {...inviteForm.register("email", {
                required: "Email is required",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email" },
              })}
              error={inviteForm.formState.errors.email?.message}
            />
            <Select
              label="Role"
              options={ROLE_OPTIONS}
              {...inviteForm.register("role")}
            />
            <p className="text-xs text-base-content/50">
              The user must already have an OrbisPM account.
            </p>
            <div className="modal-action">
              <Button type="button" variant="ghost" onClick={() => { setShowInvite(false); inviteForm.reset(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={inviteMutation.isPending}>
                <Mail className="w-4 h-4" /> Invite
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={createForm.handleSubmit((data) => createAccountMutation.mutate(data))} className="space-y-4">
            <Input
              label="Full Name"
              placeholder="John Doe"
              {...createForm.register("name", { required: "Name is required" })}
              error={createForm.formState.errors.name?.message}
            />
            <Input
              label="Email Address"
              type="email"
              placeholder="user@example.com"
              {...createForm.register("email", {
                required: "Email is required",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email" },
              })}
              error={createForm.formState.errors.email?.message}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              {...createForm.register("password", {
                required: "Password is required",
                minLength: { value: 8, message: "Password must be at least 8 characters" },
              })}
              error={createForm.formState.errors.password?.message}
            />
            <Select
              label="Role"
              options={ROLE_OPTIONS}
              {...createForm.register("role")}
            />
            <p className="text-xs text-base-content/50">
              This creates a new OrbisPM account and adds them to the organization.
            </p>
            <div className="modal-action">
              <Button type="button" variant="ghost" onClick={() => { setShowInvite(false); createForm.reset(); }}>
                Cancel
              </Button>
              <Button type="submit" loading={createAccountMutation.isPending}>
                <UserPlus className="w-4 h-4" /> Create & Add
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit Role Modal */}
      {editTarget && (
        <Modal open onClose={() => setEditTarget(null)} title="Change Role">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
              <Avatar name={getMemberName(editTarget)} src={editTarget.avatar_url} size="sm" />
              <div>
                <div className="font-medium text-sm">{getMemberName(editTarget)}</div>
                {editTarget.email && <div className="text-xs text-base-content/50">{editTarget.email}</div>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
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

      {/* Remove Confirm */}
      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.user_id)}
        title="Remove Member"
        message={`Remove ${removeTarget ? getMemberName(removeTarget) : ""} from the organization? They will lose access to all projects and resources.`}
        confirmLabel="Remove"
        loading={removeMutation.isPending}
      />
    </div>
  );
}
