"use client";

/**
 * ProjectCanvasPanel
 *
 * Lists all canvases (whiteboards) for a project and lets users create new
 * ones or open/delete existing ones. Opening a canvas swaps this gallery for
 * the full Excalidraw-based CanvasEditor in the same tab content area.
 */

import { Button } from "@/components/ui/button";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { api } from "@/lib/api";
import type { ProjectCanvas } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CanvasEditor } from "./canvas-editor";

interface ProjectCanvasPanelProps {
  orgId: string;
  projectId: string;
}

export function ProjectCanvasPanel({ orgId, projectId }: ProjectCanvasPanelProps) {
  const qc = useQueryClient();
  // Backend requires project:update for canvas create/edit/delete
  // (main.go's /canvases routes) - the Canvas tab itself is always visible
  // regardless of role, so this panel must gate its own actions.
  const { can: canProject } = useProjectPermissions(projectId);
  const canEditCanvas = canProject("project", "update");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const [openCanvasId, setOpenCanvasId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["canvases", orgId, projectId],
    queryFn: () => api.canvases.list(orgId, projectId),
  });

  const createMutation = useMutation({
    mutationFn: (t: string) => api.canvases.create(orgId, projectId, { title: t }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canvases", orgId, projectId] });
      setCreating(false);
      setTitle("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (canvasId: string) => api.canvases.delete(orgId, projectId, canvasId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canvases", orgId, projectId] });
    },
  });

  const handleCreate = () => {
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError("");
    createMutation.mutate(title.trim());
  };

  const canvases: ProjectCanvas[] = data?.data ?? [];

  if (openCanvasId) {
    return (
      <CanvasEditor
        orgId={orgId}
        projectId={projectId}
        canvasId={openCanvasId}
        onBack={() => setOpenCanvasId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Canvases</h2>
          {!isLoading && (
            <span className="badge badge-ghost badge-sm">{canvases.length}</span>
          )}
        </div>
        {canEditCanvas && (
          <Button
            size="sm"
            onClick={() => {
              setCreating(true);
              setTitle("");
              setTitleError("");
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            New Canvas
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && canEditCanvas && (
        <div className="card bg-base-100 border border-primary/30 rounded-xl p-4">
          <p className="text-sm font-medium mb-2">Canvas title</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                className={`input input-bordered input-sm w-full ${titleError ? "input-error" : ""}`}
                placeholder="e.g. Sprint Planning Board"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              {titleError && (
                <p className="text-error text-xs mt-1">{titleError}</p>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleCreate}
              loading={createMutation.isPending}
            >
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCreating(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-error text-xs mt-2">
              Failed to create canvas. Please try again.
            </p>
          )}
        </div>
      )}

      {/* Canvas list */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : canvases.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-base-content/50">
          <LayoutDashboard className="w-12 h-12 opacity-30" />
          <p className="font-medium">No canvases yet</p>
          <p className="text-sm">
            Create a canvas to visually plan your project with shapes and connectors.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {canvases.map((canvas) => (
            <CanvasCard
              key={canvas.id}
              canvas={canvas}
              canDelete={canEditCanvas}
              onOpen={() => setOpenCanvasId(canvas.id)}
              onDelete={() => deleteMutation.mutate(canvas.id)}
              deleting={deleteMutation.isPending && deleteMutation.variables === canvas.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasCard({
  canvas,
  canDelete,
  onOpen,
  onDelete,
  deleting,
}: {
  canvas: ProjectCanvas;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const shapeCount = canvas.state?.scene?.elements?.length ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="card bg-base-100 border border-base-200 rounded-xl hover:border-primary/40 hover:shadow-md transition-all group cursor-pointer text-left"
    >
      <div className="card-body p-4 gap-2">
        {/* Preview placeholder */}
        <div className="w-full h-28 rounded-lg bg-base-200/60 flex items-center justify-center mb-1">
          <LayoutDashboard className="w-8 h-8 text-base-content/20" />
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{canvas.title}</p>
            {canvas.description && (
              <p className="text-xs text-base-content/50 truncate mt-0.5">
                {canvas.description}
              </p>
            )}
            <p className="text-xs text-base-content/40 mt-1">
              {shapeCount} shape{shapeCount !== 1 ? "s" : ""}
            </p>
          </div>
          {canDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={deleting}
              aria-label="Delete canvas"
            >
              {deleting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
