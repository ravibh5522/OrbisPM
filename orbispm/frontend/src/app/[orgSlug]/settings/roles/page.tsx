"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { Plus, Shield, Trash2, Pencil, Calendar, Check, X, MoreHorizontal, Eye } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { CustomRole } from "@/types/domain";
import { RequireAdmin } from "@/components/permission-gate";

/**
 * Permission categories and their actions.
 * Stored in the DB as: { "projects": { "create": true, "read": true, ... }, "tasks": {...} }
 */
const PERMISSION_CATEGORIES = [
  {
    key: "projects",
    label: "Projects",
    actions: ["create", "read", "update", "delete", "manage_members"],
  },
  {
    key: "tasks",
    label: "Tasks",
    actions: ["create", "read", "update", "delete", "assign", "review"],
  },
  {
    key: "teams",
    label: "Teams",
    actions: ["create", "read", "update", "delete", "manage_members"],
  },
  {
    key: "members",
    label: "Members",
    actions: ["invite", "read", "update_role", "remove"],
  },
  {
    key: "billing",
    label: "Billing",
    actions: ["read", "manage"],
  },
  {
    key: "settings",
    label: "Settings",
    actions: ["read", "update"],
  },
] as const;

type Permissions = Record<string, Record<string, boolean>>;

interface RoleForm {
  name: string;
  description: string;
}

function buildEmptyPermissions(): Permissions {
  const perms: Permissions = {};
  for (const cat of PERMISSION_CATEGORIES) {
    perms[cat.key] = {};
    for (const action of cat.actions) {
      perms[cat.key][action] = false;
    }
  }
  return perms;
}

function normalizePermissions(raw: Record<string, unknown> | undefined): Permissions {
  const result = buildEmptyPermissions();
  if (!raw) return result;
  for (const cat of PERMISSION_CATEGORIES) {
    const catVal = raw[cat.key];
    if (catVal && typeof catVal === "object") {
      for (const action of cat.actions) {
        result[cat.key][action] = !!(catVal as Record<string, unknown>)[action];
      }
    }
  }
  return result;
}

function countPermissions(perms: Permissions): number {
  let count = 0;
  for (const cat of Object.values(perms)) {
    for (const val of Object.values(cat)) {
      if (val) count++;
    }
  }
  return count;
}

function totalPermissions(): number {
  return PERMISSION_CATEGORIES.reduce((sum, c) => sum + c.actions.length, 0);
}

export default function RolesPage() {
  return (
    <RequireAdmin>
      <RolesPageContent />
    </RequireAdmin>
  );
}

function RolesPageContent() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);
  const [editTarget, setEditTarget] = useState<CustomRole | null>(null);
  const [viewTarget, setViewTarget] = useState<CustomRole | null>(null);
  const [editPerms, setEditPerms] = useState<Permissions>(buildEmptyPermissions());
  const [createPerms, setCreatePerms] = useState<Permissions>(buildEmptyPermissions());
  const [error, setError] = useState("");

  const { data: roles, isLoading } = useQuery({
    queryKey: ["custom-roles", currentOrg?.id],
    queryFn: () => api.customRoles.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const createFormMethods = useForm<RoleForm>();
  const editFormMethods = useForm<RoleForm>();

  // Toggle a permission in a permissions state object
  const togglePerm = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Permissions>>, category: string, action: string) => {
      setter((prev) => ({
        ...prev,
        [category]: { ...prev[category], [action]: !prev[category]?.[action] },
      }));
    },
    []
  );

  // Toggle all permissions for a category
  const toggleCategory = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Permissions>>, category: string, enable: boolean) => {
      setter((prev) => {
        const cat = PERMISSION_CATEGORIES.find((c) => c.key === category);
        if (!cat) return prev;
        const actions: Record<string, boolean> = {};
        for (const a of cat.actions) actions[a] = enable;
        return { ...prev, [category]: actions };
      });
    },
    []
  );

  const createMutation = useMutation({
    mutationFn: (data: RoleForm) =>
      api.customRoles.create(currentOrg!.id, { ...data, permissions: createPerms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setShowCreate(false);
      createFormMethods.reset();
      setCreatePerms(buildEmptyPermissions());
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create role"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: RoleForm) =>
      api.customRoles.update(currentOrg!.id, editTarget!.id, {
        name: data.name,
        description: data.description,
        permissions: editPerms,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setEditTarget(null);
      editFormMethods.reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to update role"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customRoles.delete(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setDeleteTarget(null);
    },
  });

  const openEdit = (role: CustomRole) => {
    setEditTarget(role);
    editFormMethods.setValue("name", role.name);
    editFormMethods.setValue("description", role.description || "");
    setEditPerms(normalizePermissions(role.permissions));
    setError("");
  };

  if (isLoading) return <LoadingPage />;

  const roleList = roles?.data || [];

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <PageHeader
        title="Custom Roles"
        description={`Define custom permissions — ${roleList.length} role${roleList.length !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => { setShowCreate(true); setError(""); setCreatePerms(buildEmptyPermissions()); }}>
            <Plus className="w-4 h-4" /> New Role
          </Button>
        }
      />

      {roleList.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-16 h-16" />}
          title="No custom roles"
          description="Create custom roles with granular permissions for your organization"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Create Role
            </Button>
          }
        />
      ) : (
        <Card className="flex-1">
          <div className="w-full">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Role Name</th>
                  <th>Description</th>
                  <th>Permissions</th>
                  <th><Calendar className="w-3.5 h-3.5 inline mr-1" />Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roleList.map((role: CustomRole) => {
                  const perms = normalizePermissions(role.permissions);
                  const count = countPermissions(perms);
                  const total = totalPermissions();
                  return (
                    <tr key={role.id} className="hover">
                      <td>
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          <span className="font-medium text-sm">{role.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm text-base-content/60 line-clamp-1 max-w-xs">
                          {role.description || "—"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono">
                            {count}/{total}
                          </span>
                          <progress
                            className="progress progress-primary w-20"
                            value={count}
                            max={total}
                          />
                        </div>
                      </td>
                      <td>
                        <span className="text-sm text-base-content/60">
                          {role.created_at ? formatDate(role.created_at) : "—"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <div className="dropdown dropdown-end dropdown-left">
                            <div tabIndex={0} role="button" className="btn btn-ghost btn-xs btn-square">
                              <MoreHorizontal className="w-4 h-4" />
                            </div>
                            <ul tabIndex={0} className="dropdown-content z-[100] menu p-1 shadow-lg bg-base-100 rounded-box w-40 border border-base-200">
                              <li>
                                <button onClick={() => setViewTarget(role)} className="text-sm">
                                  <Eye className="w-3.5 h-3.5" /> View
                                </button>
                              </li>
                              <li>
                                <button onClick={() => openEdit(role)} className="text-sm">
                                  <Pencil className="w-3.5 h-3.5" /> Edit
                                </button>
                              </li>
                              <li>
                                <button onClick={() => setDeleteTarget(role)} className="text-sm text-error">
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── Create Role Modal ─── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); createFormMethods.reset(); setError(""); }}
        title="New Custom Role"
        className="max-w-2xl"
      >
        {error && <div className="alert alert-error mb-4 text-sm"><span>{error}</span></div>}
        <form
          onSubmit={createFormMethods.handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Role Name"
              placeholder="Project Manager"
              {...createFormMethods.register("name", { required: "Name is required" })}
              error={createFormMethods.formState.errors.name?.message}
            />
            <Textarea
              label="Description"
              placeholder="Optional description"
              {...createFormMethods.register("description")}
            />
          </div>

          <PermissionEditor perms={createPerms} onChange={setCreatePerms} togglePerm={togglePerm} toggleCategory={toggleCategory} />

          <div className="modal-action">
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); createFormMethods.reset(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>Create Role</Button>
          </div>
        </form>
      </Modal>

      {/* ─── Edit Role Modal ─── */}
      {editTarget && (
        <Modal
          open
          onClose={() => { setEditTarget(null); editFormMethods.reset(); setError(""); }}
          title={`Edit: ${editTarget.name}`}
          className="max-w-2xl"
        >
          {error && <div className="alert alert-error mb-4 text-sm"><span>{error}</span></div>}
          <form
            onSubmit={editFormMethods.handleSubmit((data) => updateMutation.mutate(data))}
            className="space-y-5"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Role Name"
                {...editFormMethods.register("name", { required: "Name is required" })}
                error={editFormMethods.formState.errors.name?.message}
              />
              <Textarea
                label="Description"
                {...editFormMethods.register("description")}
              />
            </div>

            <PermissionEditor perms={editPerms} onChange={setEditPerms} togglePerm={togglePerm} toggleCategory={toggleCategory} />

            <div className="modal-action">
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={updateMutation.isPending}>Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── View Role Modal ─── */}
      {viewTarget && (
        <Modal
          open
          onClose={() => setViewTarget(null)}
          title={viewTarget.name}
          className="max-w-2xl"
        >
          {viewTarget.description && (
            <p className="text-sm text-base-content/60 mb-4">{viewTarget.description}</p>
          )}
          <PermissionEditor perms={normalizePermissions(viewTarget.permissions)} readOnly />
          <div className="modal-action">
            <Button variant="ghost" onClick={() => setViewTarget(null)}>Close</Button>
            <Button onClick={() => { setViewTarget(null); openEdit(viewTarget); }}>
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          </div>
        </Modal>
      )}

      {/* ─── Delete Confirm ─── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Role"
        message={`Permanently delete the role "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* ─────────────────────────── Permission Editor Component ─────────────────────────── */

function PermissionEditor({
  perms,
  onChange,
  togglePerm,
  toggleCategory,
  readOnly = false,
}: {
  perms: Permissions;
  onChange?: React.Dispatch<React.SetStateAction<Permissions>>;
  togglePerm?: (setter: React.Dispatch<React.SetStateAction<Permissions>>, category: string, action: string) => void;
  toggleCategory?: (setter: React.Dispatch<React.SetStateAction<Permissions>>, category: string, enable: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">Permissions</h4>
        <span className="text-xs text-base-content/50">
          {countPermissions(perms)} of {totalPermissions()} enabled
        </span>
      </div>
      <div className="border border-base-200 rounded-lg divide-y divide-base-200">
        {PERMISSION_CATEGORIES.map((cat) => {
          const catPerms = perms[cat.key] || {};
          const enabledCount = Object.values(catPerms).filter(Boolean).length;
          const allEnabled = enabledCount === cat.actions.length;

          return (
            <div key={cat.key} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{cat.label}</span>
                  <span className="badge badge-xs badge-ghost">
                    {enabledCount}/{cat.actions.length}
                  </span>
                </div>
                {!readOnly && onChange && toggleCategory && (
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => toggleCategory(onChange, cat.key, !allEnabled)}
                  >
                    {allEnabled ? "Revoke All" : "Grant All"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {cat.actions.map((action) => {
                  const enabled = !!catPerms[action];
                  if (readOnly) {
                    return (
                      <span
                        key={action}
                        className={`badge badge-sm gap-1 ${enabled ? "badge-success" : "badge-ghost badge-outline opacity-40"}`}
                      >
                        {enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {action.replace("_", " ")}
                      </span>
                    );
                  }
                  return (
                    <label
                      key={action}
                      className={`badge badge-sm gap-1 cursor-pointer select-none transition-colors ${
                        enabled ? "badge-success" : "badge-ghost badge-outline hover:badge-success hover:badge-outline"
                      }`}
                      onClick={() => onChange && togglePerm && togglePerm(onChange, cat.key, action)}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        readOnly
                        className="hidden"
                      />
                      {enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {action.replace("_", " ")}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
