"use client";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/shared";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { PRIORITY_BADGE } from "@/lib/task-colors";
import { formatDate, formatRelative, statusLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { Task, TaskStatus } from "@/types/domain";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Circle,
  Clock,
  LayoutGrid,
  ListTodo,
  PlayCircle,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 20;

export default function MyTasksPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const router = useRouter();
  const orgSlug = currentOrg?.slug || "";
  const orgId = currentOrg?.id || "";
  const qc = useQueryClient();
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);

  useEffect(() => {
    setBreadcrumb({ label: "My Tasks", backHref: `/${orgSlug}` });
    return () => setBreadcrumb(null);
  }, [orgSlug, setBreadcrumb]);

  const statusMutation = useMutation({
    mutationFn: ({ task, status }: { task: Task; status: TaskStatus }) =>
      api.tasks.update(orgId, task.project_id, task.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-tasks", orgId] }),
  });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [groupedTab, setGroupedTab] = useState<
    "overdue" | "in_progress" | "blocked"
  >("overdue");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, priorityFilter]);

  const queryParams = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: debouncedSearch.trim() || undefined,
    sort_by: sortBy || undefined,
    sort_order: sortOrder || undefined,
  };

  const { data: myTasks, isLoading } = useQuery({
    queryKey: ["my-tasks", orgId, queryParams],
    queryFn: () => api.dashboard.myTasks(orgId, queryParams),
    enabled: !!orgId,
  });

  const allTasks: Task[] = myTasks?.data ?? [];
  const total = myTasks?.total ?? 0;

  // My Tasks spans potentially many projects, each with a possibly
  // different role for the same user - a single page-level permission
  // check doesn't apply. Batch-fetch each unique project's real
  // permissions so the status-change control can be correctly disabled
  // per task instead of always being clickable regardless of role
  // (the backend already enforces this on the actual update call, but
  // the button showing "editable" when it isn't is exactly the class
  // of UX bug fixed elsewhere in this branch - see RBAC_CONFORMANCE_TEST_REPORT.md).
  const uniqueProjectIds = useMemo(
    () => Array.from(new Set(allTasks.map((t) => t.project_id))),
    [allTasks],
  );

  const projectPermQueries = useQueries({
    queries: uniqueProjectIds.map((projectId) => ({
      queryKey: ["project-permissions", orgId, projectId],
      queryFn: () => api.projects.myPermissions(orgId, projectId),
      enabled: !!orgId && !!projectId,
      staleTime: 30_000,
    })),
  });

  const canUpdateByProject = useMemo(() => {
    const map: Record<string, boolean> = {};
    uniqueProjectIds.forEach((projectId, i) => {
      const perms = projectPermQueries[i]?.data?.permissions ?? [];
      map[projectId] = perms.some(
        (p) => p.resource === "tasks" && p.action === "update",
      );
    });
    return map;
  }, [uniqueProjectIds, projectPermQueries]);

  // Server-side pagination
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Group for grouped view
  const grouped = useMemo(
    () => ({
      in_progress: allTasks.filter((t: Task) => t.status === "in_progress"),
      todo: allTasks.filter((t: Task) => t.status === "todo"),
      blocked: allTasks.filter((t: Task) => t.status === "blocked"),
      done: allTasks.filter((t: Task) => t.status === "done"),
    }),
    [allTasks],
  );

  const overdue = useMemo(
    () =>
      allTasks.filter(
        (t: Task) =>
          t.due_date &&
          new Date(t.due_date) < new Date() &&
          t.status !== "done",
      ),
    [allTasks],
  );

  const activeFilterCount = [statusFilter, priorityFilter].filter(
    Boolean,
  ).length;

  const clearFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setSearch("");
    setSortBy("");
    setSortOrder("");
    setPage(0);
  };

  const statusFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "All" },
    { value: "todo", label: "Todo" },
    { value: "in_progress", label: "In Progress" },
    { value: "blocked", label: "Blocked" },
    { value: "done", label: "Done" },
  ];

  const priorityFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "All" },
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

  const statusIcon = (s: TaskStatus) => {
    switch (s) {
      case "in_progress":
        return <PlayCircle className="w-4 h-4 text-info" />;
      case "todo":
        return <Circle className="w-4 h-4 text-base-content/40" />;
      case "blocked":
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "done":
        return <CheckCircle className="w-4 h-4 text-success" />;
    }
  };

  if (isLoading)
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-base-300 rounded w-36 mb-2" />
        <div className="h-4 bg-base-300 rounded w-52 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 bg-base-200 rounded-lg border border-base-200"
            />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 bg-base-200 rounded-xl border border-base-200"
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="My Tasks"
        description={`${total} task${total !== 1 ? "s" : ""} assigned to you`}
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          compact
          title="In Progress"
          value={
            allTasks.filter((t: Task) => t.status === "in_progress").length
          }
          iconColor="text-info"
          iconBg="bg-info/10"
        />
        <StatCard
          compact
          title="Todo"
          value={allTasks.filter((t: Task) => t.status === "todo").length}
        />
        <StatCard
          compact
          title="Blocked"
          value={allTasks.filter((t: Task) => t.status === "blocked").length}
          iconColor="text-warning"
          iconBg="bg-warning/10"
        />
        <StatCard
          compact
          title="Overdue"
          value={
            allTasks.filter(
              (t: Task) =>
                t.due_date &&
                new Date(t.due_date) < new Date() &&
                t.status !== "done",
            ).length
          }
          iconColor="text-error"
          iconBg="bg-error/10"
        />
      </div>

      {/* Search + Filters + View toggle */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-base-content/85" />
          <input
            type="text"
            placeholder="Search tasks..."
            className="h-10 w-full rounded-xl search-anchor-surface bg-transparent px-3 pl-8 pr-9 text-sm text-base-content placeholder:text-base-content/45 focus:outline-none focus:ring-2 focus:ring-oklch(64%_0.18_180_/_0.35)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-100/45 hover:text-base-content"
              onClick={() => setSearch("")}
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

        <div className="flex-1" />

        <span className="text-sm text-base-content/50">
          {total} task{total !== 1 ? "s" : ""}
        </span>

        <div className="inline-flex items-center rounded-xl border border-base-200/55 bg-base-100/26 p-1 backdrop-blur-xl">
          <button
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              viewMode === "grouped"
                ? "bg-base-100/70 text-base-content shadow-[inset_0_0_0_1px_oklch(100%_0_0_/_0.16)]"
                : "text-base-content/70 hover:bg-base-100/30"
            }`}
            onClick={() => setViewMode("grouped")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grouped
            {viewMode === "grouped" ? (
              <span className="text-[10px]">✓</span>
            ) : null}
          </button>
          <button
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              viewMode === "flat"
                ? "bg-base-100/70 text-base-content shadow-[inset_0_0_0_1px_oklch(100%_0_0_/_0.16)]"
                : "text-base-content/70 hover:bg-base-100/30"
            }`}
            onClick={() => setViewMode("flat")}
          >
            <Rows3 className="h-3.5 w-3.5" />
            Flat
            {viewMode === "flat" ? (
              <span className="text-[10px]">✓</span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">
              Status:
            </span>
            <div className="dropdown dropdown-bottom">
              <div
                tabIndex={0}
                role="button"
                className="inline-flex h-9 min-h-9 w-32 items-center justify-between rounded-xl border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md"
              >
                <span>
                  {statusFilterOptions.find((o) => o.value === statusFilter)
                    ?.label || "All"}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 text-base-content/60"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <ul className="dropdown-content task-status-menu z-[80] mt-1 w-32 rounded-xl border p-1 shadow-xl backdrop-blur-2xl">
                {statusFilterOptions.map((opt) => (
                  <li key={opt.value || "all"}>
                    <button
                      className={`task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                        statusFilter === opt.value
                          ? "task-status-item-active"
                          : "text-base-content/80 hover:bg-base-200/35"
                      }`}
                      onClick={() => setStatusFilter(opt.value)}
                    >
                      <span>{opt.label}</span>
                      {statusFilter === opt.value ? (
                        <span className="text-xs">✓</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">
              Priority:
            </span>
            <div className="dropdown dropdown-bottom">
              <div
                tabIndex={0}
                role="button"
                className="inline-flex h-9 min-h-9 w-32 items-center justify-between rounded-xl border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md"
              >
                <span>
                  {priorityFilterOptions.find((o) => o.value === priorityFilter)
                    ?.label || "All"}
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 text-base-content/60"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <ul className="dropdown-content task-status-menu z-[80] mt-1 w-32 rounded-xl border p-1 shadow-xl backdrop-blur-2xl">
                {priorityFilterOptions.map((opt) => (
                  <li key={opt.value || "all"}>
                    <button
                      className={`task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                        priorityFilter === opt.value
                          ? "task-status-item-active"
                          : "text-base-content/80 hover:bg-base-200/35"
                      }`}
                      onClick={() => setPriorityFilter(opt.value)}
                    >
                      <span>{opt.label}</span>
                      {priorityFilter === opt.value ? (
                        <span className="text-xs">✓</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="xs" onClick={clearFilters}>
              <X className="w-3 h-3" /> Clear all
            </Button>
          )}
        </div>
      )}

      {allTasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="w-16 h-16" />}
          title={
            search || statusFilter || priorityFilter
              ? "No matching tasks"
              : "No tasks assigned"
          }
          description={
            search || statusFilter || priorityFilter
              ? "Try adjusting your search or filters"
              : "Tasks assigned to you will appear here"
          }
          action={
            (search || statusFilter || priorityFilter) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )
          }
        />
      ) : viewMode === "flat" ? (
        <div className="flex h-[calc(100vh-18rem)] min-h-[24rem] flex-col gap-2 overflow-hidden">
          <Card className="flex-1 overflow-hidden">
            <TaskTable
              tasks={allTasks}
              statusIcon={statusIcon}
              scrollable
              canUpdateByProject={canUpdateByProject}
              onNavigate={(t) =>
                router.push(`/${orgSlug}/projects/${t.project_id}?task=${t.id}`)
              }
              onStatusChange={(t, s) =>
                statusMutation.mutate({ task: t, status: s })
              }
            />
          </Card>
          <div className="shrink-0 rounded-xl border border-base-200/55 bg-base-100/52 px-2 py-0.5 backdrop-blur-md">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              className="!mt-1 !pt-1 [&>span]:text-xs [&_.btn]:btn-xs [&_.btn]:h-7 [&_.btn]:min-h-7 [&_.btn]:px-2"
            />
          </div>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-18rem)] min-h-[24rem] flex-col overflow-hidden">
          <Card className="flex-1 overflow-hidden">
            <div className="mb-3 inline-flex items-center gap-2 rounded-xl bg-base-100/22 p-1">
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  groupedTab === "overdue"
                    ? "bg-error/20 text-error"
                    : "text-base-content/70 hover:bg-base-100/24"
                }`}
                onClick={() => setGroupedTab("overdue")}
              >
                Overdue ({overdue.length})
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  groupedTab === "in_progress"
                    ? "bg-info/20 text-info"
                    : "text-base-content/70 hover:bg-base-100/24"
                }`}
                onClick={() => setGroupedTab("in_progress")}
              >
                In Progress ({grouped.in_progress.length})
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  groupedTab === "blocked"
                    ? "bg-warning/20 text-warning"
                    : "text-base-content/70 hover:bg-base-100/24"
                }`}
                onClick={() => setGroupedTab("blocked")}
              >
                Blocked ({grouped.blocked.length})
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              {groupedTab === "overdue" ? (
                <AlertTriangle className="w-5 h-5 text-error" />
              ) : groupedTab === "in_progress" ? (
                <PlayCircle className="w-5 h-5 text-info" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-warning" />
              )}
              <h3
                className={`font-semibold ${
                  groupedTab === "overdue"
                    ? "text-error"
                    : groupedTab === "in_progress"
                      ? "text-info"
                      : "text-warning"
                }`}
              >
                {groupedTab === "overdue"
                  ? `Overdue (${overdue.length})`
                  : groupedTab === "in_progress"
                    ? `In Progress (${grouped.in_progress.length})`
                    : `Blocked (${grouped.blocked.length})`}
              </h3>
            </div>

            {(groupedTab === "overdue"
              ? overdue
              : groupedTab === "in_progress"
                ? grouped.in_progress
                : grouped.blocked
            ).length > 0 ? (
              <TaskTable
                tasks={
                  groupedTab === "overdue"
                    ? overdue
                    : groupedTab === "in_progress"
                      ? grouped.in_progress
                      : grouped.blocked
                }
                statusIcon={statusIcon}
                scrollable
                canUpdateByProject={canUpdateByProject}
                onNavigate={(t) =>
                  router.push(
                    `/${orgSlug}/projects/${t.project_id}?task=${t.id}`,
                  )
                }
                onStatusChange={(t, s) =>
                  statusMutation.mutate({ task: t, status: s })
                }
              />
            ) : (
              <div className="rounded-xl border border-base-200/50 bg-base-100/20 p-6 text-center text-sm text-base-content/65">
                No tasks in this tab.
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function TaskTable({
  tasks,
  statusIcon,
  scrollable,
  onNavigate,
  onStatusChange,
  canUpdateByProject = {},
}: {
  tasks: Task[];
  statusIcon: (s: TaskStatus) => React.ReactNode;
  scrollable?: boolean;
  onNavigate: (t: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  canUpdateByProject?: Record<string, boolean>;
}) {
  const statusOptions: { value: TaskStatus; label: string }[] = [
    { value: "todo", label: "Todo" },
    { value: "in_progress", label: "In Progress" },
    { value: "blocked", label: "Blocked" },
    { value: "in_review", label: "In Review" },
    { value: "done", label: "Done" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const statusTone: Record<
    TaskStatus,
    { trigger: string; dot: string; text: string }
  > = {
    todo: {
      trigger: "border-slate-400/30 bg-slate-500/12",
      dot: "bg-slate-400",
      text: "text-slate-300",
    },
    in_progress: {
      trigger: "border-sky-400/35 bg-sky-500/12",
      dot: "bg-sky-400",
      text: "text-sky-300",
    },
    blocked: {
      trigger: "border-rose-400/35 bg-rose-500/12",
      dot: "bg-rose-400",
      text: "text-rose-300",
    },
    in_review: {
      trigger: "border-violet-400/35 bg-violet-500/12",
      dot: "bg-violet-400",
      text: "text-violet-300",
    },
    done: {
      trigger: "border-emerald-400/35 bg-emerald-500/12",
      dot: "bg-emerald-400",
      text: "text-emerald-300",
    },
    cancelled: {
      trigger: "border-zinc-400/35 bg-zinc-500/12",
      dot: "bg-zinc-400",
      text: "text-zinc-300",
    },
  };

  return (
    <div
      className={
        scrollable
          ? "h-full overflow-x-auto overflow-y-auto rounded-xl pr-1"
          : "overflow-x-auto overflow-y-visible rounded-xl"
      }
    >
      <table className="table table-sm">
        <thead className={scrollable ? "sticky top-0 z-20" : ""}>
          <tr className="bg-base-200/82 backdrop-blur-none">
            <th className="rounded-l-xl text-base-content/82">Status</th>
            <th className="text-base-content/82">Title</th>
            <th className="text-base-content/82">Priority</th>
            <th className="text-base-content/82">Due Date</th>
            <th className="rounded-r-xl text-base-content/82">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const canUpdate = canUpdateByProject[task.project_id] === true;
            return (
            <tr
              key={task.id}
              className="group cursor-pointer"
              onClick={() => onNavigate(task)}
            >
              <td
                className="rounded-l-lg transition-colors group-hover:bg-base-100/24"
                onClick={(e) => e.stopPropagation()}
              >
                {!canUpdate ? (
                  <div
                    data-status={task.status}
                    title="You don't have permission to change this task's status"
                    className={`task-status-trigger inline-flex h-9 min-h-9 w-36 cursor-not-allowed items-center gap-2 rounded-xl border px-3 text-sm opacity-70 backdrop-blur-md ${statusTone[task.status].trigger}`}
                  >
                    <span
                      data-status={task.status}
                      className="task-status-dot h-2 w-2 rounded-full"
                    />
                    <span
                      data-status={task.status}
                      className={`task-status-label ${statusTone[task.status].text}`}
                    >
                      {statusLabel(task.status)}
                    </span>
                  </div>
                ) : (
                <div
                  className="dropdown dropdown-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    tabIndex={0}
                    role="button"
                    data-status={task.status}
                    className={`task-status-trigger inline-flex h-9 min-h-9 w-36 items-center justify-between rounded-xl border px-3 text-sm backdrop-blur-md ${statusTone[task.status].trigger}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        data-status={task.status}
                        className="task-status-dot h-2 w-2 rounded-full"
                      />
                      <span
                        data-status={task.status}
                        className={`task-status-label ${statusTone[task.status].text}`}
                      >
                        {statusLabel(task.status)}
                      </span>
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5 text-base-content/60"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <ul className="dropdown-content task-status-menu z-[80] mt-1 w-40 rounded-xl border p-1 shadow-xl backdrop-blur-2xl">
                    {statusOptions.map((opt) => (
                      <li key={opt.value}>
                        <button
                          data-status={opt.value}
                          className={`task-status-item task-status-option flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                            task.status === opt.value
                              ? `task-status-item-active ${statusTone[opt.value].text}`
                              : `${statusTone[opt.value].text} hover:bg-base-200/35`
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStatusChange(task, opt.value);
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span
                              data-status={opt.value}
                              className="task-status-dot h-2 w-2 rounded-full"
                            />
                            <span>{opt.label}</span>
                          </span>
                          {task.status === opt.value ? (
                            <span className="text-xs">✓</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                )}
              </td>
              <td className="transition-colors group-hover:bg-base-100/24">
                <div>
                  <span className="font-medium">{task.title}</span>
                  {task.labels && task.labels.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {task.labels.map((l) => (
                        <span key={l} className="badge badge-xs badge-outline">
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </td>
              <td className="transition-colors group-hover:bg-base-100/24">
                <Badge variant={PRIORITY_BADGE[task.priority]}>
                  {statusLabel(task.priority)}
                </Badge>
              </td>
              <td className="text-sm text-base-content/60 transition-colors group-hover:bg-base-100/24">
                {task.due_date ? (
                  <span
                    className={
                      new Date(task.due_date) < new Date() &&
                      task.status !== "done"
                        ? "text-error font-semibold"
                        : ""
                    }
                  >
                    {formatDate(task.due_date)}
                  </span>
                ) : (
                  "\u2014"
                )}
              </td>
              <td className="rounded-r-lg text-sm text-base-content/60 transition-colors group-hover:bg-base-100/24">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelative(task.updated_at)}
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
