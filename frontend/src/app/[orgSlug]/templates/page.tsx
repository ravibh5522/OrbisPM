"use client";

import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingPage,
  PageHeader,
} from "@/components/ui/shared";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { TaskTemplate } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface TemplateForm {
  name: string;
  description: string;
}

const PAGE_SIZE = 12;

export default function TemplatesPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);
  const orgSlug = currentOrg?.slug ?? "";

  useEffect(() => {
    setBreadcrumb({ label: "Templates", backHref: `/${orgSlug}` });
    return () => setBreadcrumb(null);
  }, [orgSlug, setBreadcrumb]);

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<TaskTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskTemplate | null>(null);
  const [viewTarget, setViewTarget] = useState<TaskTemplate | null>(null);
  const [error, setError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", currentOrg?.id],
    queryFn: () => api.templates.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const filtered = useMemo(() => {
    const all = templates?.data || [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (t: TaskTemplate) =>
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q),
    );
  }, [templates?.data, search]);

  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors },
  } = useForm<TemplateForm>();

  const createMutation = useMutation({
    mutationFn: (data: TemplateForm) =>
      api.templates.create(currentOrg!.id, {
        ...data,
        structure: {},
        is_shared: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setShowCreate(false);
      reset();
      setError("");
      toast.success("Template created");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to create template"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.templates.delete(currentOrg!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setDeleteTarget(null);
      toast.success("Template deleted");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: TemplateForm & { id: string }) =>
      api.templates.update(currentOrg!.id, data.id, {
        name: data.name,
        description: data.description,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setEditTarget(null);
      setError("");
      toast.success("Template updated");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to update template"),
  });

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      await api.templates.import(currentOrg!.id, {
        name: data.name || f.name.replace(/\.json$/, ""),
        description: data.description || "",
        structure: data.structure || {},
        is_shared: data.is_shared ?? true,
      });
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch {
      setError("Failed to import template. Make sure the file is valid JSON.");
    }
    if (importRef.current) importRef.current.value = "";
  };

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Reusable task templates for your projects"
        actions={
          <div className="flex gap-2">
            <PermissionGate resource="projects" action="create">
              <Button
                variant="outline"
                onClick={() => importRef.current?.click()}
              >
                <Upload className="w-4 h-4" /> Import JSON
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> New Template
              </Button>
            </PermissionGate>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        }
      />

      {/* Search bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search templates..."
            className="input input-bordered input-sm w-full pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          {search && (
            <button
              className="absolute right-2 top-2 btn btn-ghost btn-xs btn-circle"
              onClick={() => {
                setSearch("");
                setPage(0);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex-1" />
        <span className="text-sm text-base-content/50">
          {total} template{total !== 1 ? "s" : ""}
        </span>
      </div>

      {paginated.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-16 h-16" />}
          title={search ? "No matching templates" : "No templates yet"}
          description={
            search
              ? "Try a different search term"
              : "Create templates to quickly scaffold tasks in projects"
          }
          action={
            search ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }}
              >
                Clear search
              </Button>
            ) : (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> Create Template
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map((tpl: TaskTemplate) => (
            <Card key={tpl.id} compact>
              <div
                className="cursor-pointer"
                onClick={() => setViewTarget(tpl)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{tpl.name}</h3>
                    {tpl.description && (
                      <p className="text-sm text-base-content/60 mt-1 line-clamp-2">
                        {tpl.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {tpl.is_shared && (
                      <span className="badge badge-xs badge-primary">
                        Shared
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 text-sm text-base-content/50">
                  <span>Created {formatDate(tpl.created_at)}</span>
                  <div
                    className="flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="btn btn-ghost btn-xs btn-square"
                      title="Export JSON"
                      onClick={() =>
                        api.templates.export(currentOrg!.id, tpl.id, tpl.name)
                      }
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <PermissionGate resource="projects" action="update">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={() => setEditTarget(tpl)}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </PermissionGate>
                    <PermissionGate resource="projects" action="delete">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={() => setDeleteTarget(tpl)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </PermissionGate>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {/* View modal */}
      {viewTarget && (
        <Modal open onClose={() => setViewTarget(null)} title={viewTarget.name}>
          {viewTarget.description && (
            <p className="text-base-content/60 mb-4">
              {viewTarget.description}
            </p>
          )}
          <div className="bg-base-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Structure</h4>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(viewTarget.structure, null, 2)}
            </pre>
          </div>
          <div className="modal-action">
            <Button variant="ghost" onClick={() => setViewTarget(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <EditTemplateModal
          template={editTarget}
          onClose={() => {
            setEditTarget(null);
            setError("");
          }}
          onSubmit={(data) =>
            updateMutation.mutate({ ...data, id: editTarget.id })
          }
          loading={updateMutation.isPending}
          error={error}
        />
      )}

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          reset();
          setError("");
        }}
        title="New Template"
      >
        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-4"
        >
          <Input
            label="Template Name"
            placeholder="Sprint Template"
            {...register("name", { required: "Name is required" })}
            error={formErrors.name?.message}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            {...register("description")}
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
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Template"
        message={`Delete "${deleteTarget?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function EditTemplateModal({
  template,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  template: TaskTemplate;
  onClose: () => void;
  onSubmit: (data: TemplateForm) => void;
  loading: boolean;
  error: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<TemplateForm>({
    defaultValues: {
      name: template.name,
      description: template.description || "",
    },
  });

  return (
    <Modal open onClose={onClose} title="Edit Template">
      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Template Name"
          placeholder="Sprint Template"
          {...register("name", { required: "Name is required" })}
          error={formErrors.name?.message}
        />
        <Textarea
          label="Description"
          placeholder="Optional description"
          {...register("description")}
        />
        <div className="modal-action">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
