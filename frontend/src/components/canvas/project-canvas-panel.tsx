"use client";

/**
 * ProjectCanvasPanel
 *
 * The project's Canvas tab: a single unified document+canvas surface backed
 * by a self-hosted AFFiNE instance. Fetches (provisioning on first access)
 * this project's AFFiNE doc and embeds it in an iframe. The backend returns
 * an AFFiNE session for the current user, which is set as cookies before the
 * iframe mounts — Zitadel's login pages can't be framed, so a login inside
 * the iframe would never render.
 *
 * The previous Excalidraw-based gallery/editor (canvas-editor.tsx and
 * friends) is left in the codebase, just no longer rendered from this tab.
 */

import { api } from "@/lib/api";
import type { ProjectAffineDoc } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

// Cookies are shared across ports, so on localhost a host-only cookie reaches
// AFFiNE. On split subdomains (app.x.com / affine.x.com) they need the common
// parent domain.
function setAffineCookies(doc: ProjectAffineDoc) {
  const app = window.location.hostname.split(".");
  const affine = new URL(doc.embed_url).hostname.split(".");
  const shared: string[] = [];
  while (app.length && affine.length && app[app.length - 1] === affine[affine.length - 1]) {
    shared.unshift(app.pop()!);
    affine.pop();
  }
  const domain = shared.length >= 2 ? `; domain=.${shared.join(".")}` : "";
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  for (const c of doc.cookies) {
    const expires = c.expires ? `; expires=${new Date(c.expires * 1000).toUTCString()}` : "";
    document.cookie = `${c.name}=${c.value}; path=/; samesite=lax${domain}${expires}${secure}`;
  }
}

interface ProjectCanvasPanelProps {
  orgId: string;
  projectId: string;
}

export function ProjectCanvasPanel({ orgId, projectId }: ProjectCanvasPanelProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["affine-doc", orgId, projectId],
    queryFn: async () => {
      const doc = await api.affineDoc.get(orgId, projectId);
      setAffineCookies(doc);
      return doc;
    },
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
