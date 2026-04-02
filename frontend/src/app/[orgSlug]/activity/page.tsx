"use client";

import { Pagination } from "@/components/ui/pagination";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/shared";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { ActivityLog, OrgMember } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUIStore } from "@/stores/ui-store";

const ACTION_COLOR: Record<string, string> = {
  created: "badge-success",
  updated: "badge-info",
  deleted: "badge-error",
  assigned: "badge-warning",
  completed: "badge-success",
  commented: "badge-ghost",
};

const PAGE_SIZE = 50;
const FETCH_LIMIT = 200;

function entityHref(log: ActivityLog, orgSlug: string): string | null {
  const projectId =
    (log.metadata?.project_id as string | undefined) ||
    (log.changes?.project_id as string | undefined);
  switch (log.entity_type) {
    case "task":
      return projectId
        ? `/${orgSlug}/projects/${projectId}?task=${log.entity_id}`
        : null;
    case "project":
      return `/${orgSlug}/projects/${log.entity_id}`;
    case "team":
      return `/${orgSlug}/teams`;
    case "template":
      return `/${orgSlug}/templates`;
    default:
      return null;
  }
}

export default function ActivityPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);

  useEffect(() => {
    setBreadcrumb({ label: "Activity", backHref: `/${orgSlug}` });
    return () => setBreadcrumb(null);
  }, [orgSlug, setBreadcrumb]);

  // Server-side batch (fetch a large page, filter client-side)
  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", currentOrg?.id],
    queryFn: () => api.activity.list(currentOrg!.id, `limit=${FETCH_LIMIT}&offset=0`),
    enabled: !!currentOrg,
  });

  const { data: membersData } = useQuery({
    queryKey: ["org-members", currentOrg?.id],
    queryFn: () => api.members.list(currentOrg!.id),
    enabled: !!currentOrg,
    staleTime: 5 * 60_000,
  });

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);

  const clearFilters = () => {
    setSearch("");
    setActionFilter("");
    setEntityTypeFilter("");
    setPage(0);
  };
  const activeFilterCount = [actionFilter, entityTypeFilter].filter(Boolean).length;

  const logs: ActivityLog[] = activity?.data || [];
  const members: OrgMember[] = membersData?.data || [];

  function memberName(id: string): string {
    const m = members.find((x) => x.user_id === id);
    return m ? (m.display_name || m.email || id.slice(0, 8) + "…") : id.slice(0, 8) + "…";
  }

  function memberAvatar(id: string): { name: string; src?: string } {
    const m = members.find((x) => x.user_id === id);
    return { name: m ? (m.display_name || m.email || "?") : "?", src: m?.avatar_url || undefined };
  }

  // Unique action types and entity types for filter dropdowns
  const actionTypes = useMemo(() => [...new Set(logs.map((l) => l.action))].sort(), [logs]);
  const entityTypes = useMemo(() => [...new Set(logs.map((l) => l.entity_type))].sort(), [logs]);

  const filtered = useMemo(() => {
    let result = logs;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.entity_type.toLowerCase().includes(q) ||
          memberName(l.actor_id).toLowerCase().includes(q),
      );
    }
    if (actionFilter) result = result.filter((l) => l.action === actionFilter);
    if (entityTypeFilter) result = result.filter((l) => l.entity_type === entityTypeFilter);
    return result;
  }, [logs, search, actionFilter, entityTypeFilter, members]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (isLoading) return (
    <div className="animate-pulse">
      <div className="h-8 bg-base-300 rounded w-32 mb-2" />
      <div className="h-4 bg-base-300 rounded w-72 mb-6" />
      <div className="bg-base-200 rounded-xl border border-base-200 p-4 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-base-300 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-base-300 rounded w-3/4" />
              <div className="h-3 bg-base-300 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Activity" description="Recent activity across the organization" />

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search activity..."
            className="input input-bordered input-sm w-full pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
          {search && (
            <button className="absolute right-2 top-2 btn btn-ghost btn-xs btn-circle" onClick={() => { setSearch(""); setPage(0); }}>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          className={`btn btn-sm gap-1 ${showFilters ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-xs badge-secondary">{activeFilterCount}</span>
          )}
        </button>

        <span className="text-sm text-base-content/50 ml-auto">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-base-200 rounded-lg flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">Action:</span>
            <select
              className="select select-bordered select-sm"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            >
              <option value="">All</option>
              {actionTypes.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">Entity:</span>
            <select
              className="select select-bordered select-sm"
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(0); }}
            >
              <option value="">All</option>
              {entityTypes.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          {activeFilterCount > 0 && (
            <button className="btn btn-ghost btn-xs" onClick={clearFilters}>
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-16 h-16" />}
          title={search || actionFilter || entityTypeFilter ? "No matching activity" : "No activity yet"}
          description={search || actionFilter || entityTypeFilter ? "Try adjusting your search or filters" : "Activity will appear here as your team works on tasks and projects"}
          action={(search || actionFilter || entityTypeFilter) && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
          )}
        />
      ) : (
        <>
          <Card>
            <div className="space-y-0 divide-y divide-base-200">
              {paged.map((log: ActivityLog) => {
                const href = entityHref(log, orgSlug);
                return (
                  <div key={log.id} className="flex items-start gap-3 py-4">
                    <Avatar name={memberAvatar(log.actor_id).name} src={memberAvatar(log.actor_id).src} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{memberName(log.actor_id)}</span>
                        <Badge variant={ACTION_COLOR[log.action] || "badge-ghost"}>{log.action}</Badge>
                        <span className="text-sm text-base-content/60 capitalize">{log.entity_type}</span>
                        {href ? (
                          <Link
                            href={href}
                            className="font-mono text-xs text-primary/70 hover:text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {log.entity_id.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-base-content/30">{log.entity_id.slice(0, 8)}…</span>
                        )}
                      </div>
                      {log.changes && Object.keys(log.changes).length > 0 && (
                        <div className="mt-1 text-xs text-base-content/50 bg-base-200 rounded px-2 py-1 inline-block">
                          Changed: {Object.keys(log.changes).join(", ")}
                        </div>
                      )}
                      <div className="text-xs text-base-content/40 mt-1">{formatRelative(log.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
