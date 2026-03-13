"use client";

import { Badge, Avatar } from "@/components/ui/shared";
import { cn } from "@/lib/utils";
import { statusColor, priorityColor, statusLabel } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus, ProjectMember } from "@/types/domain";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Repeat,
  Layers,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import {
  getMonthGridWithStrips,
  getWeekGrid,
  getDayGrid,
  getWeekdayLabels,
  formatMonthYear,
  formatWeekRange,
  formatDayHeader,
  navigateDate,
  getDateRange,
  sortTasksByPriority,
  formatDateRange,
  type CalendarDay,
  type CalendarViewMode,
  type CalendarGroupBy,
  type MonthWeekRow,
  type TaskStrip,
} from "./calendar-utils";

/* ── Priority-based strip colors ── */
function stripBg(priority: TaskPriority): string {
  switch (priority) {
    case "critical": return "bg-error/80 text-error-content";
    case "high": return "bg-warning/80 text-warning-content";
    case "medium": return "bg-info/70 text-info-content";
    case "low": return "bg-base-300 text-base-content";
  }
}

function stripBorder(status: TaskStatus): string {
  switch (status) {
    case "done": return "ring-1 ring-success/60";
    case "in_progress": return "ring-1 ring-info/60";
    case "blocked": return "ring-1 ring-error/60";
    default: return "ring-1 ring-base-content/10";
  }
}

function priorityDot(priority: TaskPriority): string {
  switch (priority) {
    case "critical": return "bg-error";
    case "high": return "bg-warning";
    case "medium": return "bg-info";
    case "low": return "bg-base-content/30";
  }
}

function statusRing(status: TaskStatus): string {
  switch (status) {
    case "done": return "border-l-success";
    case "in_progress": return "border-l-info";
    case "blocked": return "border-l-error";
    default: return "border-l-base-content/20";
  }
}

/* ── Task Strip Bar for month grid ── */
function StripBar({
  strip,
  onClick,
}: {
  strip: TaskStrip;
  onClick?: (task: Task) => void;
}) {
  const { task, startCol, span, lane, clippedStart, clippedEnd } = strip;
  const left = `${(startCol / 7) * 100}%`;
  const width = `${(span / 7) * 100}%`;
  const top = `${lane * 22 + 20}px`; // 20px offset for day number row

  return (
    <button
      className={cn(
        "absolute h-[18px] text-[10px] leading-[18px] px-1.5 truncate z-10",
        "cursor-pointer transition-all hover:brightness-90 hover:shadow-sm",
        stripBg(task.priority),
        stripBorder(task.status),
        clippedStart ? "rounded-l-none" : "rounded-l-md",
        clippedEnd ? "rounded-r-none" : "rounded-r-md"
      )}
      style={{ left, width, top }}
      title={`${task.title} — ${statusLabel(task.status)} (${task.priority})\n${formatDateRange(task.start_date, task.due_date)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
    >
      {task.title}
    </button>
  );
}

/* ── Expanded task card for week/day view ── */
function TaskCard({
  task,
  onClick,
  members,
}: {
  task: Task;
  onClick?: (task: Task) => void;
  members?: ProjectMember[];
}) {
  const assignee = members?.find(
    (m) => m.user_id === task.assignee_id || task.assignee_ids?.includes(m.user_id)
  );

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
      className={cn(
        "w-full text-left p-2 rounded-lg border-l-3 bg-base-100 border border-base-200",
        "hover:shadow-md transition-all cursor-pointer group",
        statusRing(task.status)
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-medium truncate flex-1">{task.title}</span>
        {task.recurrence_rule && <Repeat className="w-3 h-3 text-base-content/40 flex-shrink-0 mt-0.5" />}
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <Badge variant={priorityColor(task.priority)} className="badge-xs">
          {statusLabel(task.priority)}
        </Badge>
        <Badge variant={statusColor(task.status)} className="badge-xs">
          {statusLabel(task.status)}
        </Badge>
        {task.labels?.map((l) => (
          <span key={l} className="badge badge-xs badge-outline">{l}</span>
        ))}
      </div>
      {task.start_date && task.due_date && (
        <div className="text-[10px] text-base-content/50 mt-1">
          {formatDateRange(task.start_date, task.due_date)}
        </div>
      )}
      {assignee && (
        <div className="flex items-center gap-1 mt-1.5">
          <Avatar
            name={assignee.display_name || assignee.email}
            src={assignee.avatar_url}
            size="xs"
          />
          <span className="text-xs text-base-content/60 truncate">
            {assignee.display_name || assignee.email?.split("@")[0]}
          </span>
        </div>
      )}
      {task.estimated_hours && (
        <div className="flex items-center gap-1 mt-1 text-xs text-base-content/50">
          <Clock className="w-3 h-3" />
          {task.estimated_hours}h
        </div>
      )}
    </button>
  );
}

/* ── Month Week Row with strips ── */
function MonthWeekRowView({
  row,
  weekdays,
  onClickTask,
  onClickDay,
}: {
  row: MonthWeekRow;
  weekdays: string[];
  onClickTask?: (task: Task) => void;
  onClickDay?: (date: Date) => void;
}) {
  const maxLane = row.strips.length > 0
    ? Math.max(...row.strips.map((s) => s.lane))
    : -1;
  // Minimum row height = day number row (20px) + strip lanes + padding
  const minH = Math.max(80, 20 + (maxLane + 1) * 22 + 8);

  return (
    <div className="grid grid-cols-7 relative" style={{ minHeight: `${minH}px` }}>
      {/* Day number cells */}
      {row.days.map((day, col) => (
        <div
          key={col}
          className={cn(
            "border border-base-200 px-1 pt-0.5 cursor-pointer hover:bg-base-200/30 transition-colors",
            !day.isCurrentMonth && "opacity-40",
            day.isToday && "ring-2 ring-primary ring-inset"
          )}
          style={{ minHeight: `${minH}px` }}
          onClick={() => onClickDay?.(day.date)}
        >
          <span
            className={cn(
              "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
              day.isToday && "bg-primary text-primary-content"
            )}
          >
            {day.date.getDate()}
          </span>
        </div>
      ))}

      {/* Strip overlay */}
      {row.strips.map((strip, i) => (
        <StripBar key={`${strip.task.id}-${i}`} strip={strip} onClick={onClickTask} />
      ))}
    </div>
  );
}

/* ── Group-By section header ── */
function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-base-200/50 border-b border-base-200 sticky top-0 z-20">
      <Layers className="w-3.5 h-3.5 text-base-content/50" />
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-base-content/50">({count} tasks)</span>
    </div>
  );
}

/* ── Main CalendarView Component ── */
export interface CalendarViewProps {
  tasks: Task[];
  members?: ProjectMember[];
  isLoading?: boolean;
  onTaskClick?: (task: Task) => void;
  onRangeChange?: (from: string, to: string, mode: CalendarViewMode) => void;
  defaultMode?: CalendarViewMode;
  showProject?: boolean;
  compact?: boolean;
  className?: string;
  /** Group-by mode */
  groupBy?: CalendarGroupBy;
  /** Project id→name map for group labels */
  projectNames?: Map<string, string>;
  /** Team id→name map for group labels */
  teamNames?: Map<string, string>;
  /** Project→team mapping for team grouping */
  projectTeamMap?: Map<string, string>;
}

export function CalendarView({
  tasks,
  members,
  isLoading,
  onTaskClick,
  onRangeChange,
  defaultMode = "month",
  compact = false,
  className,
  groupBy = "none",
  projectNames,
  teamNames,
  projectTeamMap,
}: CalendarViewProps) {
  const [viewDate, setViewDate] = useState(new Date());
  const [mode, setMode] = useState<CalendarViewMode>(defaultMode);
  const weekdays = getWeekdayLabels();

  // Group tasks
  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all__", label: "", tasks }];

    const groups = new Map<string, Task[]>();

    for (const t of tasks) {
      let key = "";
      if (groupBy === "project") {
        key = t.project_id;
      } else if (groupBy === "team") {
        key = projectTeamMap?.get(t.project_id) || "unassigned";
      }
      const arr = groups.get(key);
      if (arr) arr.push(t);
      else groups.set(key, [t]);
    }

    return Array.from(groups.entries()).map(([key, tasks]) => {
      let label = key;
      if (groupBy === "project") label = projectNames?.get(key) || key;
      else if (groupBy === "team") label = key === "unassigned" ? "No Team" : (teamNames?.get(key) || key);
      return { key, label, tasks };
    });
  }, [tasks, groupBy, projectNames, teamNames, projectTeamMap]);

  const headerText = useMemo(() => {
    if (mode === "month") return formatMonthYear(viewDate);
    if (mode === "week") return formatWeekRange(viewDate);
    return formatDayHeader(viewDate);
  }, [viewDate, mode]);

  const handleNavigate = useCallback((direction: 1 | -1) => {
    const next = navigateDate(viewDate, mode, direction);
    setViewDate(next);
    const range = getDateRange(next, mode);
    onRangeChange?.(range.from, range.to, mode);
  }, [viewDate, mode, onRangeChange]);

  const handleToday = useCallback(() => {
    const today = new Date();
    setViewDate(today);
    const range = getDateRange(today, mode);
    onRangeChange?.(range.from, range.to, mode);
  }, [mode, onRangeChange]);

  const handleModeChange = useCallback((newMode: CalendarViewMode) => {
    setMode(newMode);
    const range = getDateRange(viewDate, newMode);
    onRangeChange?.(range.from, range.to, newMode);
  }, [viewDate, onRangeChange]);

  const handleDayClick = useCallback((date: Date) => {
    if (mode === "month") {
      setViewDate(date);
      setMode("day");
      const range = getDateRange(date, "day");
      onRangeChange?.(range.from, range.to, "day");
    }
  }, [mode, onRangeChange]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* ── Toolbar ── */}
      <div className={cn(
        "flex items-center justify-between gap-2 flex-wrap",
        compact ? "pb-2" : "pb-3"
      )}>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm btn-square" onClick={() => handleNavigate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="btn btn-ghost btn-sm btn-square" onClick={() => handleNavigate(1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleToday}>Today</button>
          <h2 className={cn("font-semibold", compact ? "text-sm" : "text-lg")}>
            {headerText}
          </h2>
        </div>

        <div className="join">
          {(["month", "week", "day"] as CalendarViewMode[]).map((m) => (
            <button
              key={m}
              className={cn("join-item btn btn-sm", mode === m && "btn-active")}
              onClick={() => handleModeChange(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading overlay ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <span className="loading loading-spinner loading-md" />
        </div>
      )}

      {/* ── Calendar Body ── */}
      {!isLoading && (
        <div className="flex-1 min-h-0 overflow-auto">
          {grouped.map((group) => (
            <div key={group.key}>
              {groupBy !== "none" && (
                <GroupHeader label={group.label} count={group.tasks.length} />
              )}

              {/* Month Grid with Strips */}
              {mode === "month" && (
                <MonthGridView
                  tasks={group.tasks}
                  viewDate={viewDate}
                  weekdays={weekdays}
                  onClickTask={onTaskClick}
                  onClickDay={handleDayClick}
                />
              )}

              {/* Week Grid */}
              {mode === "week" && (
                <WeekGridView
                  tasks={group.tasks}
                  viewDate={viewDate}
                  weekdays={weekdays}
                  onClickTask={onTaskClick}
                  members={members}
                />
              )}

              {/* Day View */}
              {mode === "day" && (
                <DayGridView
                  tasks={group.tasks}
                  viewDate={viewDate}
                  onClickTask={onTaskClick}
                  members={members}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Month grid sub-component ── */
function MonthGridView({
  tasks,
  viewDate,
  weekdays,
  onClickTask,
  onClickDay,
}: {
  tasks: Task[];
  viewDate: Date;
  weekdays: string[];
  onClickTask?: (task: Task) => void;
  onClickDay?: (date: Date) => void;
}) {
  const rows = useMemo(
    () => getMonthGridWithStrips(viewDate.getFullYear(), viewDate.getMonth(), tasks),
    [viewDate, tasks]
  );

  return (
    <div className="flex flex-col min-h-0">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-base-200">
        {weekdays.map((wd) => (
          <div key={wd} className="text-xs font-semibold text-base-content/60 text-center py-1.5">
            {wd}
          </div>
        ))}
      </div>
      {/* Week rows with strip bars */}
      {rows.map((row, i) => (
        <MonthWeekRowView
          key={i}
          row={row}
          weekdays={weekdays}
          onClickTask={onClickTask}
          onClickDay={onClickDay}
        />
      ))}
    </div>
  );
}

/* ── Week grid sub-component ── */
function WeekGridView({
  tasks,
  viewDate,
  weekdays,
  onClickTask,
  members,
}: {
  tasks: Task[];
  viewDate: Date;
  weekdays: string[];
  onClickTask?: (task: Task) => void;
  members?: ProjectMember[];
}) {
  const grid = useMemo(() => getWeekGrid(viewDate, tasks), [viewDate, tasks]);

  return (
    <div className="grid grid-cols-7 gap-2">
      {grid.map((day, i) => {
        const sorted = sortTasksByPriority(day.tasks);
        return (
          <div key={i} className="flex flex-col min-h-[200px]">
            <div className={cn(
              "text-center py-2 sticky top-0 bg-base-100 z-10 border-b border-base-200",
              day.isToday && "text-primary font-bold"
            )}>
              <div className="text-xs text-base-content/60">{weekdays[i]}</div>
              <div className={cn(
                "text-lg font-semibold w-9 h-9 mx-auto flex items-center justify-center rounded-full",
                day.isToday && "bg-primary text-primary-content"
              )}>
                {day.date.getDate()}
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5 p-1">
              {sorted.map((task) => (
                <TaskCard key={task.id} task={task} onClick={onClickTask} members={members} />
              ))}
              {sorted.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-xs text-base-content/30">No tasks</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Day view sub-component ── */
function DayGridView({
  tasks,
  viewDate,
  onClickTask,
  members,
}: {
  tasks: Task[];
  viewDate: Date;
  onClickTask?: (task: Task) => void;
  members?: ProjectMember[];
}) {
  const grid = useMemo(() => getDayGrid(viewDate, tasks), [viewDate, tasks]);

  return (
    <div>
      {grid[0] && (
        <div className="space-y-2">
          {grid[0].tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-base-content/50">
              <CalendarDays className="w-12 h-12 mb-2" />
              <p className="text-sm">No tasks for this day</p>
            </div>
          ) : (
            sortTasksByPriority(grid[0].tasks).map((task) => (
              <TaskCard key={task.id} task={task} onClick={onClickTask} members={members} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
