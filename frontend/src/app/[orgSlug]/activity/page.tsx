"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Pagination } from "@/components/ui/pagination";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/shared";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { ActivityLog, OrgMember } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const ACTION_COLOR: Record<string, string> = {
  created: "badge-success",
  updated: "badge-info",
  deleted: "badge-error",
  assigned: "badge-warning",
  completed: "badge-success",
  commented: "badge-ghost",
};

const PAGE_SIZE = 50;

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

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
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

  const updateAction = (v: string) => {
    setActionFilter(v);
    setPage(0);
  };

  const updateEntity = (v: string) => {
    setEntityTypeFilter(v);
    setPage(0);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setActionFilter("");
    setEntityTypeFilter("");
    setPage(0);
  };
  const activeFilterCount = [actionFilter, entityTypeFilter].filter(
    Boolean,
  ).length;

  // Build query string for server-side pagination/filtering
  const paramString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (actionFilter) params.set("action", actionFilter);
    if (entityTypeFilter) params.set("entity_type", entityTypeFilter);
    params.set("sort_order", sortOrder);
    return params.toString();
  }, [page, debouncedSearch, actionFilter, entityTypeFilter, sortOrder]);

  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", currentOrg?.id, paramString],
    queryFn: () => api.activity.list(currentOrg!.id, paramString),
    enabled: !!currentOrg,
  });

  const { data: membersData } = useQuery({
    queryKey: ["org-members", currentOrg?.id],
    queryFn: () => api.members.list(currentOrg!.id, { limit: 500 }),
    enabled: !!currentOrg,
    staleTime: 5 * 60_000,
  });

  const logs: ActivityLog[] = activity?.data || [];
  const members: OrgMember[] = membersData?.data || [];

  // Rows written by automation have the all-zero UUID as their actor.
  const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

  function memberName(id: string): string {
    if (id === SYSTEM_ACTOR) return "System";
    const m = members.find((x) => x.user_id === id);
    return m ? m.display_name || m.email || "Unknown user" : "Unknown user";
  }

  function memberAvatar(id: string): { name: string; src?: string } {
    const m = members.find((x) => x.user_id === id);
    return {
      name: id === SYSTEM_ACTOR ? "System" : m ? m.display_name || m.email || "?" : "?",
      src: m?.avatar_url || undefined,
    };
  }

  // Unique action types and entity types for filter dropdowns
  const actionTypes = useMemo(
    () => [...new Set(logs.map((l) => l.action))].sort(),
    [logs],
  );
  const entityTypes = useMemo(
    () => [...new Set(logs.map((l) => l.entity_type))].sort(),
    [logs],
  );

  const serverTotal = activity?.total ?? 0;
  const totalPages = Math.ceil(serverTotal / PAGE_SIZE);

  if (isLoading)
    return (
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
    <div className="h-full flex flex-col">
      <PageHeader
        title="Activity"
        description="Recent activity across the organization"
      />

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-base-content/85" />
          <Input
            type="text"
            placeholder="Search activity..."
            className="h-10 w-full rounded-xl pl-8 pr-9"
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
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-xs badge-secondary">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="gap-1"
          onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
          title={sortOrder === "desc" ? "Newest first" : "Oldest first"}
        >
          {sortOrder === "desc" ? "Newest first" : "Oldest first"}
        </Button>

        <span className="text-sm text-base-content/50 ml-auto">
          {serverTotal} event{serverTotal !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-base-200 rounded-lg flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">
              Action:
            </span>
            <Select
              className="select-sm"
              value={actionFilter}
              onChange={(e) => updateAction(e.target.value)}
              options={[
                { value: "", label: "All" },
                ...actionTypes.map((a) => ({ value: a, label: a })),
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">
              Entity:
            </span>
            <Select
              className="select-sm"
              value={entityTypeFilter}
              onChange={(e) => updateEntity(e.target.value)}
              options={[
                { value: "", label: "All" },
                ...entityTypes.map((entityType) => ({
                  value: entityType,
                  label: entityType,
                })),
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

      {logs.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-16 h-16" />}
          title={
            search || actionFilter || entityTypeFilter
              ? "No matching activity"
              : "No activity yet"
          }
          description={
            search || actionFilter || entityTypeFilter
              ? "Try adjusting your search or filters"
              : "Activity will appear here as your team works on tasks and projects"
          }
          action={
            (search || actionFilter || entityTypeFilter) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <Card>
            <div className="space-y-0 divide-y divide-base-200">
              {logs.map((log: ActivityLog) => {
                const href = entityHref(log, orgSlug);
                return (
                  <div key={log.id} className="flex items-start gap-3 py-4">
                    <Avatar
                      name={memberAvatar(log.actor_id).name}
                      src={memberAvatar(log.actor_id).src}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {memberName(log.actor_id)}
                        </span>
                        <Badge
                          variant={ACTION_COLOR[log.action] || "badge-ghost"}
                        >
                          {log.action}
                        </Badge>
                        <span className="text-sm text-base-content/60 capitalize">
                          {log.entity_type}
                        </span>
                        {href ? (
                          <Link
                            href={href}
                            className="text-sm font-medium text-primary/80 hover:text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {log.entity_name || "Open"}
                          </Link>
                        ) : (
                          log.entity_name && (
                            <span className="text-sm font-medium text-base-content/60">
                              {log.entity_name}
                            </span>
                          )
                        )}
                      </div>
                      {log.changes && Object.keys(log.changes).length > 0 && (
                        <div className="mt-1 text-xs text-base-content/50 bg-base-200 rounded px-2 py-1 inline-block">
                          Changed: {Object.keys(log.changes).join(", ")}
                        </div>
                      )}
                      <div className="text-xs text-base-content/40 mt-1">
                        {formatRelative(log.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={serverTotal}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
