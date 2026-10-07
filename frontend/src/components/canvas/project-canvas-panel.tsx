"use client";

/**
 * ProjectCanvasPanel
 *
 * The project's Canvas tab: a single unified document+canvas surface backed
 * by a self-hosted AFFiNE instance. Fetches (provisioning on first access)
 * this project's AFFiNE doc and embeds it in an iframe. SSO carries over via
 * the shared Zitadel login, so there's no separate auth step inside the
 * iframe once AFFiNE's own OIDC client is configured.
 *
 * The previous Excalidraw-based gallery/editor (canvas-editor.tsx and
 * friends) is left in the codebase, just no longer rendered from this tab.
 */

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

interface ProjectCanvasPanelProps {
  orgId: string;
  projectId: string;
}

export function ProjectCanvasPanel({ orgId, projectId }: ProjectCanvasPanelProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["affine-doc", orgId, projectId],
    queryFn: () => api.affineDoc.get(orgId, projectId),
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center gap-3 text-base-content/60 p-6">
        <AlertTriangle className="w-10 h-10 text-warning" />
        <p className="font-medium">Couldn't load the canvas</p>
        <p className="text-sm max-w-sm">
          {error instanceof Error ? error.message : "The document service is unavailable right now."}
        </p>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            "Try again"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <iframe
        title="Project canvas"
        src={data.embed_url}
        className="absolute inset-0 w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
