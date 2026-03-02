"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { Plus, KeyRound, Trash2, Copy } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { APIKey } from "@/types/domain";
import { RequireAdmin } from "@/components/permission-gate";

interface ApiKeyForm {
  name: string;
  scopes: string;
}

export default function ApiKeysPage() {
  return (
    <RequireAdmin>
      <ApiKeysPageContent />
    </RequireAdmin>
  );
}

function ApiKeysPageContent() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<APIKey | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys", currentOrg?.id],
    queryFn: () => api.apiKeys.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { register, handleSubmit, reset, formState: { errors: formErrors } } = useForm<ApiKeyForm>();

  const createMutation = useMutation({
    mutationFn: (data: ApiKeyForm) =>
      api.apiKeys.create(currentOrg!.id, {
        name: data.name,
        scopes: data.scopes.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setShowCreate(false);
      reset();
      setError("");
      if (result.raw_key) {
        setNewKey(result.raw_key);
      }
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create API key"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.apiKeys.revoke(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Manage programmatic access to your organization"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Key
          </Button>
        }
      />

      {/* New key display */}
      {newKey && (
        <div className="alert alert-warning mb-6">
          <div>
            <h3 className="font-bold">Save your API key</h3>
            <p className="text-sm">This key will not be shown again.</p>
            <div className="flex items-center gap-2 mt-2">
              <code className="font-mono text-sm bg-base-200 px-2 py-1 rounded">{newKey}</code>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                }}
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setNewKey(null)}>Dismiss</button>
        </div>
      )}

      {(!keys?.data || keys.data.length === 0) ? (
        <EmptyState
          icon={<KeyRound className="w-16 h-16" />}
          title="No API keys"
          description="Create API keys for programmatic access"
          action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Key</Button>}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Scopes</th>
                  <th>Last Used</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.data.map((key: APIKey) => (
                  <tr key={key.id}>
                    <td className="font-medium">{key.name}</td>
                    <td><code className="text-xs">{key.key_prefix}...</code></td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {key.scopes.map((s) => (
                          <span key={s} className="badge badge-xs badge-outline">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="text-sm text-base-content/60">
                      {key.last_used_at ? formatDate(key.last_used_at) : "Never"}
                    </td>
                    <td className="text-sm text-base-content/60">{formatDate(key.created_at)}</td>
                    <td>
                      <button className="btn btn-ghost btn-xs text-error" onClick={() => setDeleteTarget(key)}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setError(""); }} title="New API Key">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <Input
            label="Key Name"
            placeholder="CI/CD Pipeline"
            {...register("name", { required: "Name is required" })}
            error={formErrors.name?.message}
          />
          <Input
            label="Scopes"
            placeholder="read, write"
            helperText="Comma-separated scopes"
            {...register("scopes", { required: "At least one scope required" })}
            error={formErrors.scopes?.message}
          />
          <div className="modal-action">
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create Key</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && revokeMutation.mutate(deleteTarget.id)}
        title="Revoke API Key"
        message={`Revoke "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Revoke"
        loading={revokeMutation.isPending}
      />
    </div>
  );
}
