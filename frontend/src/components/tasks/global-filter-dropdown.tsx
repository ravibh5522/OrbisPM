"use client";

import { cn } from "@/lib/utils";
import type { ProjectMember, TaskPriority, TaskStatus } from "@/types/domain";
import { useEffect, useRef, useState } from "react";

export interface GlobalFilterState {
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  assigneeIds: string[];
  labels: string[];
  dueDateFrom: string;
  dueDateTo: string;
  search: string;
}

export const EMPTY_GLOBAL_FILTER: GlobalFilterState = {
  statuses: [],
  priorities: [],
  assigneeIds: [],
  labels: [],
  dueDateFrom: "",
  dueDateTo: "",
  search: "",
};

export function isGlobalFilterActive(f: GlobalFilterState): boolean {
  return (
    f.statuses.length > 0 ||
    f.priorities.length > 0 ||
    f.assigneeIds.length > 0 ||
    f.labels.length > 0 ||
    f.dueDateFrom !== "" ||
    f.dueDateTo !== "" ||
    f.search !== ""
  );
}

/** Count how many filter dimensions are active */
export function activeFilterCount(f: GlobalFilterState): number {
  let count = 0;
  if (f.statuses.length > 0) count++;
  if (f.priorities.length > 0) count++;
  if (f.assigneeIds.length > 0) count++;
  if (f.labels.length > 0) count++;
  if (f.dueDateFrom !== "" || f.dueDateTo !== "") count++;
  if (f.search !== "") count++;
  return count;
}

export function GlobalFilterDropdown({
  filter,
  members,
  onChange,
  onClose,
}: {
  filter: GlobalFilterState;
  members: ProjectMember[];
  onChange: (f: GlobalFilterState) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<GlobalFilterState>({ ...filter });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const toggleStatus = (s: TaskStatus) => {
    setLocal((p) => ({
      ...p,
      statuses: p.statuses.includes(s)
        ? p.statuses.filter((x) => x !== s)
        : [...p.statuses, s],
    }));
  };

  const togglePriority = (pr: TaskPriority) => {
    setLocal((p) => ({
      ...p,
      priorities: p.priorities.includes(pr)
        ? p.priorities.filter((x) => x !== pr)
        : [...p.priorities, pr],
    }));
  };

  const toggleAssignee = (id: string) => {
    setLocal((p) => ({
      ...p,
      assigneeIds: p.assigneeIds.includes(id)
        ? p.assigneeIds.filter((x) => x !== id)
        : [...p.assigneeIds, id],
    }));
  };

  const applyFilter = () => {
    onChange(local);
    onClose();
  };

  const clearFilter = () => {
    onChange({ ...EMPTY_GLOBAL_FILTER });
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 z-50 w-[26rem] max-w-[calc(100vw-1rem)] max-h-[78vh] overflow-y-auto rounded-2xl border border-base-200/70 bg-base-100/92 shadow-xl backdrop-blur-[22px]"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Global Filters</span>
          <button className="btn btn-ghost btn-sm h-8 min-h-8 px-3" onClick={clearFilter}>
            Clear All
          </button>
        </div>

        {/* Search */}
        <div>
          <label className="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide">
            Search
          </label>
          <input
            type="text"
            className="input input-bordered h-10 w-full rounded-xl px-3 text-sm mt-1"
            placeholder="Filter by title..."
            value={local.search}
            onChange={(e) =>
              setLocal((p) => ({ ...p, search: e.target.value }))
            }
          />
        </div>

        {/* Status */}
        <div>
          <label className="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide">
            Status
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["todo", "in_progress", "done", "blocked"] as const).map((s) => (
              <button
                key={s}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm leading-none transition-colors",
                  local.statuses.includes(s)
                    ? "border-primary/45 bg-primary/20 text-base-content"
                    : "border-base-300/70 bg-base-100/25 text-base-content/78 hover:bg-base-200/45",
                )}
                onClick={() => toggleStatus(s)}
              >
                {s === "in_progress"
                  ? "In Progress"
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide">
            Priority
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["critical", "high", "medium", "low"] as const).map((p) => (
              <button
                key={p}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm leading-none transition-colors",
                  local.priorities.includes(p)
                    ? "border-primary/45 bg-primary/20 text-base-content"
                    : "border-base-300/70 bg-base-100/25 text-base-content/78 hover:bg-base-200/45",
                )}
                onClick={() => togglePriority(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label className="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide">
            Assignee
          </label>
          <div className="mt-1 flex max-h-36 flex-col gap-1 overflow-y-auto pr-1">
            <label
              className={cn(
                "flex items-center gap-2 cursor-pointer rounded-xl px-2.5 py-1.5 transition-colors",
                local.assigneeIds.includes("")
                  ? "bg-primary/12"
                  : "hover:bg-base-200/45",
              )}
            >
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={local.assigneeIds.includes("")}
                onChange={() => toggleAssignee("")}
              />
              <span className="text-sm text-base-content/78">Unassigned</span>
            </label>
            {members.map((m) => (
              <label
                key={m.user_id}
                className={cn(
                  "flex items-center gap-2 cursor-pointer rounded-xl px-2.5 py-1.5 transition-colors",
                  local.assigneeIds.includes(m.user_id)
                    ? "bg-primary/12"
                    : "hover:bg-base-200/45",
                )}
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={local.assigneeIds.includes(m.user_id)}
                  onChange={() => toggleAssignee(m.user_id)}
                />
                <span className="text-sm truncate">
                  {m.display_name || m.email || m.user_id.slice(0, 8)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Labels */}
        <div>
          <label className="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide">
            Labels
          </label>
          <input
            type="text"
            className="input input-bordered h-10 w-full rounded-xl px-3 text-sm mt-1"
            placeholder="label1, label2 (comma-separated)"
            value={local.labels.join(", ")}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                labels: e.target.value
                  .split(",")
                  .map((l) => l.trim())
                  .filter(Boolean),
              }))
            }
          />
        </div>

        {/* Due date range */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide">
              Due From
            </label>
            <input
              type="date"
              className="input input-bordered h-10 w-full rounded-xl px-3 text-sm mt-1"
              value={local.dueDateFrom}
              onChange={(e) =>
                setLocal((p) => ({ ...p, dueDateFrom: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide">
              Due To
            </label>
            <input
              type="date"
              className="input input-bordered h-10 w-full rounded-xl px-3 text-sm mt-1"
              value={local.dueDateTo}
              onChange={(e) =>
                setLocal((p) => ({ ...p, dueDateTo: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-base-200/70">
          <button
            className="btn btn-primary btn-sm h-10 min-h-10 flex-1 rounded-xl"
            onClick={applyFilter}
          >
            Apply
          </button>
          <button
            className="btn btn-ghost btn-sm h-10 min-h-10 flex-1 rounded-xl"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
