"use client";

import { STATUS_BADGE } from "@/lib/task-colors";
import type { CanvasEntityLink, ProjectMember, Task, TaskStatus } from "@/types/domain";

export const BUCKET_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
];

export const BUCKET_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

interface CanvasLinkPanelProps {
  links: CanvasEntityLink[];
  taskById: Map<string, Task | null | undefined>;
  bucketCounts: Map<string, number>;
  bucketTasks: Map<string, Task[]>;
  memberById: Map<string, ProjectMember | null | undefined>;
  memberWorkload: Map<string, number>;
  projectMemberByUserId: Map<string, ProjectMember>;
}

export function CanvasLinkPanel({
  links,
  taskById,
  bucketCounts,
  bucketTasks,
  memberById,
  memberWorkload,
  projectMemberByUserId,
}: CanvasLinkPanelProps) {
  if (links.length === 0) return null;

  return (
    <div className="absolute top-4 right-4 w-72 max-h-[80%] overflow-y-auto flex flex-col gap-3 z-40">
      {links.map((link, i) => {
        const key = `${link.entity_type}-${link.entity_id}-${i}`;
        if (link.entity_type === "task") {
          const task = taskById.get(link.entity_id);
          if (task === undefined) return <LoadingCard key={key} />;
          if (task === null) return <DeadCard key={key} label="Task deleted" />;
          const assigneeIds =
            task.assignee_ids && task.assignee_ids.length > 0
              ? task.assignee_ids
              : task.assignee_id
                ? [task.assignee_id]
                : [];
          const assignees = assigneeIds
            .map((id) => projectMemberByUserId.get(id))
            .filter((m): m is ProjectMember => !!m);
          return (
            <div key={key} className="bg-base-100 border border-base-200 rounded-xl shadow-lg p-3">
              <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wider mb-2">
                Linked task
              </p>
              <p className="text-sm font-medium mb-2 truncate">{task.title}</p>
              <div className="flex items-center gap-2 mb-2">
                <span className={`badge badge-sm ${STATUS_BADGE[task.status]}`}>
                  {task.status.replace("_", " ")}
                </span>
                {typeof task.progress === "number" && (
                  <span className="text-xs text-base-content/50">
                    {Math.round(task.progress)}%
                  </span>
                )}
              </div>
              {assignees.length > 0 && (
                <div className="flex items-center -space-x-1.5">
                  {assignees.map((m) => (
                    <span
                      key={m.user_id}
                      className="tooltip"
                      data-tip={m.display_name || m.email}
                    >
                      <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[9px] border-2 border-base-100 overflow-hidden">
                        {m.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatar_url} alt="" className="w-5 h-5 object-cover" />
                        ) : (
                          (m.display_name || m.email)[0]?.toUpperCase()
                        )}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }

        if (link.entity_type === "bucket") {
          const status = link.entity_id as TaskStatus;
          const count = bucketCounts.get(status);
          const tasks = bucketTasks.get(status) ?? [];
          return (
            <div key={key} className="bg-base-100 border border-base-200 rounded-xl shadow-lg p-3">
              <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wider mb-2">
                Linked status
              </p>
              <div className="flex items-center gap-2 mb-2">
                <span className={`badge badge-sm ${STATUS_BADGE[status] ?? ""}`}>
                  {BUCKET_LABEL[status] ?? status}
                </span>
                <span className="text-xs text-base-content/50">
                  {count === undefined ? "…" : `${count} task${count === 1 ? "" : "s"}`}
                </span>
              </div>
              {tasks.length > 0 && (
                <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {tasks.map((t) => (
                    <li key={t.id} className="text-xs text-base-content/70 truncate">
                      {t.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }

        // member
        const member = memberById.get(link.entity_id);
        if (member === undefined) return <LoadingCard key={key} />;
        if (member === null) return <DeadCard key={key} label="Member removed from project" />;
        const workload = memberWorkload.get(link.entity_id);
        return (
          <div key={key} className="bg-base-100 border border-base-200 rounded-xl shadow-lg p-3">
            <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wider mb-2">
              Linked member
            </p>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] flex-shrink-0 overflow-hidden">
                {member.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatar_url} alt="" className="w-6 h-6 object-cover" />
                ) : (
                  (member.display_name || member.email)[0]?.toUpperCase()
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {member.display_name || member.email}
                </p>
                <p className="text-xs text-base-content/50">
                  {workload === undefined ? "…" : `${workload} active task${workload === 1 ? "" : "s"}`}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="bg-base-100 border border-base-200 rounded-xl shadow-lg p-3">
      <span className="loading loading-spinner loading-xs" />
    </div>
  );
}

function DeadCard({ label }: { label: string }) {
  return (
    <div className="bg-base-100 border border-dashed border-base-content/20 rounded-xl shadow-lg p-3">
      <p className="text-xs text-base-content/40">{label}</p>
    </div>
  );
}
