"use client";

import { PermissionGate } from "@/components/permission-gate";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingPage,
} from "@/components/ui/shared";
import { Tabs } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type {
  Permission,
  PermissionScope,
  Role,
  ScopePermissionsResponse,
} from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/* ─── Team → Project Role Map ─── */

function TeamProjectRoleMapSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: roleMap, isLoading } = useQuery({
    queryKey: ["team-project-role-map", orgId],
    queryFn: () => api.permissions.teamProjectRoleMap.get(orgId),
    enabled: !!orgId,
  });

  const { data: teamRoles } = useQuery({
    queryKey: ["permissions-roles", orgId, "team"],
    queryFn: () => api.permissions.roles.list(orgId, "team"),
    enabled: !!orgId,
  });

  const { data: projectRoles } = useQuery({
    queryKey: ["permissions-roles", orgId, "project"],
    queryFn: () => api.permissions.roles.list(orgId, "project"),
    enabled: !!orgId,
  });

  useEffect(() => {
    if (roleMap) {
      setDraft(roleMap);
      setHasChanges(false);
    }
  }, [roleMap]);

  const saveMutation = useMutation({
    mutationFn: (map: Record<string, string>) =>
      api.permissions.teamProjectRoleMap.set(orgId, map),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-project-role-map", orgId] });
      setHasChanges(false);
    },
  });

  if (isLoading) return <div className="loading loading-spinner loading-sm" />;

  const teamRoleList = teamRoles || [];
  const projectRoleList = projectRoles || [];

  return (
    <div className="border border-base-200 rounded-lg">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-base-200/50 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <h3 className="text-sm font-semibold">Team → Project Role Mapping</h3>
          <p className="text-xs text-base-content/50">
            Inherited project roles when teams link to projects
          </p>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      {open && (
        <div className="p-3 pt-0 border-t border-base-200">
          <div className="space-y-2 mt-3">
            {teamRoleList.map((tr: Role) => (
              <div key={tr.slug} className="flex items-center gap-2">
                <span className="w-32 text-sm font-medium capitalize truncate">
                  {tr.name}
                </span>
                <span className="text-base-content/40 text-xs">→</span>
                <PermissionGate
                  resource="roles"
                  action="update"
                  fallback={
                    <span className="text-sm flex-1">
                      {projectRoleList.find(
                        (pr: Role) => pr.slug === (draft[tr.slug] || ""),
                      )?.name || "— No mapping —"}
                    </span>
                  }
                >
                  <Select
                    className="select-xs flex-1"
                    value={draft[tr.slug] || ""}
                    onChange={(e) => {
                      setDraft((prev) => ({
                        ...prev,
                        [tr.slug]: e.target.value,
                      }));
                      setHasChanges(true);
                    }}
                    options={[
                      { value: "", label: "— No mapping —" },
                      ...projectRoleList.map((pr: Role) => ({
                        value: pr.slug,
                        label: pr.name,
                      })),
                    ]}
                  />
                </PermissionGate>
              </div>
            ))}
            {teamRoleList.length === 0 && (
              <p className="text-xs text-base-content/50">
                No team roles defined yet.
              </p>
            )}
          </div>
          {hasChanges && (
            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-base-200">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(roleMap || {});
                  setHasChanges(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(draft)}
                loading={saveMutation.isPending}
              >
                Save Mapping
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SCOPE_TABS: { value: PermissionScope; label: string }[] = [
  { value: "org", label: "Organization" },
  { value: "team", label: "Team" },
  { value: "project", label: "Project" },
];

interface RoleForm {
  slug: string;
  name: string;
  description: string;
}

export default function PermissionsTab() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id ?? "";
  const qc = useQueryClient();

  const [scope, setScope] = useState<PermissionScope>("org");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [permTarget, setPermTarget] = useState<Role | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedRes, setExpandedRes] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [showMyPerms, setShowMyPerms] = useState(false);

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["permissions-roles", orgId, scope],
    queryFn: () => api.permissions.roles.list(orgId, scope),
    enabled: !!orgId,
  });

  const { data: allPermissions } = useQuery({
    queryKey: ["permissions-list", orgId, scope],
    queryFn: () => api.permissions.list(orgId, scope),
    enabled: !!orgId,
  });

  const { data: myPerms } = useQuery<ScopePermissionsResponse>({
    queryKey: ["org-my-permissions", orgId],
    queryFn: () => api.permissions.myPermissions(orgId),
    enabled: !!orgId && showMyPerms,
    staleTime: 30_000,
  });

  const permissionsByResource = useCallback(() => {
    if (!allPermissions) return new Map<string, Permission[]>();
    const map = new Map<string, Permission[]>();
    for (const p of allPermissions) {
      const list = map.get(p.resource) || [];
      list.push(p);
      map.set(p.resource, list);
    }
    return map;
  }, [allPermissions]);

  const createMutation = useMutation({
    mutationFn: (data: {
      scope: string;
      slug: string;
      name: string;
      description?: string;
    }) => api.permissions.roles.create(orgId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setShowCreate(false);
      setError("");
      toast.success("Role created");
    },
    onError: (err: Error) =>
      setError(err instanceof ApiError ? err.message : "Failed to create role"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string };
    }) => api.permissions.roles.update(orgId, id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setEditTarget(null);
      setError("");
    },
    onError: (err: Error) =>
      setError(err instanceof ApiError ? err.message : "Failed to update role"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.permissions.roles.delete(orgId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setDeleteTarget(null);
      toast.success("Role deleted");
    },
    onError: (err: Error) => {
      const msg =
        err instanceof ApiError ? err.message : "Failed to delete role";
      toast.error(msg);
    },
  });

  const setPermissionsMutation = useMutation({
    mutationFn: ({ roleId, permIds }: { roleId: string; permIds: string[] }) =>
      api.permissions.roles.setPermissions(orgId, roleId, permIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setPermTarget(null);
      setError("");
      toast.success("Permissions updated");
    },
    onError: (err: Error) =>
      setError(
        err instanceof ApiError ? err.message : "Failed to update permissions",
      ),
  });

  const createForm = useForm<RoleForm>();
  const editForm = useForm<RoleForm>();

  useEffect(() => {
    if (editTarget) {
      editForm.reset({
        slug: editTarget.slug,
        name: editTarget.name,
        description: editTarget.description || "",
      });
    }
  }, [editTarget, editForm]);

  useEffect(() => {
    if (permTarget?.permissions) {
      setSelectedPermIds(new Set(permTarget.permissions.map((p) => p.id)));
      setExpandedRes(new Set(permTarget.permissions.map((p) => p.resource)));
    } else {
      setSelectedPermIds(new Set());
    }
  }, [permTarget]);

  const togglePermission = useCallback((permId: string) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  }, []);

  const toggleResource = useCallback((resource: string) => {
    setExpandedRes((prev) => {
      const next = new Set(prev);
      if (next.has(resource)) next.delete(resource);
      else next.add(resource);
      return next;
    });
  }, []);

  if (!currentOrg) return null;
  if (rolesLoading) return <LoadingPage />;

  const handleCreate = (data: RoleForm) => {
    createMutation.mutate({
      scope,
      slug: data.slug,
      name: data.name,
      description: data.description || undefined,
    });
  };

  const handleEdit = (data: RoleForm) => {
    if (!editTarget) return;
    updateMutation.mutate({
      id: editTarget.id,
      data: { name: data.name, description: data.description || undefined },
    });
  };

  const handleSetPermissions = () => {
    if (!permTarget) return;
    setPermissionsMutation.mutate({
      roleId: permTarget.id,
      permIds: Array.from(selectedPermIds),
    });
  };

  const grouped = permissionsByResource();
  const roleList = roles || [];

  return (
    <div className="space-y-4">
      {/* Scope tabs + New Role button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs
          tabs={SCOPE_TABS.map((t) => ({ id: t.value, label: t.label }))}
          activeTab={scope}
          onChange={(id) => setScope(id as PermissionScope)}
          variant="boxed"
          size="sm"
        />
        <PermissionGate resource="roles" action="create">
          <Button
            size="sm"
            onClick={() => {
              setShowCreate(true);
              setError("");
              createForm.reset({ slug: "", name: "", description: "" });
            }}
          >
            <Plus className="w-4 h-4" /> New Role
          </Button>
        </PermissionGate>
      </div>

      {/* Your Effective Permissions */}
      <div className="collapse collapse-arrow bg-base-200/50 border border-base-300 rounded-lg">
        <input
          type="checkbox"
          checked={showMyPerms}
          onChange={() => setShowMyPerms((v) => !v)}
        />
        <div className="collapse-title text-sm font-medium flex items-center gap-2">
          <Shield className="w-4 h-4 text-info" /> Your Effective Permissions
        </div>
        {showMyPerms && (
          <div className="collapse-content">
            {myPerms ? (
              <div className="space-y-2">
                <div className="text-xs">
                  <span className="font-medium">Role:</span>{" "}
                  <span className="badge badge-sm badge-primary">
                    {myPerms.role}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {myPerms.permissions.map((p) => (
                    <span
                      key={`${p.resource}.${p.action}`}
                      className="badge badge-ghost badge-xs font-mono"
                    >
                      {p.resource}.{p.action}
                    </span>
                  ))}
                </div>
                {myPerms.permissions.length === 0 && (
                  <p className="text-xs text-base-content/50">
                    No permissions resolved.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-base-content/50">Loading…</p>
            )}
          </div>
        )}
      </div>

      {/* Roles table */}
      {roleList.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-8 h-8" />}
          title="No roles"
          description={`No ${scope}-level roles yet.`}
        />
      ) : (
        <Card>
          <div className="w-full overflow-x-auto">
            <table className="table table-sm w-full">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Description</th>
                  <th>Permissions</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roleList.map((role: Role) => (
                  <tr key={role.id} className="hover">
                    <td>
                      <div className="flex items-center gap-2">
                        {role.is_system ? (
                          <Lock className="w-3.5 h-3.5 text-base-content/40" />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-primary" />
                        )}
                        <span className="font-medium text-sm">{role.name}</span>
                        <span className="badge badge-ghost badge-xs">
                          {role.slug}
                        </span>
                        {role.is_system && (
                          <span className="badge badge-outline badge-xs">
                            System
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-base-content/60 line-clamp-1 max-w-[200px]">
                        {role.description || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-sm badge-ghost">
                        {role.permissions?.length ?? 0}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <div className="dropdown dropdown-end dropdown-left">
                          <div
                            tabIndex={0}
                            role="button"
                            className="btn btn-ghost btn-xs btn-square"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </div>
                          <ul
                            tabIndex={0}
                            className="dropdown-content z-[100] menu p-1 shadow-lg bg-base-100/95 backdrop-blur-[20px] rounded-box w-44 border border-base-200"
                          >
                            <PermissionGate resource="roles" action="update">
                              <li>
                                <button
                                  onClick={() => {
                                    setPermTarget(role);
                                    setError("");
                                  }}
                                  className="text-sm"
                                >
                                  <Shield className="w-3.5 h-3.5" /> Edit
                                  Permissions
                                </button>
                              </li>
                            </PermissionGate>
                            {!role.is_system && (
                              <>
                                <PermissionGate resource="roles" action="update">
                                  <li>
                                    <button
                                      onClick={() => {
                                        setEditTarget(role);
                                        setError("");
                                      }}
                                      className="text-sm"
                                    >
                                      <Pencil className="w-3.5 h-3.5" /> Edit Role
                                    </button>
                                  </li>
                                </PermissionGate>
                                <PermissionGate resource="roles" action="delete">
                                  <li>
                                    <button
                                      onClick={() => setDeleteTarget(role)}
                                      className="text-sm text-error"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                  </li>
                                </PermissionGate>
                              </>
                            )}
                          </ul>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Role Hierarchy Info — shown only on Org scope */}
      {scope === "org" && (
        <div className="border border-base-200 rounded-lg p-4 bg-base-200/30">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-base-content/50 mt-0.5 shrink-0" />
            <div className="space-y-2 w-full">
              <h3 className="text-sm font-semibold">Role Inheritance Chain</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex flex-col items-center gap-1">
                  <span className="badge badge-primary badge-sm">Org Role</span>
                  <span className="text-base-content/50">
                    owner · admin · member · viewer
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-base-content/40 shrink-0" />
                <div className="flex flex-col items-center gap-1">
                  <span className="badge badge-secondary badge-sm">
                    Team Role
                  </span>
                  <span className="text-base-content/50">
                    assigned at team membership
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-base-content/40 shrink-0" />
                <div className="flex flex-col items-center gap-1">
                  <span className="badge badge-accent badge-sm">
                    Project Role
                  </span>
                  <span className="text-base-content/50">
                    via team mapping or direct
                  </span>
                </div>
              </div>
              <p className="text-xs text-base-content/50">
                To create custom team or project roles (assignable in member
                management), switch to the
                <strong className="font-semibold"> Team </strong>or
                <strong className="font-semibold"> Project </strong>tab and
                click
                <strong className="font-semibold"> New Role</strong>. The team →
                project role mapping is configured under the Team tab.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Team → Project Role Mapping — shown only on Team scope */}
      {scope === "team" && <TeamProjectRoleMapSection orgId={orgId} />}

      {/* Create Role Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Role"
      >
        <form
          onSubmit={createForm.handleSubmit(handleCreate)}
          className="space-y-4"
        >
          {error && (
            <Alert variant="error" className="text-sm">
              {error}
            </Alert>
          )}
          <Input
            label="Slug"
            placeholder="e.g. project_manager"
            {...createForm.register("slug", { required: "Slug is required" })}
            error={createForm.formState.errors.slug?.message}
          />
          <Input
            label="Display Name"
            placeholder="e.g. Project Manager"
            {...createForm.register("name", { required: "Name is required" })}
            error={createForm.formState.errors.name?.message}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            {...createForm.register("description")}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Role"
      >
        <form
          onSubmit={editForm.handleSubmit(handleEdit)}
          className="space-y-4"
        >
          {error && (
            <Alert variant="error" className="text-sm">
              {error}
            </Alert>
          )}
          <Input
            label="Display Name"
            {...editForm.register("name", { required: "Name is required" })}
            error={editForm.formState.errors.name?.message}
          />
          <Textarea label="Description" {...editForm.register("description")} />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Permission Editor Modal */}
      <Modal
        open={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions: ${permTarget?.name ?? ""}`}
        className="max-w-2xl"
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {error && (
            <Alert variant="error" className="text-sm">
              {error}
            </Alert>
          )}
          {Array.from(grouped.entries()).map(([resource, perms]) => {
            const selectedCount = perms.filter((p) =>
              selectedPermIds.has(p.id),
            ).length;
            return (
              <div key={resource} className="border border-base-300 rounded-lg">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-base-200 transition-colors"
                  onClick={() => toggleResource(resource)}
                >
                  {expandedRes.has(resource) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="font-medium capitalize text-sm">
                    {resource}
                  </span>
                  <span className="text-xs text-base-content/50 ml-auto">
                    {selectedCount}/{perms.length}
                  </span>
                </button>
                {expandedRes.has(resource) && (
                  <div className="px-3 pb-2 space-y-0.5">
                    {perms.map((perm) => (
                      <label
                        key={perm.id}
                        className="flex items-center gap-2 cursor-pointer py-1 px-2 rounded hover:bg-base-200 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs checkbox-primary"
                          checked={selectedPermIds.has(perm.id)}
                          onChange={() => togglePermission(perm.id)}
                        />
                        <span className="font-mono text-xs">{perm.action}</span>
                        {perm.description && (
                          <span className="text-xs text-base-content/50">
                            {perm.description}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setPermTarget(null)}>
            Cancel
          </Button>
          <Button
            onClick={handleSetPermissions}
            loading={setPermissionsMutation.isPending}
          >
            <Check className="w-4 h-4" /> Save Permissions
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Role"
        message={`Delete role "${deleteTarget?.name}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
