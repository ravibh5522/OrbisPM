"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { Plus, Shield, Trash2 } from "lucide-react";
import type { CustomRole } from "@/types/domain";

interface RoleForm {
  name: string;
  description: string;
}

export default function RolesPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);
  const [error, setError] = useState("");

  const { data: roles, isLoading } = useQuery({
    queryKey: ["custom-roles", currentOrg?.id],
    queryFn: () => api.customRoles.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { register, handleSubmit, reset, formState: { errors: formErrors } } = useForm<RoleForm>();

  const createMutation = useMutation({
    mutationFn: (data: RoleForm) =>
      api.customRoles.create(currentOrg!.id, { ...data, permissions: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setShowCreate(false);
      reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create role"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customRoles.delete(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader
        title="Custom Roles"
        description="Define custom permissions for your organization"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Role
          </Button>
        }
      />

      {(!roles?.data || roles.data.length === 0) ? (
        <EmptyState
          icon={<Shield className="w-16 h-16" />}
          title="No custom roles"
          description="Create custom roles with specific permissions"
          action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Role</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.data.map((role: CustomRole) => (
            <Card key={role.id} compact>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{role.name}</h3>
                  {role.description && (
                    <p className="text-sm text-base-content/60 mt-1">{role.description}</p>
                  )}
                  {role.permissions && Object.keys(role.permissions).length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {Object.keys(role.permissions).map((perm) => (
                        <span key={perm} className="badge badge-xs badge-outline">{perm}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-xs btn-square" onClick={() => setDeleteTarget(role)}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setError(""); }} title="New Custom Role">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <Input
            label="Role Name"
            placeholder="Project Manager"
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
        title="Delete Role"
        message={`Delete "${deleteTarget?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
