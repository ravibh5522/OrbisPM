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
      className="absolute top-full right-0 mt-1 z-50 bg-base-100/95 backdrop-blur-[20px] border border-base-200 rounded-lg shadow-xl w-72 max-h-[70vh] overflow-y-auto"
    >
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Global Filters</span>
          <button className="btn btn-ghost btn-xs" onClick={clearFilter}>
            Clear All
          </button>
        </div>

        {/* Search */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Search
          </label>
          <input
            type="text"
            className="input input-bordered input-xs w-full mt-0.5"
            placeholder="Filter by title..."
            value={local.search}
            onChange={(e) =>
              setLocal((p) => ({ ...p, search: e.target.value }))
            }
          />
        </div>

        {/* Status */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Status
          </label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {(["todo", "in_progress", "done", "blocked"] as const).map((s) => (
              <button
                key={s}
                className={cn(
                  "badge badge-sm cursor-pointer gap-1",
                  local.statuses.includes(s) ? "badge-primary" : "badge-ghost",
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
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Priority
          </label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {(["critical", "high", "medium", "low"] as const).map((p) => (
              <button
                key={p}
                className={cn(
                  "badge badge-sm cursor-pointer gap-1",
                  local.priorities.includes(p)
                    ? "badge-primary"
                    : "badge-ghost",
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
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Assignee
          </label>
          <div className="flex flex-col gap-0.5 mt-0.5 max-h-28 overflow-y-auto">
            <label className="flex items-center gap-1.5 cursor-pointer px-1 py-0.5 rounded hover:bg-base-200">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={local.assigneeIds.includes("")}
                onChange={() => toggleAssignee("")}
              />
              <span className="text-xs text-base-content/60">Unassigned</span>
            </label>
            {members.map((m) => (
              <label
                key={m.user_id}
                className="flex items-center gap-1.5 cursor-pointer px-1 py-0.5 rounded hover:bg-base-200"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={local.assigneeIds.includes(m.user_id)}
                  onChange={() => toggleAssignee(m.user_id)}
                />
                <span className="text-xs truncate">
                  {m.display_name || m.email || m.user_id.slice(0, 8)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Labels */}
        <div>
          <label className="text-[10px] font-semibold text-base-content/50 uppercase">
            Labels
          </label>
          <input
            type="text"
            className="input input-bordered input-xs w-full mt-0.5"
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
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[10px] font-semibold text-base-content/50 uppercase">
              Due From
            </label>
            <input
              type="date"
              className="input input-bordered input-xs w-full mt-0.5"
              value={local.dueDateFrom}
              onChange={(e) =>
                setLocal((p) => ({ ...p, dueDateFrom: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-base-content/50 uppercase">
              Due To
            </label>
            <input
              type="date"
              className="input input-bordered input-xs w-full mt-0.5"
              value={local.dueDateTo}
              onChange={(e) =>
                setLocal((p) => ({ ...p, dueDateTo: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-2 border-t border-base-200">
          <button
            className="btn btn-primary btn-xs flex-1"
            onClick={applyFilter}
          >
            Apply
          </button>
          <button className="btn btn-ghost btn-xs flex-1" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
