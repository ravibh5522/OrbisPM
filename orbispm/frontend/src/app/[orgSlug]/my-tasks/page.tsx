"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { PageHeader, Card, Badge, LoadingPage, EmptyState } from "@/components/ui/shared";
import { statusColor, priorityColor, statusLabel, formatRelative, formatDate } from "@/lib/utils";
import {
  ListTodo,
  Clock,
  AlertTriangle,
  CheckCircle,
  Circle,
  Loader2,
} from "lucide-react";
import type { Task, TaskStatus } from "@/types/domain";

export default function MyTasksPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const router = useRouter();
  const orgSlug = currentOrg?.slug || "";
  const orgId = currentOrg?.id || "";

  const { data: myTasks, isLoading } = useQuery({
    queryKey: ["my-tasks", orgId],
    queryFn: () => api.dashboard.myTasks(orgId, 100),
    enabled: !!orgId,
  });

  if (isLoading) return <LoadingPage />;

  const tasks = myTasks?.data || [];
  const total = myTasks?.total || 0;

  // Group by status
  const grouped = {
    in_progress: tasks.filter((t: Task) => t.status === "in_progress"),
    todo: tasks.filter((t: Task) => t.status === "todo"),
    blocked: tasks.filter((t: Task) => t.status === "blocked"),
    done: tasks.filter((t: Task) => t.status === "done"),
  };

  const overdue = tasks.filter(
    (t: Task) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done"
  );

  const statusIcon = (s: TaskStatus) => {
    switch (s) {
      case "in_progress": return <Loader2 className="w-4 h-4 text-info animate-spin" />;
      case "todo": return <Circle className="w-4 h-4 text-base-content/40" />;
      case "blocked": return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "done": return <CheckCircle className="w-4 h-4 text-success" />;
    }
  };

  return (
    <div>
      <PageHeader
        title="My Tasks"
        description={`${total} task${total !== 1 ? "s" : ""} assigned to you`}
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">In Progress</div>
          <div className="stat-value text-lg text-info">{grouped.in_progress.length}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Todo</div>
          <div className="stat-value text-lg">{grouped.todo.length}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Blocked</div>
          <div className="stat-value text-lg text-warning">{grouped.blocked.length}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow-sm border border-base-200 py-3 px-4">
          <div className="stat-title text-xs">Overdue</div>
          <div className="stat-value text-lg text-error">{overdue.length}</div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="w-16 h-16" />}
          title="No tasks assigned"
          description="Tasks assigned to you will appear here"
        />
      ) : (
        <div className="space-y-6">
          {/* Overdue section */}
          {overdue.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-error" />
                <h3 className="font-semibold text-error">Overdue ({overdue.length})</h3>
              </div>
              <TaskTable tasks={overdue} orgSlug={orgSlug} statusIcon={statusIcon} onNavigate={(t) => router.push(`/${orgSlug}/projects/${t.project_id}/tasks/${t.id}`)} />
            </Card>
          )}

          {/* In Progress */}
          {grouped.in_progress.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="w-5 h-5 text-info animate-spin" />
                <h3 className="font-semibold">In Progress ({grouped.in_progress.length})</h3>
              </div>
              <TaskTable tasks={grouped.in_progress} orgSlug={orgSlug} statusIcon={statusIcon} onNavigate={(t) => router.push(`/${orgSlug}/projects/${t.project_id}/tasks/${t.id}`)} />
            </Card>
          )}

          {/* Todo */}
          {grouped.todo.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Circle className="w-5 h-5 text-base-content/40" />
                <h3 className="font-semibold">Todo ({grouped.todo.length})</h3>
              </div>
              <TaskTable tasks={grouped.todo} orgSlug={orgSlug} statusIcon={statusIcon} onNavigate={(t) => router.push(`/${orgSlug}/projects/${t.project_id}/tasks/${t.id}`)} />
            </Card>
          )}

          {/* Blocked */}
          {grouped.blocked.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <h3 className="font-semibold">Blocked ({grouped.blocked.length})</h3>
              </div>
              <TaskTable tasks={grouped.blocked} orgSlug={orgSlug} statusIcon={statusIcon} onNavigate={(t) => router.push(`/${orgSlug}/projects/${t.project_id}/tasks/${t.id}`)} />
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
                <TaskTable tasks={grouped.done} orgSlug={orgSlug} statusIcon={statusIcon} onNavigate={(t) => router.push(`/${orgSlug}/projects/${t.project_id}/tasks/${t.id}`)} />
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
  orgSlug,
  statusIcon,
  onNavigate,
}: {
  tasks: Task[];
  orgSlug: string;
  statusIcon: (s: TaskStatus) => React.ReactNode;
  onNavigate: (t: Task) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th></th>
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
              <td>{statusIcon(task.status)}</td>
              <td>
                <div>
                  <span className="font-medium">{task.title}</span>
                  {task.labels && task.labels.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {task.labels.map((l) => (
                        <span key={l} className="badge badge-xs badge-outline">{l}</span>
                      ))}
                    </div>
                  )}
                </div>
              </td>
              <td><Badge variant={priorityColor(task.priority)}>{statusLabel(task.priority)}</Badge></td>
              <td className="text-sm text-base-content/60">
                {task.due_date ? (
                  <span className={new Date(task.due_date) < new Date() && task.status !== "done" ? "text-error font-semibold" : ""}>
                    {formatDate(task.due_date)}
                  </span>
                ) : "—"}
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
