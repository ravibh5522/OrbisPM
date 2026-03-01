"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, LoadingPage, Badge, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { Plus, Webhook as WebhookIcon, Trash2 } from "lucide-react";
import type { Webhook } from "@/types/domain";

interface WebhookForm {
  url: string;
  events: string;
  secret: string;
}

export default function WebhooksPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [error, setError] = useState("");

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks", currentOrg?.id],
    queryFn: () => api.webhooks.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { register, handleSubmit, reset, formState: { errors: formErrors } } = useForm<WebhookForm>();

  const createMutation = useMutation({
    mutationFn: (data: WebhookForm) =>
      api.webhooks.create(currentOrg!.id, {
        url: data.url,
        events: data.events.split(",").map((e) => e.trim()).filter(Boolean),
        secret: data.secret || undefined,
        is_active: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setShowCreate(false);
      reset();
      setError("");
    },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : "Failed to create webhook"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.webhooks.delete(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader
        title="Webhooks"
        description="Receive events via HTTP callbacks"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Webhook
          </Button>
        }
      />

      {(!webhooks?.data || webhooks.data.length === 0) ? (
        <EmptyState
          icon={<WebhookIcon className="w-16 h-16" />}
          title="No webhooks configured"
          description="Add webhooks to receive real-time event notifications"
          action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Add Webhook</Button>}
        />
      ) : (
        <div className="space-y-3">
          {webhooks.data.map((wh: Webhook) => (
            <Card key={wh.id} compact>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{wh.url}</span>
                    <Badge variant={wh.is_active ? "badge-success" : "badge-ghost"}>
                      {wh.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {wh.events.map((ev) => (
                      <span key={ev} className="badge badge-xs badge-outline">{ev}</span>
                    ))}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm btn-square" onClick={() => setDeleteTarget(wh)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setError(""); }} title="New Webhook">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <Input
            label="URL"
            placeholder="https://example.com/webhook"
            {...register("url", { required: "URL is required" })}
            error={formErrors.url?.message}
          />
          <Input
            label="Events"
            placeholder="task.created, task.updated"
            helperText="Comma-separated event types"
            {...register("events", { required: "At least one event required" })}
            error={formErrors.events?.message}
          />
          <Input
            label="Secret"
            placeholder="Optional signing secret"
            {...register("secret")}
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
        title="Delete Webhook"
        message={`Delete webhook for ${deleteTarget?.url}?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
