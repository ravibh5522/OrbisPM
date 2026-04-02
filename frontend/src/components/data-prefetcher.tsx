"use client";

import { useOrgPolicies } from "@/hooks/use-policies";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Silently prefetches key org data in the background so pages feel instant.
 * On initial load (page reload), always fetches fresh data from backend.
 * On subsequent org/role changes, also refetches.
 * Mounted in OrgLayout — no visible UI.
 */
export function DataPrefetcher() {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const orgRole = useAuthStore((s) => s.currentMembership?.role);
  const policies = useOrgPolicies();
  const qc = useQueryClient();
  const ranForKey = useRef<string | null>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    // Re-run when org OR role changes (e.g. user promoted from viewer to admin)
    const cacheKey = `${orgId}:${orgRole}`;
    if (
      !orgId ||
      !orgRole ||
      ranForKey.current === cacheKey ||
      policies.isLoading
    )
      return;
    ranForKey.current = cacheKey;

    const forceRefresh = isInitialLoad.current;
    isInitialLoad.current = false;

    // Helper: prefetch (or invalidate + refetch on page reload)
    const pf = <T,>(key: unknown[], fn: () => Promise<T>, stale = 60_000) => {
      if (forceRefresh) {
        // On page reload, invalidate so stale IDB cache is replaced with fresh data
        qc.invalidateQueries({ queryKey: key });
      }
      qc.prefetchQuery({ queryKey: key, queryFn: fn, staleTime: stale });
    };

    // Use policy-derived scope instead of hardcoded role checks
    const mineParam =
      policies.viewProjectsScope === "all" ? {} : { mine: "true" };
    const teamMineParam =
      policies.viewTeamsScope === "all" ? {} : { mine: "true" };

    // ── Core org data ─────────────────────────────
    pf(["dashboard-stats", orgId], () => api.dashboard.stats(orgId), 120_000);
    pf(["projects", orgId], () => api.projects.list(orgId, mineParam));
    pf(["teams", orgId], () => api.teams.list(orgId, teamMineParam));
    pf(["org-members", orgId], () => api.members.list(orgId));

    // ── Chat sidebar — critical for instant messages page ──
    pf(["chat-sidebar"], () => api.chat.sidebar.get(), 60_000);

    // ── My tasks (dashboard) ──
    pf(["my-tasks", orgId], () => api.dashboard.myTasks(orgId));

    // ── Notifications ──
    pf(["notifications", orgId], () => api.notifications.list(orgId));

    // ── Sticky notes ──
    pf(["sticky-notes"], () => api.stickyNotes.list());

    // ── Permission roles (used by usePermissions hook in many pages) ──
    pf(["permissions-roles", orgId, "org"], () =>
      api.permissions.roles.list(orgId, "org"),
    );
  }, [
    orgId,
    orgRole,
    qc,
    policies.isLoading,
    policies.viewProjectsScope,
    policies.viewTeamsScope,
  ]);

  return null;
}
