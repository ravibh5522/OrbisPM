"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import {
  Shield,
  Trash2,
  Pencil,
  Plus,
  Lock,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Role, Permission, PermissionScope } from "@/types/domain";
import { RequireAdmin } from "@/components/permission-gate";

/* ═══════════════════════════════════════════════════════
   Team → Project Role Map Section
   ═══════════════════════════════════════════════════════ */

function TeamProjectRoleMapSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

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
    <Card>
      <h3 className="text-lg font-semibold mb-2">Team → Project Role Mapping</h3>
      <p className="text-sm text-base-content/60 mb-4">
        When a team is linked to a project, team members inherit a project role based on this mapping.
      </p>
      <div className="space-y-3">
        {teamRoleList.map((tr: Role) => (
          <div key={tr.slug} className="flex items-center gap-3">
            <span className="w-40 text-sm font-medium capitalize">{tr.name}</span>
            <span className="text-base-content/40">→</span>
            <select
              className="select select-bordered select-sm flex-1"
              value={draft[tr.slug] || ""}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, [tr.slug]: e.target.value }));
                setHasChanges(true);
              }}
            >
              <option value="">— No mapping —</option>
              {projectRoleList.map((pr: Role) => (
                <option key={pr.slug} value={pr.slug}>
                  {pr.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        {teamRoleList.length === 0 && (
          <p className="text-sm text-base-content/50">No team roles defined yet.</p>
        )}
      </div>
      {hasChanges && (
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-base-200">
          <Button variant="ghost" onClick={() => { setDraft(roleMap || {}); setHasChanges(false); }}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate(draft)} loading={saveMutation.isPending}>
            Save Mapping
          </Button>
        </div>
      )}
    </Card>
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

export default function PermissionsPage() {
  return (
    <RequireAdmin>
      <PermissionsPageContent />
    </RequireAdmin>
  );
}

function PermissionsPageContent() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id ?? "";
  const qc = useQueryClient();

  const [scope, setScope] = useState<PermissionScope>("org");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [permTarget, setPermTarget] = useState<Role | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set());
  const [expandedRes, setExpandedRes] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  // Fetch all roles for current scope
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["permissions-roles", orgId, scope],
    queryFn: () => api.permissions.roles.list(orgId, scope),
    enabled: !!orgId,
  });

  // Fetch all permissions for current scope (used in permission editor)
  const { data: allPermissions } = useQuery({
    queryKey: ["permissions-list", scope],
    queryFn: () => api.permissions.list(orgId, scope),
    enabled: !!orgId,
  });

  // Group permissions by resource
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

  // === Mutations ===

  const createMutation = useMutation({
    mutationFn: (data: { scope: string; slug: string; name: string; description?: string }) =>
      api.permissions.roles.create(orgId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setShowCreate(false);
      setError("");
    },
    onError: (err: Error) => {
      setError(err instanceof ApiError ? err.message : "Failed to create role");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string } }) =>
      api.permissions.roles.update(orgId, id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setEditTarget(null);
      setError("");
    },
    onError: (err: Error) => {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.permissions.roles.delete(orgId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setDeleteTarget(null);
    },
  });

  const setPermissionsMutation = useMutation({
    mutationFn: ({ roleId, permIds }: { roleId: string; permIds: string[] }) =>
      api.permissions.roles.setPermissions(orgId, roleId, permIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions-roles", orgId, scope] });
      setPermTarget(null);
      setError("");
    },
    onError: (err: Error) => {
      setError(err instanceof ApiError ? err.message : "Failed to update permissions");
    },
  });

  // Form hooks
  const createForm = useForm<RoleForm>();
  const editForm = useForm<RoleForm>();

  // When editing, pre-fill form
  useEffect(() => {
    if (editTarget) {
      editForm.reset({
        slug: editTarget.slug,
        name: editTarget.name,
        description: editTarget.description || "",
      });
    }
  }, [editTarget, editForm]);

  // When opening permission editor, pre-fill selection
  useEffect(() => {
    if (permTarget?.permissions) {
      setSelectedPermIds(new Set(permTarget.permissions.map((p) => p.id)));
      // Expand all resources
      const resources = new Set(permTarget.permissions.map((p) => p.resource));
      setExpandedRes(resources);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions & Roles"
        description="Manage DB-driven roles and fine-grained permissions"
        actions={
          <Button onClick={() => { setShowCreate(true); setError(""); createForm.reset({ slug: "", name: "", description: "" }); }}>
            <Plus className="w-4 h-4 mr-1" /> New Role
          </Button>
        }
      />

      {/* Scope tabs */}
      <div className="tabs tabs-bordered">
        {SCOPE_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`tab ${scope === tab.value ? "tab-active" : ""}`}
            onClick={() => setScope(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Roles list */}
      {!roles || roles.length === 0 ? (
        <EmptyState icon={<Shield className="w-8 h-8" />} title="No roles" description={`No ${scope}-level roles yet.`} />
      ) : (
        <div className="grid gap-4">
          {roles.map((role: Role) => (
            <Card key={role.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {role.is_system ? (
                  <Lock className="w-5 h-5 text-base-content/40" />
                ) : (
                  <Shield className="w-5 h-5 text-primary" />
                )}
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {role.name}
                    <span className="badge badge-ghost badge-sm">{role.slug}</span>
                    {role.is_system && <span className="badge badge-outline badge-sm">System</span>}
                  </div>
                  {role.description && (
                    <div className="text-sm text-base-content/60">{role.description}</div>
                  )}
                  <div className="text-xs text-base-content/40 mt-1">
                    {role.permissions?.length ?? 0} permissions
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPermTarget(role); setError(""); }}
                  title="Edit Permissions"
                >
                  <Shield className="w-4 h-4" />
                </Button>
                {!role.is_system && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditTarget(role); setError(""); }}
                      title="Edit Role"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(role)}
                      title="Delete Role"
                    >
                      <Trash2 className="w-4 h-4 text-error" />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Role Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Role">
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          {error && <div className="alert alert-error text-sm">{error}</div>}
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
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Role">
        <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
          {error && <div className="alert alert-error text-sm">{error}</div>}
          <Input
            label="Display Name"
            {...editForm.register("name", { required: "Name is required" })}
            error={editForm.formState.errors.name?.message}
          />
          <Textarea label="Description" {...editForm.register("description")} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setEditTarget(null)}>
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
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {error && <div className="alert alert-error text-sm">{error}</div>}
          {Array.from(grouped.entries()).map(([resource, perms]) => (
            <div key={resource} className="border border-base-300 rounded-lg">
              <button
                className="w-full flex items-center gap-2 p-3 hover:bg-base-200 transition-colors"
                onClick={() => toggleResource(resource)}
              >
                {expandedRes.has(resource) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span className="font-medium capitalize">{resource}</span>
                <span className="text-xs text-base-content/50 ml-auto">
                  {perms.filter((p) => selectedPermIds.has(p.id)).length}/{perms.length}
                </span>
              </button>
              {expandedRes.has(resource) && (
                <div className="px-3 pb-3 space-y-1">
                  {perms.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer py-1 px-2 rounded hover:bg-base-200">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={selectedPermIds.has(perm.id)}
                        onChange={() => togglePermission(perm.id)}
                      />
                      <span className="text-sm font-mono">{perm.action}</span>
                      {perm.description && (
                        <span className="text-xs text-base-content/50">{perm.description}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setPermTarget(null)}>
            Cancel
          </Button>
          <Button onClick={handleSetPermissions} loading={setPermissionsMutation.isPending}>
            <Check className="w-4 h-4 mr-1" /> Save Permissions
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

      {/* Team → Project Role Mapping */}
      <div className="mt-8">
        <TeamProjectRoleMapSection orgId={orgId} />
      </div>
    </div>
  );
}
