"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Silently prefetches key org data in the background so pages feel instant.
 * Runs once per org switch; skips if data already exists in the query cache.
 * Mounted in OrgLayout — no visible UI.
 */
export function DataPrefetcher() {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const orgRole = useAuthStore((s) => s.currentMembership?.role);
  const qc = useQueryClient();
  const ranForOrg = useRef<string | null>(null);

  useEffect(() => {
    if (!orgId || ranForOrg.current === orgId) return;
    ranForOrg.current = orgId;

    // Helper: prefetch only if not already cached
    const pf = <T,>(key: unknown[], fn: () => Promise<T>, stale = 60_000) => {
      if (!qc.getQueryData(key)) {
        qc.prefetchQuery({ queryKey: key, queryFn: fn, staleTime: stale });
      }
    };

    // Owner/admin sees all, others see only their own
    const isAdmin = orgRole === "owner" || orgRole === "admin";
    const mineParam = isAdmin ? {} : { mine: "true" };

    // ── Core org data ─────────────────────────────
    pf(["dashboard-stats", orgId], () => api.dashboard.stats(orgId), 120_000);
    pf(["projects", orgId], () => api.projects.list(orgId, mineParam));
    pf(["teams", orgId], () => api.teams.list(orgId, mineParam));
    pf(["org-members", orgId], () => api.members.list(orgId));

    // ── Chat sidebar — critical for instant messages page ──
    pf(["chat-sidebar"], () => api.chat.sidebar.get(), 60_000);

    // ── My tasks (dashboard) ──
    pf(["my-tasks", orgId], () => api.dashboard.myTasks(orgId));

    // ── Notifications ──
    pf(["notifications", orgId], () => api.notifications.list(orgId));

    // ── Sticky notes ──
    pf(["sticky-notes"], () => api.stickyNotes.list());
  }, [orgId, qc]);

  return null;
}
