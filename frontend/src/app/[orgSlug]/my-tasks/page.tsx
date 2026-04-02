"use client";

import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/shared";
import { api } from "@/lib/api";
import {
  formatDate,
  formatRelative,
  priorityColor,
  statusLabel,
} from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { Task, TaskStatus } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Circle,
  Clock,
  ListTodo,
  Loader2,
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
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");

  const { data: myTasks, isLoading } = useQuery({
    queryKey: ["my-tasks", orgId],
    queryFn: () => api.dashboard.myTasks(orgId, 500),
    enabled: !!orgId,
  });

  const allTasks = myTasks?.data || [];

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = allTasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t: Task) =>
          t.title.toLowerCase().includes(q) ||
          t.labels?.some((l) => l.toLowerCase().includes(q)),
      );
    }
    if (statusFilter) {
      result = result.filter((t: Task) => t.status === statusFilter);
    }
    if (priorityFilter) {
      result = result.filter((t: Task) => t.priority === priorityFilter);
    }
    return result;
  }, [allTasks, search, statusFilter, priorityFilter]);

  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Group for grouped view (uses all filtered, not paginated)
  const grouped = useMemo(
    () => ({
      in_progress: filtered.filter((t: Task) => t.status === "in_progress"),
      todo: filtered.filter((t: Task) => t.status === "todo"),
      blocked: filtered.filter((t: Task) => t.status === "blocked"),
      done: filtered.filter((t: Task) => t.status === "done"),
    }),
    [filtered],
  );

  const overdue = useMemo(
    () =>
      filtered.filter(
        (t: Task) =>
          t.due_date &&
          new Date(t.due_date) < new Date() &&
          t.status !== "done",
      ),
    [filtered],
  );

  const activeFilterCount = [statusFilter, priorityFilter].filter(
    Boolean,
  ).length;

  const clearFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setSearch("");
    setPage(0);
  };

  const statusIcon = (s: TaskStatus) => {
    switch (s) {
      case "in_progress":
        return <Loader2 className="w-4 h-4 text-info animate-spin" />;
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
    <div>
      <PageHeader
        title="My Tasks"
        description={`${allTasks.length} task${allTasks.length !== 1 ? "s" : ""} assigned to you`}
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">In Progress</div>
          <div className="stat-value text-lg text-info">
            {allTasks.filter((t: Task) => t.status === "in_progress").length}
          </div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Todo</div>
          <div className="stat-value text-lg">
            {allTasks.filter((t: Task) => t.status === "todo").length}
          </div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Blocked</div>
          <div className="stat-value text-lg text-warning">
            {allTasks.filter((t: Task) => t.status === "blocked").length}
          </div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Overdue</div>
          <div className="stat-value text-lg text-error">
            {
              allTasks.filter(
                (t: Task) =>
                  t.due_date &&
                  new Date(t.due_date) < new Date() &&
                  t.status !== "done",
              ).length
            }
          </div>
        </div>
      </div>

      {/* Search + Filters + View toggle */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search tasks..."
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

        <button
          className={`btn btn-sm gap-1 ${showFilters ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-xs badge-secondary">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="flex-1" />

        <span className="text-sm text-base-content/50">
          {total} task{total !== 1 ? "s" : ""}
        </span>

        <div className="join">
          <button
            className={`btn btn-sm join-item ${viewMode === "grouped" ? "btn-active" : ""}`}
            onClick={() => setViewMode("grouped")}
          >
            Grouped
          </button>
          <button
            className={`btn btn-sm join-item ${viewMode === "flat" ? "btn-active" : ""}`}
            onClick={() => setViewMode("flat")}
          >
            Flat
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
            <select
              className="select select-bordered select-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">
              Priority:
            </span>
            <select
              className="select select-bordered select-sm"
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
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
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Clear filters
              </button>
            )
          }
        />
      ) : viewMode === "flat" ? (
        <>
          <Card>
            <TaskTable
              tasks={paginated}
              statusIcon={statusIcon}
              onNavigate={(t) =>
                router.push(`/${orgSlug}/projects/${t.project_id}?task=${t.id}`)
              }
              onStatusChange={(t, s) =>
                statusMutation.mutate({ task: t, status: s })
              }
            />
          </Card>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      ) : (
        <div className="space-y-6">
          {/* Overdue section */}
          {overdue.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-error" />
                <h3 className="font-semibold text-error">
                  Overdue ({overdue.length})
                </h3>
              </div>
              <TaskTable
                tasks={overdue}
                statusIcon={statusIcon}
                onNavigate={(t) =>
                  router.push(
                    `/${orgSlug}/projects/${t.project_id}?task=${t.id}`,
                  )
                }
                onStatusChange={(t, s) =>
                  statusMutation.mutate({ task: t, status: s })
                }
              />
            </Card>
          )}

          {/* In Progress */}
          {grouped.in_progress.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="w-5 h-5 text-info animate-spin" />
                <h3 className="font-semibold">
                  In Progress ({grouped.in_progress.length})
                </h3>
              </div>
              <TaskTable
                tasks={grouped.in_progress}
                statusIcon={statusIcon}
                onNavigate={(t) =>
                  router.push(
                    `/${orgSlug}/projects/${t.project_id}?task=${t.id}`,
                  )
                }
                onStatusChange={(t, s) =>
                  statusMutation.mutate({ task: t, status: s })
                }
              />
            </Card>
          )}

          {/* Todo */}
          {grouped.todo.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Circle className="w-5 h-5 text-base-content/40" />
                <h3 className="font-semibold">Todo ({grouped.todo.length})</h3>
              </div>
              <TaskTable
                tasks={grouped.todo}
                statusIcon={statusIcon}
                onNavigate={(t) =>
                  router.push(
                    `/${orgSlug}/projects/${t.project_id}?task=${t.id}`,
                  )
                }
                onStatusChange={(t, s) =>
                  statusMutation.mutate({ task: t, status: s })
                }
              />
            </Card>
          )}

          {/* Blocked */}
          {grouped.blocked.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <h3 className="font-semibold">
                  Blocked ({grouped.blocked.length})
                </h3>
              </div>
              <TaskTable
                tasks={grouped.blocked}
                statusIcon={statusIcon}
                onNavigate={(t) =>
                  router.push(
                    `/${orgSlug}/projects/${t.project_id}?task=${t.id}`,
                  )
                }
                onStatusChange={(t, s) =>
                  statusMutation.mutate({ task: t, status: s })
                }
              />
            </Card>
          )}

          {/* Done (collapsed by default) */}
          {grouped.done.length > 0 && (
            <details className="collapse collapse-arrow bg-base-100 border border-base-200 rounded-lg">
              <summary className="collapse-title font-semibold flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                Done ({grouped.done.length})
              </summary>
              <div className="collapse-content">
                <TaskTable
                  tasks={grouped.done}
                  statusIcon={statusIcon}
                  onNavigate={(t) =>
                    router.push(
                      `/${orgSlug}/projects/${t.project_id}?task=${t.id}`,
                    )
                  }
                  onStatusChange={(t, s) =>
                    statusMutation.mutate({ task: t, status: s })
                  }
                />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function TaskTable({
  tasks,
  statusIcon,
  onNavigate,
  onStatusChange,
}: {
  tasks: Task[];
  statusIcon: (s: TaskStatus) => React.ReactNode;
  onNavigate: (t: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Status</th>
            <th>Title</th>
            <th>Priority</th>
            <th>Due Date</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className="hover cursor-pointer"
              onClick={() => onNavigate(task)}
            >
              <td onClick={(e) => e.stopPropagation()}>
                <select
                  className="select select-bordered select-xs w-28"
                  value={task.status}
                  onChange={(e) =>
                    onStatusChange(task, e.target.value as TaskStatus)
                  }
                >
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="in_review">In Review</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </td>
              <td>
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
              <td>
                <Badge variant={priorityColor(task.priority)}>
                  {statusLabel(task.priority)}
                </Badge>
              </td>
              <td className="text-sm text-base-content/60">
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
              <td className="text-sm text-base-content/60">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelative(task.updated_at)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
