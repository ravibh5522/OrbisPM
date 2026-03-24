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
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Search,
  Tag,
  X,
} from "lucide-react";
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
  groupBy = "none",
}: {
  filter: CalendarFilterState;
  projects?: Project[];
  teams?: Team[];
  members?: OrgMember[];
  /** Current loaded tasks — used to auto-generate label & parent options */
  tasks?: Task[];
  onChange: (f: CalendarFilterState) => void;
  onClose: () => void;
  /** Current group-by mode — affects which filter sections are shown */
  groupBy?: "none" | "project" | "team";
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

  // Sort projects, teams, members alphabetically and deduplicate by name
  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    const seen = new Set<string>();
    return [...projects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => {
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
      });
  }, [projects]);

  const sortedTeams = useMemo(() => {
    if (!teams) return [];
    const seen = new Set<string>();
    return [...teams]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((t) => {
        if (seen.has(t.name)) return false;
        seen.add(t.name);
        return true;
      });
  }, [teams]);

  const sortedMembers = useMemo(() => {
    if (!members) return [];
    const seen = new Set<string>();
    return [...members]
      .sort((a, b) => {
        const nameA = a.display_name || a.email || "";
        const nameB = b.display_name || b.email || "";
        return nameA.localeCompare(nameB);
      })
      .filter((m) => {
        if (seen.has(m.user_id)) return false;
        seen.add(m.user_id);
        return true;
      });
  }, [members]);

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
      className="absolute right-0 top-full mt-1 z-[100] w-80 bg-base-100 backdrop-blur-[20px] border border-base-200/80 rounded-xl shadow-2xl p-4 max-h-[70vh] overflow-y-auto ring-1 ring-base-content/5"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">
          {groupBy === "none"
            ? "Task Filters"
            : groupBy === "project"
              ? "Project Filters"
              : "Team Filters"}
        </span>
        <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Task mode filters ── */}
      {groupBy === "none" && (
        <>
          {/* Projects */}
          {sortedProjects.length > 0 && (
            <SearchableFilterSection
              title="Projects"
              items={sortedProjects}
              selectedIds={local.projectIds}
              getId={(p) => p.id}
              getLabel={(p) => p.name}
              onToggle={(id) => toggle("projectIds", id)}
              defaultCollapsed={sortedProjects.length > 10}
            />
          )}

          {/* Teams */}
          {sortedTeams.length > 0 && (
            <SearchableFilterSection
              title="Teams"
              items={sortedTeams}
              selectedIds={local.teamIds}
              getId={(t) => t.id}
              getLabel={(t) => t.name}
              onToggle={(id) => toggle("teamIds", id)}
              defaultCollapsed={sortedTeams.length > 10}
            />
          )}

          {/* Members / Assignees */}
          {sortedMembers.length > 0 && (
            <SearchableFilterSection
              title="Assignees"
              items={sortedMembers}
              selectedIds={local.assigneeIds}
              getId={(m) => m.user_id}
              getLabel={(m) =>
                m.display_name || m.email?.split("@")[0] || "Unknown"
              }
              onToggle={(id) => toggle("assigneeIds", id)}
              defaultCollapsed={sortedMembers.length > 10}
            />
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
                <span className="text-xs capitalize">
                  {s.replace(/_/g, " ")}
                </span>
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

          {/* Labels */}
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

          {/* Parent Task */}
          {rootTasks.length > 0 && (
            <FilterSection title="Parent Task" defaultCollapsed>
              <label className="flex items-center gap-2 cursor-pointer py-0.5">
                <input
                  type="radio"
                  name="parentTask"
                  className="radio radio-xs radio-primary"
                  checked={local.parentTaskId === null}
                  onChange={() =>
                    setLocal((p) => ({ ...p, parentTaskId: null }))
                  }
                />
                <span className="text-xs">All tasks</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer py-0.5">
                <input
                  type="radio"
                  name="parentTask"
                  className="radio radio-xs radio-primary"
                  checked={local.parentTaskId === "root"}
                  onChange={() =>
                    setLocal((p) => ({ ...p, parentTaskId: "root" }))
                  }
                />
                <FolderTree className="w-3 h-3 text-base-content/40" />
                <span className="text-xs">Root tasks only</span>
              </label>
              {rootTasks.slice(0, 20).map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 cursor-pointer py-0.5"
                >
                  <input
                    type="radio"
                    name="parentTask"
                    className="radio radio-xs radio-primary"
                    checked={local.parentTaskId === t.id}
                    onChange={() =>
                      setLocal((p) => ({ ...p, parentTaskId: t.id }))
                    }
                  />
                  <span className="text-xs truncate">{t.title}</span>
                </label>
              ))}
            </FilterSection>
          )}
        </>
      )}

      {/* ── Project mode filters ── */}
      {groupBy === "project" && (
        <>
          {sortedProjects.length > 0 && (
            <SearchableFilterSection
              title="Show Projects"
              items={sortedProjects}
              selectedIds={local.projectIds}
              getId={(p) => p.id}
              getLabel={(p) => p.name}
              onToggle={(id) => toggle("projectIds", id)}
              defaultCollapsed={false}
            />
          )}

          {sortedTeams.length > 0 && (
            <SearchableFilterSection
              title="Filter by Team"
              items={sortedTeams}
              selectedIds={local.teamIds}
              getId={(t) => t.id}
              getLabel={(t) => t.name}
              onToggle={(id) => toggle("teamIds", id)}
              defaultCollapsed={sortedTeams.length > 10}
            />
          )}
        </>
      )}

      {/* ── Team mode filters ── */}
      {groupBy === "team" && (
        <>
          {sortedTeams.length > 0 && (
            <SearchableFilterSection
              title="Show Teams"
              items={sortedTeams}
              selectedIds={local.teamIds}
              getId={(t) => t.id}
              getLabel={(t) => t.name}
              onToggle={(id) => toggle("teamIds", id)}
              defaultCollapsed={false}
            />
          )}

          {sortedMembers.length > 0 && (
            <SearchableFilterSection
              title="Filter by Member"
              items={sortedMembers}
              selectedIds={local.assigneeIds}
              getId={(m) => m.user_id}
              getLabel={(m) =>
                m.display_name || m.email?.split("@")[0] || "Unknown"
              }
              onToggle={(id) => toggle("assigneeIds", id)}
              defaultCollapsed={sortedMembers.length > 10}
            />
          )}
        </>
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

/* ── Searchable, collapsible filter section ── */
function SearchableFilterSection<T>({
  title,
  items,
  selectedIds,
  getId,
  getLabel,
  onToggle,
  defaultCollapsed = false,
}: {
  title: string;
  items: T[];
  selectedIds: string[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onToggle: (id: string) => void;
  defaultCollapsed?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const selectedCount = items.filter((item) =>
    selectedIds.includes(getId(item)),
  ).length;

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((item) => getLabel(item).toLowerCase().includes(q));
  }, [items, search, getLabel]);

  return (
    <div className="mb-3">
      <button
        className="flex items-center gap-1 w-full text-left group"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-base-content/40" />
        ) : (
          <ChevronDown className="w-3 h-3 text-base-content/40" />
        )}
        <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] text-base-content/30 ml-auto">
          {selectedCount > 0 && `${selectedCount} selected · `}
          {items.length}
        </span>
      </button>
      {!collapsed && (
        <>
          {items.length > 8 && (
            <div className="relative mt-1 mb-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-base-content/30" />
              <input
                type="text"
                placeholder={`Search ${title.toLowerCase()}…`}
                className="input input-xs input-bordered w-full pl-6 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <div className="text-[10px] text-base-content/30 py-1 px-1">
                No matches
              </div>
            ) : (
              filtered.map((item) => {
                const id = getId(item);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 cursor-pointer py-0.5"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={selectedIds.includes(id)}
                      onChange={() => onToggle(id)}
                    />
                    <span className="text-xs truncate">{getLabel(item)}</span>
                  </label>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FilterSection({
  title,
  children,
  defaultCollapsed = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="mb-3">
      <button
        className="flex items-center gap-1 w-full text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-base-content/40" />
        ) : (
          <ChevronDown className="w-3 h-3 text-base-content/40" />
        )}
        <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
          {title}
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-40 overflow-y-auto space-y-0.5 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}
