"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingPage,
} from "@/components/ui/shared";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { APIKey } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface ApiKeyForm {
  name: string;
  scopes: string;
}

export default function ApiKeysTab() {
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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors },
  } = useForm<ApiKeyForm>();

  const createMutation = useMutation({
    mutationFn: (data: ApiKeyForm) =>
      api.apiKeys.create(currentOrg!.id, {
        name: data.name,
        scopes: data.scopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setShowCreate(false);
      reset();
      setError("");
      if (result.raw_key) setNewKey(result.raw_key);
      toast.success("API key created");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to create API key"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.apiKeys.revoke(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setDeleteTarget(null);
      toast.success("API key revoked");
    },
  });

  if (isLoading) return <LoadingPage />;

  const keyList = keys?.data || [];

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-base-content/60">
          Manage programmatic access to your organization
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New Key
        </Button>
      </div>

      {/* New key display */}
      {newKey && (
        <Alert
          variant="warning"
          title="Save your API key"
          className="mb-4"
          onDismiss={() => setNewKey(null)}
        >
          <p className="text-xs">This key will not be shown again.</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="font-mono text-xs bg-base-200 px-2 py-1 rounded">
              {newKey}
            </code>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => navigator.clipboard.writeText(newKey)}
            >
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
        </Alert>
      )}

      {keyList.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="w-16 h-16" />}
          title="No API keys"
          description="Create API keys for programmatic access"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Create Key
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="w-full overflow-x-auto">
            <table className="table w-full">
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
                {keyList.map((key: APIKey) => (
                  <tr key={key.id}>
                    <td className="font-medium">{key.name}</td>
                    <td>
                      <code className="text-xs">{key.key_prefix}...</code>
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {key.scopes.map((s) => (
                          <span
                            key={s}
                            className="badge badge-xs badge-outline"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-sm text-base-content/60">
                      {key.last_used_at
                        ? formatDate(key.last_used_at)
                        : "Never"}
                    </td>
                    <td className="text-sm text-base-content/60">
                      {formatDate(key.created_at)}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-error"
                        onClick={() => setDeleteTarget(key)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          reset();
          setError("");
        }}
        title="New API Key"
      >
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-4"
        >
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create Key
            </Button>
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
