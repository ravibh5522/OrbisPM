"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import {
  Avatar,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingPage,
} from "@/components/ui/shared";
import { Tabs } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { OrgMember } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Calendar,
  Key,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const BUILTIN_ROLE_OPTIONS = [
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

const PAGE_SIZE = 20;

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

export default function MembersTab() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const currentUser = useAuthStore((s) => s.user);
  const currentRole = useAuthStore((s) => s.currentMembership?.role);
  const qc = useQueryClient();

  // Fetch org-scope roles from DB to include custom roles in dropdowns
  const { data: dbOrgRoles } = useQuery({
    queryKey: ["permissions-roles", currentOrg?.id, "org"],
    queryFn: () => api.permissions.roles.list(currentOrg!.id, "org"),
    enabled: !!currentOrg,
    staleTime: 60_000,
  });

  // Build role options: use DB roles if available, otherwise built-in defaults
  // Include description for UI hints
  const allRoleOptions = dbOrgRoles?.length
    ? dbOrgRoles.map(
        (r: { slug: string; name: string; description?: string }) => ({
          value: r.slug,
          label: r.name,
          description: r.description || "",
        }),
      )
    : BUILTIN_ROLE_OPTIONS.map((r) => ({ ...r, description: "" }));

  // For invite/create forms: exclude owner (ownership transferred via dedicated flow)
  const roleOptions = allRoleOptions.filter(
    (r: { value: string }) => r.value !== "owner",
  );

  // For Change Role modal: owners can assign owner, non-owners cannot
  const changeRoleOptions =
    currentRole === "owner"
      ? allRoleOptions
      : allRoleOptions.filter((r: { value: string }) => r.value !== "owner");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteMode, setInviteMode] = useState<InviteMode>("email");
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<OrgMember | null>(null);
  const [emailTarget, setEmailTarget] = useState<OrgMember | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<OrgMember | null>(
    null,
  );
  const [deleteAccountTarget, setDeleteAccountTarget] =
    useState<OrgMember | null>(null);
  const [error, setError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  // Position the portal-rendered menu relative to the trigger button
  useLayoutEffect(() => {
    if (!openMenuId || !triggerRef.current || !menuRef.current) return;
    const btn = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const cvw = document.documentElement.clientWidth;
    const cvh = document.documentElement.clientHeight;

    // Default: right-aligned below button
    let left = btn.right - menu.width;
    let top = btn.bottom + 4;

    // Flip left if overflows right
    if (left + menu.width > cvw - 8) left = cvw - menu.width - 8;
    if (left < 8) left = 8;

    // Flip above if overflows bottom
    if (top + menu.height > cvh - 8) top = btn.top - menu.height - 4;
    if (top < 8) top = 8;

    setMenuStyle({ position: "fixed", top, left, zIndex: 9999 });
  }, [openMenuId]);

  const toggleMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, memberId: string) => {
      triggerRef.current = e.currentTarget;
      setOpenMenuId((prev) => (prev === memberId ? null : memberId));
    },
    [],
  );

  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", currentOrg?.id, page, debouncedSearch],
    queryFn: () =>
      api.members.list(currentOrg!.id, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
      }),
    enabled: !!currentOrg,
  });

  const inviteForm = useForm<InviteForm>({ defaultValues: { role: "member" } });
  const inviteMutation = useMutation({
    mutationFn: (data: InviteForm) =>
      api.members.add(currentOrg!.id, { email: data.email, role: data.role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setShowInvite(false);
      inviteForm.reset();
      setError("");
      toast.success("Member invited");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to invite member"),
  });

  const createForm = useForm<CreateAccountForm>({
    defaultValues: { role: "member" },
  });
  const createAccountMutation = useMutation({
    mutationFn: async (data: CreateAccountForm) => {
      await api.auth.signup(data.email, data.password, data.name);
      return api.members.add(currentOrg!.id, {
        email: data.email,
        role: data.role,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setShowInvite(false);
      createForm.reset();
      setError("");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to create account"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.members.update(currentOrg!.id, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setEditTarget(null);
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to update role"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.members.remove(currentOrg!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setRemoveTarget(null);
      toast.success("Member removed");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({
      userId,
      new_password,
    }: {
      userId: string;
      new_password: string;
    }) => api.members.resetPassword(currentOrg!.id, userId, { new_password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setPasswordTarget(null);
      toast.success("Password reset successfully");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to reset password"),
  });

  const updateEmailMutation = useMutation({
    mutationFn: ({
      userId,
      new_email,
    }: {
      userId: string;
      new_email: string;
    }) => api.members.updateEmail(currentOrg!.id, userId, { new_email }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setEmailTarget(null);
      setActionSuccess("Email updated successfully");
      setTimeout(() => setActionSuccess(""), 3000);
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to update email"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) =>
      api.members.deactivate(currentOrg!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setDeactivateTarget(null);
      toast.success("Member deactivated");
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to deactivate member",
      ),
  });

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) =>
      api.members.reactivate(currentOrg!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("Member reactivated");
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError ? e.message : "Failed to reactivate member",
      ),
  });

  const forceMfaMutation = useMutation({
    mutationFn: (userId: string) =>
      api.members.forceMfa(currentOrg!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("MFA enforcement enabled");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to enforce MFA"),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (userId: string) =>
      api.members.deleteAccount(currentOrg!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setDeleteAccountTarget(null);
      toast.success("Account deleted permanently");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to delete account"),
  });

  if (isLoading) return <LoadingPage />;

  const memberList = members?.data || [];
  const serverTotal = members?.total ?? 0;
  const totalPages = Math.ceil(serverTotal / PAGE_SIZE);

  const getMemberName = (m: OrgMember) =>
    m.display_name || m.email || m.user_id.slice(0, 12);

  return (
    <div className="flex flex-col">
      {/* Header with action */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-base-content/60">
          {serverTotal} member{serverTotal !== 1 ? "s" : ""}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setShowInvite(true);
            setError("");
          }}
        >
          <UserPlus className="w-4 h-4" /> Add Member
        </Button>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
          <Input
            type="text"
            placeholder="Search by name, email or role..."
            className="pl-10"
            size={undefined}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {memberList.length === 0 && !searchQuery ? (
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
        <>
          <Card>
            <div className="w-full overflow-x-auto overflow-y-visible">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>
                      <Mail className="w-3.5 h-3.5 inline mr-1" />
                      Email
                    </th>
                    <th>
                      <Phone className="w-3.5 h-3.5 inline mr-1" />
                      Phone
                    </th>
                    <th>
                      <Shield className="w-3.5 h-3.5 inline mr-1" />
                      Role
                    </th>
                    <th>
                      <Calendar className="w-3.5 h-3.5 inline mr-1" />
                      Joined
                    </th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {memberList.map((m: OrgMember) => (
                    <tr key={m.user_id} className="hover">
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={getMemberName(m)}
                            src={m.avatar_url}
                            size="sm"
                          />
                          <div>
                            <span className="font-medium text-sm">
                              {m.display_name || "—"}
                            </span>
                            {m.user_id === currentUser?.id && (
                              <span className="badge badge-xs badge-primary ml-2">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm">{m.email || "—"}</span>
                      </td>
                      <td>
                        <span className="text-sm text-base-content/60">
                          {m.phone || "—"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge badge-sm ${ROLE_COLORS[m.role] || "badge-ghost"}`}
                        >
                          {m.role.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-base-content/60">
                          {formatDate(m.joined_at)}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="btn-square"
                            onClick={(e) => toggleMenu(e, m.user_id)}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                          {openMenuId === m.user_id &&
                            createPortal(
                              <div
                                ref={menuRef}
                                style={menuStyle}
                                className="menu p-1 shadow-xl bg-base-100/95 backdrop-blur-[20px] rounded-box w-48 border border-base-200"
                              >
                                <ul>
                                  <li>
                                    <button
                                      onClick={() => {
                                        setEditTarget(m);
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm"
                                    >
                                      <Shield className="w-3.5 h-3.5" /> Change
                                      Role
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      onClick={() => {
                                        setPasswordTarget(m);
                                        setError("");
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm"
                                    >
                                      <Key className="w-3.5 h-3.5" /> Reset
                                      Password
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      onClick={() => {
                                        setEmailTarget(m);
                                        setError("");
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm"
                                    >
                                      <Mail className="w-3.5 h-3.5" /> Update
                                      Email
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      onClick={() => {
                                        forceMfaMutation.mutate(m.user_id);
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm"
                                    >
                                      <ShieldCheck className="w-3.5 h-3.5" />{" "}
                                      Force MFA
                                    </button>
                                  </li>
                                  <div className="divider my-0.5" />
                                  <li>
                                    <button
                                      onClick={() => {
                                        setDeactivateTarget(m);
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm text-warning"
                                    >
                                      <Ban className="w-3.5 h-3.5" /> Deactivate
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      onClick={() => {
                                        reactivateMutation.mutate(m.user_id);
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm text-success"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />{" "}
                                      Reactivate
                                    </button>
                                  </li>
                                  <div className="divider my-0.5" />
                                  <li>
                                    <button
                                      onClick={() => {
                                        setRemoveTarget(m);
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm text-error"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Remove
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      onClick={() => {
                                        setDeleteAccountTarget(m);
                                        setOpenMenuId(null);
                                      }}
                                      disabled={m.user_id === currentUser?.id}
                                      className="text-sm text-error"
                                    >
                                      <UserX className="w-3.5 h-3.5" /> Delete
                                      Account
                                    </button>
                                  </li>
                                </ul>
                              </div>,
                              document.body,
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {searchQuery && memberList.length === 0 && (
              <div className="text-center py-6 text-base-content/50 text-sm">
                No members match &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </Card>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={serverTotal}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Add Member Modal */}
      <Modal
        open={showInvite}
        onClose={() => {
          setShowInvite(false);
          inviteForm.reset();
          createForm.reset();
          setError("");
        }}
        title="Add Member"
      >
        {error && (
          <Alert variant="error" className="mb-4 text-sm">
            {error}
          </Alert>
        )}
        <Tabs
          tabs={[
            {
              id: "email",
              label: "Invite Existing User",
              icon: <Mail className="w-3.5 h-3.5" />,
            },
            {
              id: "create",
              label: "Create New Account",
              icon: <UserPlus className="w-3.5 h-3.5" />,
            },
          ]}
          activeTab={inviteMode}
          onChange={(id) => {
            setInviteMode(id as "email" | "create");
            setError("");
          }}
          variant="boxed"
          size="sm"
          className="mb-4"
        />

        {inviteMode === "email" ? (
          <form
            onSubmit={inviteForm.handleSubmit((data) =>
              inviteMutation.mutate(data),
            )}
            className="space-y-4"
          >
            <Input
              label="Email Address"
              type="email"
              placeholder="user@example.com"
              {...inviteForm.register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Invalid email",
                },
              })}
              error={inviteForm.formState.errors.email?.message}
            />
            <Select
              label="Role"
              options={roleOptions}
              {...inviteForm.register("role")}
            />
            <p className="text-xs text-base-content/50">
              The user must already have an OrbisPM account.
            </p>
            <div className="modal-action">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowInvite(false);
                  inviteForm.reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={inviteMutation.isPending}>
                <Mail className="w-4 h-4" /> Invite
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={createForm.handleSubmit((data) =>
              createAccountMutation.mutate(data),
            )}
            className="space-y-4"
          >
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
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Invalid email",
                },
              })}
              error={createForm.formState.errors.email?.message}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              {...createForm.register("password", {
                required: "Password is required",
                minLength: {
                  value: 8,
                  message: "Password must be at least 8 characters",
                },
              })}
              error={createForm.formState.errors.password?.message}
            />
            <Select
              label="Role"
              options={roleOptions}
              {...createForm.register("role")}
            />
            <p className="text-xs text-base-content/50">
              This creates a new OrbisPM account and adds them to the
              organization.
            </p>
            <div className="modal-action">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowInvite(false);
                  createForm.reset();
                }}
              >
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
              <Avatar
                name={getMemberName(editTarget)}
                src={editTarget.avatar_url}
                size="sm"
              />
              <div>
                <div className="font-medium text-sm">
                  {getMemberName(editTarget)}
                </div>
                {editTarget.email && (
                  <div className="text-xs text-base-content/50">
                    {editTarget.email}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {changeRoleOptions.map(
                (r: { value: string; label: string; description: string }) => (
                  <button
                    key={r.value}
                    className={`btn btn-sm justify-start text-left ${editTarget.role === r.value ? "btn-primary" : "btn-outline"}`}
                    onClick={() =>
                      updateRoleMutation.mutate({
                        userId: editTarget.user_id,
                        role: r.value,
                      })
                    }
                    disabled={
                      updateRoleMutation.isPending ||
                      editTarget.role === r.value
                    }
                  >
                    <span className="flex flex-col items-start">
                      <span>{r.label}</span>
                      {r.description && (
                        <span className="text-[10px] font-normal opacity-60">
                          {r.description}
                        </span>
                      )}
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="modal-action">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* Remove Confirm */}
      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() =>
          removeTarget && removeMutation.mutate(removeTarget.user_id)
        }
        title="Remove Member"
        message={`Remove ${removeTarget ? getMemberName(removeTarget) : ""} from the organization? They will lose access to all projects and resources.`}
        confirmLabel="Remove"
        loading={removeMutation.isPending}
      />

      {/* Reset Password Modal */}
      {passwordTarget && (
        <Modal
          open
          onClose={() => setPasswordTarget(null)}
          title="Reset Password"
        >
          {error && (
            <Alert variant="error" className="mb-4 text-sm">
              {error}
            </Alert>
          )}
          <div className="flex items-center gap-3 p-3 bg-base-200 rounded-lg mb-4">
            <Avatar
              name={getMemberName(passwordTarget)}
              src={passwordTarget.avatar_url}
              size="sm"
            />
            <div>
              <div className="font-medium text-sm">
                {getMemberName(passwordTarget)}
              </div>
              {passwordTarget.email && (
                <div className="text-xs text-base-content/50">
                  {passwordTarget.email}
                </div>
              )}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const pw = formData.get("new_password") as string;
              if (pw.length < 8) {
                setError("Password must be at least 8 characters");
                return;
              }
              resetPasswordMutation.mutate({
                userId: passwordTarget.user_id,
                new_password: pw,
              });
            }}
            className="space-y-4"
          >
            <Input
              label="New Password"
              name="new_password"
              type="password"
              placeholder="Min 8 characters"
              required
            />
            <div className="modal-action">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPasswordTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={resetPasswordMutation.isPending}>
                <Key className="w-4 h-4" /> Reset
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Update Email Modal */}
      {emailTarget && (
        <Modal open onClose={() => setEmailTarget(null)} title="Update Email">
          {error && (
            <Alert variant="error" className="mb-4 text-sm">
              {error}
            </Alert>
          )}
          <div className="flex items-center gap-3 p-3 bg-base-200 rounded-lg mb-4">
            <Avatar
              name={getMemberName(emailTarget)}
              src={emailTarget.avatar_url}
              size="sm"
            />
            <div>
              <div className="font-medium text-sm">
                {getMemberName(emailTarget)}
              </div>
              {emailTarget.email && (
                <div className="text-xs text-base-content/50">
                  Current: {emailTarget.email}
                </div>
              )}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const email = formData.get("new_email") as string;
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setError("Invalid email address");
                return;
              }
              updateEmailMutation.mutate({
                userId: emailTarget.user_id,
                new_email: email,
              });
            }}
            className="space-y-4"
          >
            <Input
              label="New Email"
              name="new_email"
              type="email"
              placeholder="user@example.com"
              required
            />
            <div className="modal-action">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEmailTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={updateEmailMutation.isPending}>
                <Mail className="w-4 h-4" /> Update
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Deactivate Confirm */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() =>
          deactivateTarget &&
          deactivateMutation.mutate(deactivateTarget.user_id)
        }
        title="Deactivate Member"
        message={`Deactivate ${deactivateTarget ? getMemberName(deactivateTarget) : ""}? They will not be able to log in until reactivated.`}
        confirmLabel="Deactivate"
        loading={deactivateMutation.isPending}
      />

      {/* Delete Account Confirm */}
      <ConfirmDialog
        open={!!deleteAccountTarget}
        onClose={() => setDeleteAccountTarget(null)}
        onConfirm={() =>
          deleteAccountTarget &&
          deleteAccountMutation.mutate(deleteAccountTarget.user_id)
        }
        title="Delete Account Permanently"
        message={`Permanently delete the account for ${deleteAccountTarget ? getMemberName(deleteAccountTarget) : ""}? This action cannot be undone. The user will be removed from all organizations and their data will be lost.`}
        confirmLabel="Delete Permanently"
        loading={deleteAccountMutation.isPending}
      />

      {/* Success Toast */}
      {actionSuccess && (
        <div className="toast toast-end toast-bottom z-50">
          <Alert variant="success" className="text-sm">
            {actionSuccess}
          </Alert>
        </div>
      )}
    </div>
  );
}
