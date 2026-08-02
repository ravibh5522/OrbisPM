"use client";

import { PermissionGate } from "@/components/permission-gate";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
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
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sharedFilter, setSharedFilter] = useState<"" | "shared" | "private">(
    "",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const updateSearch = (v: string) => {
    setSearch(v);
  };

  const updateSharedFilter = (v: "" | "shared" | "private") => {
    setSharedFilter(v);
    setPage(0);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSharedFilter("");
    setPage(0);
  };

  const { data: templates, isLoading } = useQuery({
    queryKey: [
      "templates",
      currentOrg?.id,
      page,
      debouncedSearch,
      sharedFilter,
    ],
    queryFn: () =>
      api.templates.list(currentOrg!.id, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
        shared:
          sharedFilter === "shared"
            ? "true"
            : sharedFilter === "private"
              ? "false"
              : undefined,
        sort_by: "name",
        sort_order: "asc",
      }),
    enabled: !!currentOrg,
  });

  const activeFilterCount = [sharedFilter].filter(Boolean).length;

  const total = templates?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const items = templates?.data || [];

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
    <div className="flex h-full flex-col">
      <PageHeader
        title="Templates"
        description="Reusable task templates for your projects"
        actions={
          <div className="flex gap-2">
            <PermissionGate resource="templates" action="create">
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

      {/* Search + Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-base-content/85" />
          <input
            type="text"
            placeholder="Search templates..."
            className="h-10 w-full rounded-xl search-anchor-surface bg-transparent px-3 pl-8 pr-9 text-sm text-base-content placeholder:text-base-content/45 focus:outline-none focus:ring-2 focus:ring-oklch(64%_0.18_180_/_0.35)"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-100/45 hover:text-base-content"
              onClick={() => updateSearch("")}
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant={showFilters ? "primary" : "ghost"}
          className="gap-1"
          onClick={() => setShowFilters((p) => !p)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-xs badge-secondary">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="flex-1" />
        <span className="text-sm text-base-content/50">
          {total} template{total !== 1 ? "s" : ""}
        </span>
      </div>

      {showFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-base-200 p-3">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm font-medium">Type:</span>
            <Select
              className="select-sm"
              value={sharedFilter}
              onChange={(e) =>
                updateSharedFilter(e.target.value as "" | "shared" | "private")
              }
              options={[
                { value: "", label: "All" },
                { value: "shared", label: "Shared" },
                { value: "private", label: "Private" },
              ]}
            />
          </div>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="xs" onClick={clearFilters}>
              <X className="w-3 h-3" /> Clear all
            </Button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-16 h-16" />}
          title={
            search || sharedFilter
              ? "No matching templates"
              : "No templates yet"
          }
          description={
            search || sharedFilter
              ? "Try adjusting your search or filters"
              : "Create templates to quickly scaffold tasks in projects"
          }
          action={
            search || sharedFilter ? (
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <PermissionGate resource="templates" action="create">
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" /> Create Template
                </Button>
              </PermissionGate>
            )
          }
        />
      ) : (
        <div className="min-h-0 flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((tpl: TaskTemplate) => (
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
                    <Button
                      variant="ghost"
                      size="xs"
                      className="btn-square"
                      title="Export JSON"
                      onClick={() =>
                        api.templates.export(currentOrg!.id, tpl.id, tpl.name)
                      }
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <PermissionGate resource="projects" action="update">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="btn-square"
                        onClick={() => setEditTarget(tpl)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </PermissionGate>
                    <PermissionGate resource="projects" action="delete">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="btn-square"
                        onClick={() => setDeleteTarget(tpl)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
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
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
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
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
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
