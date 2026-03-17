"use client";

import { cn } from "@/lib/utils";
import type {
  OrgMember,
  Project,
  Task,
  TaskPriority,
  TaskStatus,
  Team,
} from "@/types/domain";
import { FolderTree, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractFilterOptions, type CalendarGroupBy } from "./calendar-utils";

export interface CalendarFilterState {
  projectIds: string[];
  teamIds: string[];
  assigneeIds: string[];
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  labels: string[];
  parentTaskId: string | null;
}

export const EMPTY_CALENDAR_FILTER: CalendarFilterState = {
  projectIds: [],
  teamIds: [],
  assigneeIds: [],
  statuses: [],
  priorities: [],
  labels: [],
  parentTaskId: null,
};

export function isCalendarFilterActive(f: CalendarFilterState): boolean {
  return (
    f.projectIds.length > 0 ||
    f.teamIds.length > 0 ||
    f.assigneeIds.length > 0 ||
    f.statuses.length > 0 ||
    f.priorities.length > 0 ||
    f.labels.length > 0 ||
    f.parentTaskId !== null
  );
}

export function calendarFilterCount(f: CalendarFilterState): number {
  let c = 0;
  if (f.projectIds.length > 0) c++;
  if (f.teamIds.length > 0) c++;
  if (f.assigneeIds.length > 0) c++;
  if (f.statuses.length > 0) c++;
  if (f.priorities.length > 0) c++;
  if (f.labels.length > 0) c++;
  if (f.parentTaskId !== null) c++;
  return c;
}

const ALL_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const ALL_PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];

/* ── Applied Filter Chips Bar ── */
export function AppliedFilterChips({
  filter,
  projects,
  teams,
  members,
  parentTasks,
  onChange,
}: {
  filter: CalendarFilterState;
  projects?: Project[];
  teams?: Team[];
  members?: OrgMember[];
  parentTasks?: Task[];
  onChange: (f: CalendarFilterState) => void;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  for (const id of filter.projectIds) {
    const name = projects?.find((p) => p.id === id)?.name || id.slice(0, 8);
    chips.push({
      key: `proj-${id}`,
      label: `Project: ${name}`,
      remove: () =>
        onChange({
          ...filter,
          projectIds: filter.projectIds.filter((x) => x !== id),
        }),
    });
  }
  for (const id of filter.teamIds) {
    const name = teams?.find((t) => t.id === id)?.name || id.slice(0, 8);
    chips.push({
      key: `team-${id}`,
      label: `Team: ${name}`,
      remove: () =>
        onChange({
          ...filter,
          teamIds: filter.teamIds.filter((x) => x !== id),
        }),
    });
  }
  for (const id of filter.assigneeIds) {
    const m = members?.find((m) => m.user_id === id);
    const name = m?.display_name || m?.email?.split("@")[0] || id.slice(0, 8);
    chips.push({
      key: `assign-${id}`,
      label: `Assignee: ${name}`,
      remove: () =>
        onChange({
          ...filter,
          assigneeIds: filter.assigneeIds.filter((x) => x !== id),
        }),
    });
  }
  for (const s of filter.statuses) {
    chips.push({
      key: `status-${s}`,
      label: `Status: ${s.replace(/_/g, " ")}`,
      remove: () =>
        onChange({
          ...filter,
          statuses: filter.statuses.filter((x) => x !== s),
        }),
    });
  }
  for (const p of filter.priorities) {
    chips.push({
      key: `priority-${p}`,
      label: `Priority: ${p}`,
      remove: () =>
        onChange({
          ...filter,
          priorities: filter.priorities.filter((x) => x !== p),
        }),
    });
  }
  for (const l of filter.labels) {
    chips.push({
      key: `label-${l}`,
      label: l,
      remove: () =>
        onChange({ ...filter, labels: filter.labels.filter((x) => x !== l) }),
    });
  }
  if (filter.parentTaskId) {
    const pt = parentTasks?.find((t) => t.id === filter.parentTaskId);
    const name = pt?.title || filter.parentTaskId.slice(0, 8);
    chips.push({
      key: "parent",
      label: `Parent: ${name}`,
      remove: () => onChange({ ...filter, parentTaskId: null }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap py-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
        >
          {chip.label}
          <button
            className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
            onClick={chip.remove}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        className="text-xs text-base-content/50 hover:text-base-content underline ml-1"
        onClick={() => onChange({ ...EMPTY_CALENDAR_FILTER })}
      >
        Clear all
      </button>
    </div>
  );
}

/* ── Group-By Selector ── */
export function GroupBySelector({
  value,
  onChange,
}: {
  value: CalendarGroupBy;
  onChange: (v: CalendarGroupBy) => void;
}) {
  return (
    <div className="join">
      {[
        { key: "none" as const, label: "All Tasks" },
        { key: "project" as const, label: "By Project" },
        { key: "team" as const, label: "By Team" },
      ].map((opt) => (
        <button
          key={opt.key}
          className={cn(
            "join-item btn btn-xs",
            value === opt.key && "btn-active",
          )}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Filter Dropdown Panel ── */
export function CalendarFilterDropdown({
  filter,
  projects,
  teams,
  members,
  tasks,
  onChange,
  onClose,
}: {
  filter: CalendarFilterState;
  projects?: Project[];
  teams?: Team[];
  members?: OrgMember[];
  /** Current loaded tasks — used to auto-generate label & parent options */
  tasks?: Task[];
  onChange: (f: CalendarFilterState) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<CalendarFilterState>({ ...filter });
  const ref = useRef<HTMLDivElement>(null);

  // Auto-extract filter options from loaded tasks
  const autoOptions = useMemo(() => extractFilterOptions(tasks || []), [tasks]);

  // Get root-level tasks for parent task filter
  const rootTasks = useMemo(
    () => (tasks || []).filter((t) => !t.parent_task_id && t.depth === 0),
    [tasks],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const toggle = <K extends keyof CalendarFilterState>(
    key: K,
    value: string,
  ) => {
    setLocal((prev) => {
      const arr = prev[key] as string[];
      const next = arr.includes(value)
        ? arr.filter((x) => x !== value)
        : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const apply = () => {
    onChange(local);
    onClose();
  };

  const reset = () => {
    const empty = { ...EMPTY_CALENDAR_FILTER };
    setLocal(empty);
    onChange(empty);
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-80 bg-base-100/95 backdrop-blur-[20px] border border-base-200 rounded-xl shadow-xl p-4 max-h-[70vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">Filters</span>
        <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Projects */}
      {projects && projects.length > 0 && (
        <FilterSection title="Projects">
          {projects.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 cursor-pointer py-0.5"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary"
                checked={local.projectIds.includes(p.id)}
                onChange={() => toggle("projectIds", p.id)}
              />
              <span className="text-xs truncate">{p.name}</span>
            </label>
          ))}
        </FilterSection>
      )}

      {/* Teams */}
      {teams && teams.length > 0 && (
        <FilterSection title="Teams">
          {teams.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 cursor-pointer py-0.5"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary"
                checked={local.teamIds.includes(t.id)}
                onChange={() => toggle("teamIds", t.id)}
              />
              <span className="text-xs truncate">{t.name}</span>
            </label>
          ))}
        </FilterSection>
      )}

      {/* Members / Assignees */}
      {members && members.length > 0 && (
        <FilterSection title="Assignees">
          {members.map((m) => (
            <label
              key={m.user_id}
              className="flex items-center gap-2 cursor-pointer py-0.5"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary"
                checked={local.assigneeIds.includes(m.user_id)}
                onChange={() => toggle("assigneeIds", m.user_id)}
              />
              <span className="text-xs truncate">
                {m.display_name || m.email?.split("@")[0]}
              </span>
            </label>
          ))}
        </FilterSection>
      )}

      {/* Status */}
      <FilterSection title="Status">
        {ALL_STATUSES.map((s) => (
          <label
            key={s}
            className="flex items-center gap-2 cursor-pointer py-0.5"
          >
            <input
              type="checkbox"
              className="checkbox checkbox-xs checkbox-primary"
              checked={local.statuses.includes(s)}
              onChange={() => toggle("statuses", s)}
            />
            <span className="text-xs capitalize">{s.replace(/_/g, " ")}</span>
          </label>
        ))}
      </FilterSection>

      {/* Priority */}
      <FilterSection title="Priority">
        {ALL_PRIORITIES.map((p) => (
          <label
            key={p}
            className="flex items-center gap-2 cursor-pointer py-0.5"
          >
            <input
              type="checkbox"
              className="checkbox checkbox-xs checkbox-primary"
              checked={local.priorities.includes(p)}
              onChange={() => toggle("priorities", p)}
            />
            <span className="text-xs capitalize">{p}</span>
          </label>
        ))}
      </FilterSection>

      {/* Labels (auto-generated from task data) */}
      {autoOptions.labels.length > 0 && (
        <FilterSection title="Labels">
          {autoOptions.labels.map((l) => (
            <label
              key={l}
              className="flex items-center gap-2 cursor-pointer py-0.5"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary"
                checked={local.labels.includes(l)}
                onChange={() => toggle("labels", l)}
              />
              <Tag className="w-3 h-3 text-base-content/40" />
              <span className="text-xs truncate">{l}</span>
            </label>
          ))}
        </FilterSection>
      )}

      {/* Parent Task (auto-generated from root tasks) */}
      {rootTasks.length > 0 && (
        <FilterSection title="Parent Task">
          <label className="flex items-center gap-2 cursor-pointer py-0.5">
            <input
              type="radio"
              name="parentTask"
              className="radio radio-xs radio-primary"
              checked={local.parentTaskId === null}
              onChange={() => setLocal((p) => ({ ...p, parentTaskId: null }))}
            />
            <span className="text-xs">All tasks</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer py-0.5">
            <input
              type="radio"
              name="parentTask"
              className="radio radio-xs radio-primary"
              checked={local.parentTaskId === "root"}
              onChange={() => setLocal((p) => ({ ...p, parentTaskId: "root" }))}
            />
            <FolderTree className="w-3 h-3 text-base-content/40" />
            <span className="text-xs">Root tasks only</span>
          </label>
          {rootTasks.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 cursor-pointer py-0.5"
            >
              <input
                type="radio"
                name="parentTask"
                className="radio radio-xs radio-primary"
                checked={local.parentTaskId === t.id}
                onChange={() => setLocal((p) => ({ ...p, parentTaskId: t.id }))}
              />
              <span className="text-xs truncate">{t.title}</span>
            </label>
          ))}
        </FilterSection>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-base-200">
        <button className="btn btn-ghost btn-xs flex-1" onClick={reset}>
          Reset
        </button>
        <button className="btn btn-primary btn-xs flex-1" onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-1">
        {title}
      </div>
      <div className="max-h-32 overflow-y-auto space-y-0.5">{children}</div>
    </div>
  );
}
