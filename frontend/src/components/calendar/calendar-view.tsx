"use client";

import { Avatar } from "@/components/ui/shared";
import { cn, statusLabel } from "@/lib/utils";
import type { ProjectMember, Task } from "@/types/domain";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Repeat,
} from "lucide-react";
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import {
  aggregateProjectTimelines,
  aggregateTeamTimelines,
  formatDateRange,
  formatDayHeader,
  formatMonthYear,
  formatWeekRange,
  getDateRange,
  getDayGrid,
  getDayMarkers,
  getMonthGridWithStrips,
  getMonthGridWithTimelineStrips,
  getWeekdayLabels,
  getWeekGrid,
  getWeekStrips,
  groupTasksByProject,
  groupTasksByTeam,
  navigateDate,
  sortTasksByPriority,
  toDateKey,
  type CalendarDay,
  type DayMarker,
  type TaskGroup,
  type CalendarGroupBy,
  type CalendarViewMode,
  type MonthWeekRow,
  type TaskStrip,
  type TimelineEntry,
  type TimelineStrip,
} from "./calendar-utils";
import {
  colorForIndex,
  colorForKey,
  type CalendarColor,
} from "./calendar-colors";

// Bar geometry — a little more height and vertical breathing room than a dense
// grid, so stacked strips read as separate bars rather than a solid block.
const BAR_LANE_PITCH = 30; // px between stacked lanes (26px bar + 4px gap)
const BAR_TOP_OFFSET = 28; // px below the day-number row

// A due-only task is a deadline — render it as a diamond marker, not a 1-day bar.
function isMilestone(task: Task): boolean {
  return !task.start_date && !!task.due_date;
}

/* ── Task Strip Bar for month grid ── */
function StripBar({
  strip,
  color,
  onClick,
}: {
  strip: TaskStrip;
  color: CalendarColor;
  onClick?: (task: Task) => void;
}) {
  const { task, startCol, span, lane, clippedStart, clippedEnd } = strip;
  const left = `${(startCol / 7) * 100}%`;
  const width = `${(span / 7) * 100}%`;
  const top = `${lane * BAR_LANE_PITCH + BAR_TOP_OFFSET}px`;
  const progress =
    typeof task.progress === "number"
      ? Math.max(0, Math.min(100, task.progress))
      : 0;

  return (
    <button
      className={cn(
        "cal-bar absolute flex items-center gap-1.5 h-[26px] text-sm leading-[26px] px-2 truncate z-10",
        "cursor-pointer transition-all hover:-translate-y-px hover:shadow-md font-medium",
        clippedStart && "cal-clipL",
        task.status === "done" && "cal-done",
        clippedStart ? "rounded-l-none" : "rounded-l-md",
        clippedEnd ? "rounded-r-none" : "rounded-r-md",
      )}
      style={{ ["--cal-a"]: color.bg, left, width, top } as CSSProperties}
      title={`${task.title} — ${statusLabel(task.status)} (${task.priority})\n${formatDateRange(task.start_date, task.due_date)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
    >
      {progress > 0 && (
        <span className="cal-prog" style={{ width: `${progress}%` }} />
      )}
      {task.status === "blocked" && <span className="cal-dot-red cal-z" />}
      <span className="cal-lbl cal-z min-w-0 truncate">{task.title}</span>
    </button>
  );
}

/* ── Milestone (deadline) diamond marker for month grid ── */
function MilestoneMark({
  strip,
  color,
  onClick,
}: {
  strip: TaskStrip;
  color: CalendarColor;
  onClick?: (task: Task) => void;
}) {
  const { task, startCol, lane } = strip;
  const left = `calc(${(startCol / 7) * 100}% + 6px)`;
  const top = `${lane * BAR_LANE_PITCH + BAR_TOP_OFFSET}px`;

  return (
    <button
      className={cn(
        "cal-ms absolute flex items-center gap-1.5 h-[26px] text-sm font-semibold",
        "whitespace-nowrap cursor-pointer z-10 transition-all hover:brightness-110",
      )}
      style={{ ["--cal-a"]: color.bg, left, top } as CSSProperties}
      title={`${task.title} — due ${formatDateRange(null, task.due_date)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
    >
      <span className="cal-dia" />
      <span className="truncate max-w-[150px]">{task.title}</span>
    </button>
  );
}

/* ── Month Week Row with strips ── */
const MAX_VISIBLE_LANES = 5;

function MonthWeekRowView({
  row,
  weekdays,
  getColor,
  onClickTask,
  onClickDay,
}: {
  row: MonthWeekRow;
  weekdays: string[];
  getColor: (task: Task) => CalendarColor;
  onClickTask?: (task: Task) => void;
  onClickDay?: (date: Date) => void;
}) {
  // Fixed row height: day-number row + visible lanes + overflow row + padding
  const rowH = BAR_TOP_OFFSET + MAX_VISIBLE_LANES * BAR_LANE_PITCH + 18;

  // Only show strips in visible lanes
  const visibleStrips = row.strips.filter((s) => s.lane < MAX_VISIBLE_LANES);
  const hiddenStrips = row.strips.filter((s) => s.lane >= MAX_VISIBLE_LANES);

  // Count hidden tasks per day column for "+N more" indicator
  const hiddenPerCol: number[] = Array(7).fill(0);
  for (const s of hiddenStrips) {
    for (let c = s.startCol; c < s.startCol + s.span; c++) {
      if (c >= 0 && c < 7) hiddenPerCol[c]++;
    }
  }

  return (
    <div className="grid grid-cols-7 relative" style={{ height: `${rowH}px` }}>
      {/* Day number cells */}
      {row.days.map((day, col) => (
        <div
          key={col}
          className={cn(
            "border border-base-200/30 px-1 pt-0.5 cursor-pointer hover:bg-base-200/15 transition-colors overflow-hidden",
            !day.isCurrentMonth && "opacity-40",
            col >= 5 && !day.isToday && "bg-base-200/15",
            day.isToday &&
              "ring-1 ring-inset ring-primary/40 bg-primary/[0.06]",
          )}
          style={{ height: `${rowH}px` }}
          onClick={() => onClickDay?.(day.date)}
        >
          <span
            className={cn(
              "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
              day.isToday && "bg-primary text-primary-content",
            )}
          >
            {day.date.getDate()}
          </span>
          {/* "+N more" indicator at bottom of cell */}
          {hiddenPerCol[col] > 0 && (
            <div
              className="absolute bottom-1 text-[10px] font-semibold text-primary hover:underline cursor-pointer z-20"
              style={{ left: `calc(${(col / 7) * 100}% + 4px)` }}
              onClick={(e) => {
                e.stopPropagation();
                onClickDay?.(day.date);
              }}
            >
              +{hiddenPerCol[col]} more
            </div>
          )}
        </div>
      ))}

      {/* Strip overlay — only visible lanes */}
      {visibleStrips.map((strip, i) =>
        isMilestone(strip.task) ? (
          <MilestoneMark
            key={`${strip.task.id}-${i}`}
            strip={strip}
            color={getColor(strip.task)}
            onClick={onClickTask}
          />
        ) : (
          <StripBar
            key={`${strip.task.id}-${i}`}
            strip={strip}
            color={getColor(strip.task)}
            onClick={onClickTask}
          />
        ),
      )}
    </div>
  );
}

/* ── Timeline Strip Bar for project/team month grid ── */
function TimelineStripBar({
  strip,
  onClick,
}: {
  strip: TimelineStrip;
  onClick?: (entry: TimelineEntry) => void;
}) {
  const { entry, startCol, span, lane, clippedStart, clippedEnd } = strip;
  const left = `${(startCol / 7) * 100}%`;
  const width = `${(span / 7) * 100}%`;
  const top = `${lane * 32 + 26}px`;
  const c = colorForIndex(entry.colorIndex);

  return (
    <button
      className={cn(
        "cal-bar absolute flex items-center gap-1 h-[28px] text-sm leading-[28px] px-2 truncate z-10",
        "cursor-pointer transition-all hover:-translate-y-px hover:shadow-md font-medium",
        clippedStart && "cal-clipL",
        clippedStart ? "rounded-l-none" : "rounded-l-md",
        clippedEnd ? "rounded-r-none" : "rounded-r-md",
      )}
      style={{ ["--cal-a"]: c.bg, left, width, top } as CSSProperties}
      title={`${entry.title} — ${entry.taskCount} task${entry.taskCount !== 1 ? "s" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(entry);
      }}
    >
      <span className="cal-lbl cal-z min-w-0 truncate">{entry.title}</span>
      <span className="cal-z opacity-70 text-xs">({entry.taskCount})</span>
    </button>
  );
}

/* ── Timeline month row ── */
const MAX_TIMELINE_LANES = 8;

function TimelineWeekRowView({
  row,
  onClickEntry,
}: {
  row: { days: CalendarDay[]; strips: TimelineStrip[] };
  onClickEntry?: (entry: TimelineEntry) => void;
}) {
  const maxLane = row.strips.reduce((max, s) => Math.max(max, s.lane), -1);
  const lanesUsed = Math.min(maxLane + 1, MAX_TIMELINE_LANES);
  const rowH = 26 + lanesUsed * 32 + 8;

  const visibleStrips = row.strips.filter((s) => s.lane < MAX_TIMELINE_LANES);

  return (
    <div
      className="grid grid-cols-7 relative"
      style={{ height: `${Math.max(rowH, 52)}px` }}
    >
      {row.days.map((day, col) => (
        <div
          key={col}
          className={cn(
            "border border-base-200/40 px-1 pt-0.5 transition-colors overflow-hidden",
            !day.isCurrentMonth && "opacity-25",
            day.isToday && "ring-2 ring-primary ring-inset bg-primary/5",
          )}
          style={{ height: `${Math.max(rowH, 52)}px` }}
        >
          <span
            className={cn(
              "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
              day.isToday && "bg-primary text-primary-content",
            )}
          >
            {day.date.getDate()}
          </span>
        </div>
      ))}
      {visibleStrips.map((strip, i) => (
        <TimelineStripBar
          key={`${strip.entry.id}-${i}`}
          strip={strip}
          onClick={onClickEntry}
        />
      ))}
    </div>
  );
}

/* ── Group-By section header ── */
function GroupHeader({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: CalendarColor;
}) {
  return (
    <div className="relative z-20 flex items-center gap-2 border-y border-base-200/40 bg-base-200/30 px-3 py-1.5 backdrop-blur-sm">
      <span
        className="h-3 w-3 shrink-0 rounded-sm"
        style={{ backgroundColor: color.bg }}
      />
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="text-[11px] font-medium text-base-content/50">
        {count} task{count !== 1 ? "s" : ""}
      </span>
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
  /** Callback when timeline entry is clicked (project/team mode) */
  onTimelineEntryClick?: (entry: TimelineEntry) => void;
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
  onTimelineEntryClick,
}: CalendarViewProps) {
  const [viewDate, setViewDate] = useState(new Date());
  const [mode, setMode] = useState<CalendarViewMode>(defaultMode);
  const weekdays = getWeekdayLabels();

  // Is this a timeline mode (project/team) vs tasks mode?
  const isTimelineMode = groupBy === "project" || groupBy === "team";

  // Build timeline entries for project/team modes
  const timelineEntries = useMemo(() => {
    if (groupBy === "project" && projectNames) {
      return aggregateProjectTimelines(tasks, projectNames);
    }
    if (groupBy === "team" && projectTeamMap && teamNames) {
      return aggregateTeamTimelines(tasks, projectTeamMap, teamNames);
    }
    return [];
  }, [tasks, groupBy, projectNames, teamNames, projectTeamMap]);

  // Group tasks (only used in "none" mode for grouped sections)
  // Swimlane groups for the week/day views when grouping by project or team.
  const taskGroups = useMemo(() => {
    if (groupBy === "project" && projectNames) {
      return groupTasksByProject(tasks, projectNames);
    }
    if (groupBy === "team" && projectTeamMap && teamNames) {
      return groupTasksByTeam(tasks, projectTeamMap, teamNames);
    }
    return [];
  }, [tasks, groupBy, projectNames, teamNames, projectTeamMap]);

  // Bar color resolver. Color by project when several projects are on screen
  // (org/team calendar) so each project reads as its own hue; fall back to a
  // per-task color when only one project is present (project calendar) so the
  // view is never a single flat color. Status/priority remain secondary cues.
  const getTaskColor = useMemo(() => {
    const keyOf = (t: Task) => projectNames?.get(t.project_id) || t.project_id;
    const distinct = Array.from(new Set(tasks.map(keyOf)));
    if (distinct.length > 1) {
      const map = new Map(distinct.map((k, i) => [k, colorForIndex(i)]));
      return (t: Task) => map.get(keyOf(t)) ?? colorForKey(t.id);
    }
    return (t: Task) => colorForKey(t.id);
  }, [tasks, projectNames]);

  const headerText = useMemo(() => {
    if (mode === "month") return formatMonthYear(viewDate);
    if (mode === "week") return formatWeekRange(viewDate);
    return formatDayHeader(viewDate);
  }, [viewDate, mode]);

  const handleNavigate = useCallback(
    (direction: 1 | -1) => {
      const next = navigateDate(viewDate, mode, direction);
      setViewDate(next);
      const range = getDateRange(next, mode);
      onRangeChange?.(range.from, range.to, mode);
    },
    [viewDate, mode, onRangeChange],
  );

  const handleToday = useCallback(() => {
    const today = new Date();
    setViewDate(today);
    const range = getDateRange(today, mode);
    onRangeChange?.(range.from, range.to, mode);
  }, [mode, onRangeChange]);

  const handleModeChange = useCallback(
    (newMode: CalendarViewMode) => {
      setMode(newMode);
      const range = getDateRange(viewDate, newMode);
      onRangeChange?.(range.from, range.to, newMode);
    },
    [viewDate, onRangeChange],
  );

  const handleDayClick = useCallback(
    (date: Date) => {
      if (mode === "month") {
        setViewDate(date);
        setMode("day");
        const range = getDateRange(date, "day");
        onRangeChange?.(range.from, range.to, "day");
      }
    },
    [mode, onRangeChange],
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* ── Toolbar ── */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 flex-wrap rounded-xl bg-base-100/14 px-2 backdrop-blur-md",
          compact ? "py-1.5 mb-2" : "py-2 mb-2.5",
        )}
      >
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border border-base-200/55 bg-base-100/24 p-0.5">
            <button
              className="btn btn-ghost btn-sm btn-square rounded-md ml-1 mr-1 mt-0.5 mb-0.5"
              onClick={() => handleNavigate(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              className="btn btn-ghost btn-sm btn-square rounded-md mt-0.5 mb-0.5 mr-1 ml-1"
              onClick={() => handleNavigate(1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            className="rounded-lg border border-base-200/55 bg-base-100/24 px-2.5 py-1 text-xs font-medium text-base-content/80 transition-colors hover:bg-base-100/38"
            onClick={handleToday}
          >
            Today
          </button>
          <h2
            className={cn(
              "font-semibold ml-1",
              compact ? "text-sm" : "text-base",
            )}
          >
            {headerText}
          </h2>
        </div>

        <div className="inline-flex items-center rounded-xl border border-base-200/55 bg-base-100/24 p-1 backdrop-blur-xl">
          {(["month", "week", "day"] as CalendarViewMode[]).map((m) => (
            <button
              key={m}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                mode === m
                  ? "calendar-segment-active"
                  : "text-base-content/70 hover:bg-base-100/30",
              )}
              aria-pressed={mode === m}
              onClick={() => handleModeChange(m)}
            >
              {mode === m && (
                <Check className="calendar-segment-check h-3 w-3" />
              )}
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
          {isTimelineMode && mode === "month" ? (
            /* Month stays an aggregate timeline: one bar per project/team. */
            <TimelineMonthGridView
              entries={timelineEntries}
              viewDate={viewDate}
              weekdays={weekdays}
              onClickEntry={onTimelineEntryClick}
            />
          ) : isTimelineMode && mode === "week" ? (
            /* Zoomed in, an aggregate bar says nothing — show each group's real
               tasks as a swimlane of spanning bars. */
            <GroupedWeekView
              groups={taskGroups}
              noun={groupBy === "project" ? "projects" : "teams"}
              viewDate={viewDate}
              weekdays={weekdays}
              getColor={getTaskColor}
              onClickTask={onTaskClick}
              members={members}
            />
          ) : isTimelineMode && mode === "day" ? (
            <GroupedDayView
              groups={taskGroups}
              noun={groupBy === "project" ? "projects" : "teams"}
              viewDate={viewDate}
              getColor={getTaskColor}
              onClickTask={onTaskClick}
              members={members}
            />
          ) : mode === "month" ? (
            <MonthGridView
              tasks={tasks}
              viewDate={viewDate}
              weekdays={weekdays}
              getColor={getTaskColor}
              onClickTask={onTaskClick}
              onClickDay={handleDayClick}
            />
          ) : mode === "week" ? (
            <WeekGridView
              tasks={tasks}
              viewDate={viewDate}
              weekdays={weekdays}
              getColor={getTaskColor}
              onClickTask={onTaskClick}
              members={members}
            />
          ) : (
            <DayGridView
              tasks={tasks}
              viewDate={viewDate}
              getColor={getTaskColor}
              onClickTask={onTaskClick}
              members={members}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Timeline Month Grid sub-component ── */
function TimelineMonthGridView({
  entries,
  viewDate,
  weekdays,
  onClickEntry,
}: {
  entries: TimelineEntry[];
  viewDate: Date;
  weekdays: string[];
  onClickEntry?: (entry: TimelineEntry) => void;
}) {
  const rows = useMemo(
    () =>
      getMonthGridWithTimelineStrips(
        viewDate.getFullYear(),
        viewDate.getMonth(),
        entries,
      ),
    [viewDate, entries],
  );

  return (
    <div className="flex flex-col min-h-0 rounded-xl bg-base-100/10 overflow-hidden">
      {/* Legend */}
      {entries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-2 py-2 border-b border-base-200/40">
          {/* Deduplicate by title for teams with broken segments */}
          {Array.from(new Map(entries.map((e) => [e.title, e])).values()).map(
            (entry) => (
              <div key={entry.id} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: colorForIndex(entry.colorIndex).bg }}
                />
                <span className="text-xs text-base-content/70">
                  {entry.title}
                </span>
              </div>
            ),
          )}
        </div>
      )}

      {/* Weekday headers */}
      <div className="sticky top-0 z-30 grid grid-cols-7 border-b border-base-200/60 bg-base-100/72 backdrop-blur-md">
        {weekdays.map((wd) => (
          <div
            key={wd}
            className="text-[10px] font-bold text-base-content/78 uppercase text-center py-1.5 tracking-[0.12em]"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Week rows with timeline strips */}
      {rows.map((row, i) => (
        <TimelineWeekRowView key={i} row={row} onClickEntry={onClickEntry} />
      ))}

      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-base-content/40">
          <CalendarDays className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm font-medium">No timelines to display</p>
          <p className="text-xs mt-1 text-base-content/30">
            Tasks need start/due dates to appear as timelines
          </p>
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
  getColor,
  onClickTask,
  onClickDay,
}: {
  tasks: Task[];
  viewDate: Date;
  weekdays: string[];
  getColor: (task: Task) => CalendarColor;
  onClickTask?: (task: Task) => void;
  onClickDay?: (date: Date) => void;
}) {
  const rows = useMemo(
    () =>
      getMonthGridWithStrips(
        viewDate.getFullYear(),
        viewDate.getMonth(),
        tasks,
      ),
    [viewDate, tasks],
  );

  return (
    <div className="flex flex-col min-h-0 rounded-xl bg-base-100/10 overflow-hidden">
      {/* Weekday headers */}
      <div className="sticky top-0 z-30 grid grid-cols-7 border-b border-base-200/60 bg-base-100/72 backdrop-blur-md">
        {weekdays.map((wd) => (
          <div
            key={wd}
            className="text-[10px] font-bold text-base-content/78 uppercase text-center py-1.5 tracking-[0.12em]"
          >
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
          getColor={getColor}
          onClickTask={onClickTask}
          onClickDay={onClickDay}
        />
      ))}
    </div>
  );
}

/* ── Week view ──
   A week is one 7-day row, so tasks lay out as spanning strips exactly like a
   month row: each task is drawn ONCE. The day columns underneath carry only the
   day-specific signal (what starts, what's due) — a task merely passing through a
   day is already represented by its bar. */
const WEEK_BAR_H = 26;
const WEEK_BAR_GAP = 5;
const WEEK_BAND_PAD = 8;

function WeekBar({
  strip,
  color,
  members,
  onClick,
}: {
  strip: TaskStrip;
  color: CalendarColor;
  members?: ProjectMember[];
  onClick?: (task: Task) => void;
}) {
  const { task, startCol, span, lane, clippedStart, clippedEnd } = strip;
  const progress =
    typeof task.progress === "number"
      ? Math.max(0, Math.min(100, task.progress))
      : 0;
  const assignee = members?.find(
    (m) =>
      m.user_id === task.assignee_id || task.assignee_ids?.includes(m.user_id),
  );

  return (
    <button
      className={cn(
        "cal-bar absolute flex items-center gap-1.5 px-2 z-20 overflow-hidden",
        "cursor-pointer transition-all hover:-translate-y-px hover:shadow-md",
        clippedStart && "cal-clipL",
        task.status === "done" && "cal-done",
        clippedStart ? "rounded-l-none" : "rounded-l-md",
        clippedEnd ? "rounded-r-none" : "rounded-r-md",
      )}
      style={
        {
          ["--cal-a"]: color.bg,
          left: `${(startCol / 7) * 100}%`,
          width: `${(span / 7) * 100}%`,
          top: `${WEEK_BAND_PAD + lane * (WEEK_BAR_H + WEEK_BAR_GAP)}px`,
          height: `${WEEK_BAR_H}px`,
        } as CSSProperties
      }
      title={`${task.title} — ${statusLabel(task.status)} (${task.priority})\n${formatDateRange(task.start_date, task.due_date)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
    >
      {progress > 0 && (
        <span className="cal-prog" style={{ width: `${progress}%` }} />
      )}
      {clippedStart && (
        <span className="cal-z text-xs font-bold opacity-55">‹</span>
      )}
      {task.status === "blocked" && <span className="cal-dot-red cal-z" />}
      <span className="cal-lbl cal-z min-w-0 truncate text-[12.5px] font-semibold">
        {task.title}
      </span>
      <span className="cal-z ml-auto flex shrink-0 items-center gap-2">
        <span className="hidden lg:inline text-[10.5px] tabular-nums text-base-content/50">
          {formatDateRange(task.start_date, task.due_date)}
        </span>
        {assignee && (
          <Avatar
            name={assignee.display_name || assignee.email}
            src={assignee.avatar_url}
            size="xs"
          />
        )}
        {progress > 0 && (
          <span className="cal-pct text-[10.5px] font-bold tabular-nums">
            {progress}%
          </span>
        )}
      </span>
      {clippedEnd && (
        <span className="cal-z text-xs font-bold opacity-55">›</span>
      )}
    </button>
  );
}

function WeekMilestone({
  strip,
  color,
  onClick,
}: {
  strip: TaskStrip;
  color: CalendarColor;
  onClick?: (task: Task) => void;
}) {
  const { task, startCol, lane } = strip;
  return (
    <button
      className="cal-ms absolute flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold z-30 cursor-pointer transition-all hover:brightness-110"
      style={
        {
          ["--cal-a"]: color.bg,
          left: `calc(${(startCol / 7) * 100}% + 9px)`,
          top: `${WEEK_BAND_PAD + lane * (WEEK_BAR_H + WEEK_BAR_GAP)}px`,
          height: `${WEEK_BAR_H}px`,
        } as CSSProperties
      }
      title={`${task.title} — due ${formatDateRange(null, task.due_date)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
    >
      <span className="cal-dia" />
      <span className="truncate max-w-[160px]">{task.title}</span>
    </button>
  );
}

function DayMarkerChip({
  marker,
  color,
  onClick,
}: {
  marker: DayMarker;
  color: CalendarColor;
  onClick?: (task: Task) => void;
}) {
  const { task, kind } = marker;
  const label =
    kind === "starts"
      ? "▸ Starts"
      : kind === "milestone"
        ? "◆ Milestone"
        : "◆ Due";

  return (
    <button
      className={cn(
        "flex items-start gap-2 rounded-lg border border-base-200/50 bg-base-100 p-2 text-left",
        "shadow-sm transition-all cursor-pointer hover:-translate-y-px hover:shadow-md",
      )}
      style={{ ["--cal-a"]: color.bg } as CSSProperties}
      title={task.title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
    >
      <span className="cal-rail w-[3px] self-stretch rounded-sm shrink-0" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-[9.5px] font-bold uppercase tracking-[0.08em]",
            kind === "starts" ? "cal-key" : "text-error",
          )}
        >
          {label}
        </span>
        <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug">
          {task.title}
        </span>
      </span>
    </button>
  );
}

function ZoneLabel({ title, count }: { title: string; count?: string }) {
  return (
    <div className="relative z-10 flex items-center gap-2 border-b border-base-200/40 bg-base-200/20 px-4 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/40">
        {title}
      </span>
      {count && (
        <span className="text-[10.5px] font-semibold text-base-content/50">
          {count}
        </span>
      )}
    </div>
  );
}

/** Column classes shared by every week zone, so the 7 columns line up exactly. */
function weekColClass(i: number, isToday: boolean) {
  return cn(
    "border-r border-base-200/30 last:border-r-0",
    i >= 5 && !isToday && "bg-base-200/15",
  );
}

/** Today as one continuous tinted column running through every zone. */
function TodayWash({ col }: { col: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-0 bg-primary/[0.06] ring-1 ring-inset ring-primary/25"
      style={{ left: `${(col / 7) * 100}%`, width: `${100 / 7}%` }}
    />
  );
}

function WeekDayHeader({
  days,
  weekdays,
}: {
  days: CalendarDay[];
  weekdays: string[];
}) {
  return (
    <div className="relative z-10 grid grid-cols-7 border-b border-base-200/40">
      {days.map((day, i) => (
        <div key={i} className={cn(weekColClass(i, day.isToday), "px-3 py-2")}>
          <div
            className={cn(
              "text-[10px] font-bold uppercase tracking-[0.13em]",
              day.isToday ? "text-primary" : "text-base-content/40",
            )}
          >
            {weekdays[i]}
          </div>
          <div
            className={cn(
              "mt-0.5 flex h-[30px] w-[30px] items-center justify-center rounded-full text-[17px] font-semibold tabular-nums",
              day.isToday && "bg-primary text-primary-content",
            )}
          >
            {day.date.getDate()}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A band of lane-packed strips over the 7 day columns. The whole week view is one
 * band; the grouped week view is one band per project/team swimlane.
 */
function WeekBand({
  days,
  strips,
  getColor,
  members,
  onClickTask,
  emptyLabel,
}: {
  days: CalendarDay[];
  strips: TaskStrip[];
  getColor: (task: Task) => CalendarColor;
  members?: ProjectMember[];
  onClickTask?: (task: Task) => void;
  emptyLabel: string;
}) {
  const laneCount = strips.reduce((max, s) => Math.max(max, s.lane + 1), 0);
  const bandH = WEEK_BAND_PAD * 2 + laneCount * (WEEK_BAR_H + WEEK_BAR_GAP);

  return (
    <div
      className="relative z-10"
      style={{ height: `${Math.max(bandH, 44)}px` }}
    >
      <div className="absolute inset-0 z-0 grid grid-cols-7">
        {days.map((day, i) => (
          <div key={i} className={weekColClass(i, day.isToday)} />
        ))}
      </div>
      {strips.map((strip, i) =>
        isMilestone(strip.task) ? (
          <WeekMilestone
            key={`${strip.task.id}-${i}`}
            strip={strip}
            color={getColor(strip.task)}
            onClick={onClickTask}
          />
        ) : (
          <WeekBar
            key={`${strip.task.id}-${i}`}
            strip={strip}
            color={getColor(strip.task)}
            members={members}
            onClick={onClickTask}
          />
        ),
      )}
      {strips.length === 0 && (
        <div className="flex h-full items-center justify-center text-xs text-base-content/30">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function WeekGridView({
  tasks,
  viewDate,
  weekdays,
  getColor,
  onClickTask,
  members,
}: {
  tasks: Task[];
  viewDate: Date;
  weekdays: string[];
  getColor: (task: Task) => CalendarColor;
  onClickTask?: (task: Task) => void;
  members?: ProjectMember[];
}) {
  // Empty task list — we only need each day's date and isToday flag here; the
  // tasks are laid out as strips, not bucketed per day.
  const days = useMemo(() => getWeekGrid(viewDate, []), [viewDate]);
  const strips = useMemo(
    () => getWeekStrips(viewDate, tasks),
    [viewDate, tasks],
  );
  const markersByDay = useMemo(
    () => days.map((d) => getDayMarkers(d.date, tasks)),
    [days, tasks],
  );

  const todayCol = days.findIndex((d) => d.isToday);
  const barStrips = strips.filter((s) => !isMilestone(s.task));
  const markers = markersByDay.flat();
  const dueCount = markers.filter((m) => m.kind !== "starts").length;
  const startCount = markers.filter((m) => m.kind === "starts").length;
  const blockedCount = barStrips.filter(
    (s) => s.task.status === "blocked",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-base-100/10">
      {/* ── Summary: the state of the week, before you read anything ── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-base-200/40 bg-base-200/20 px-4 py-2.5 text-xs text-base-content/60">
        <Stat color="bg-primary" n={barStrips.length} label="in flight" />
        <Stat color="bg-error" n={dueCount} label="due this week" />
        <Stat color="bg-success" n={startCount} label="starting" />
        {blockedCount > 0 && (
          <Stat color="bg-error" n={blockedCount} label="blocked" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative">
          {todayCol >= 0 && <TodayWash col={todayCol} />}
          <WeekDayHeader days={days} weekdays={weekdays} />

          {/* ── In flight: one bar per task ── */}
          <ZoneLabel
            title="In flight"
            count={`· ${barStrips.length} task${barStrips.length !== 1 ? "s" : ""}`}
          />
          <WeekBand
            days={days}
            strips={strips}
            getColor={getColor}
            members={members}
            onClickTask={onClickTask}
            emptyLabel="Nothing in flight this week"
          />

          {/* ── Starts & due: the only day-specific signal ── */}
          <ZoneLabel title="Starts & due" />
          <div className="relative z-10 grid grid-cols-7">
            {days.map((day, i) => (
              <div
                key={i}
                className={cn(
                  weekColClass(i, day.isToday),
                  "flex min-h-[150px] flex-col gap-1.5 p-2",
                )}
              >
                {markersByDay[i].length === 0 ? (
                  <div className="pt-3 text-center text-[11px] text-base-content/25">
                    —
                  </div>
                ) : (
                  markersByDay[i].map((marker, j) => (
                    <DayMarkerChip
                      key={`${marker.task.id}-${marker.kind}-${j}`}
                      marker={marker}
                      color={getColor(marker.task)}
                      onClick={onClickTask}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Week view grouped into one swimlane per project / team. */
function GroupedWeekView({
  groups,
  noun,
  viewDate,
  weekdays,
  getColor,
  onClickTask,
  members,
}: {
  groups: TaskGroup[];
  noun: string;
  viewDate: Date;
  weekdays: string[];
  getColor: (task: Task) => CalendarColor;
  onClickTask?: (task: Task) => void;
  members?: ProjectMember[];
}) {
  const days = useMemo(() => getWeekGrid(viewDate, []), [viewDate]);
  const lanes = useMemo(
    () =>
      groups.map((group) => ({
        group,
        strips: getWeekStrips(viewDate, group.tasks),
      })),
    [groups, viewDate],
  );

  const todayCol = days.findIndex((d) => d.isToday);
  const allTasks = groups.flatMap((g) => g.tasks);
  const blockedCount = allTasks.filter((t) => t.status === "blocked").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-base-100/10">
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-base-200/40 bg-base-200/20 px-4 py-2.5 text-xs text-base-content/60">
        <Stat color="bg-secondary" n={groups.length} label={noun} />
        <Stat color="bg-primary" n={allTasks.length} label="tasks this week" />
        {blockedCount > 0 && (
          <Stat color="bg-error" n={blockedCount} label="blocked" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative">
          {todayCol >= 0 && <TodayWash col={todayCol} />}
          <WeekDayHeader days={days} weekdays={weekdays} />

          {lanes.map(({ group, strips }) => (
            <div key={group.key}>
              <GroupHeader
                label={group.label}
                count={group.tasks.length}
                color={colorForIndex(group.colorIndex)}
              />
              <WeekBand
                days={days}
                strips={strips}
                getColor={getColor}
                members={members}
                onClickTask={onClickTask}
                emptyLabel="Nothing this week"
              />
            </div>
          ))}

          {groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-base-content/40">
              <CalendarDays className="mb-3 h-10 w-10 opacity-50" />
              <p className="text-sm font-medium">Nothing to show</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Day view grouped into one section per project / team. */
function GroupedDayView({
  groups,
  noun,
  viewDate,
  getColor,
  onClickTask,
  members,
}: {
  groups: TaskGroup[];
  noun: string;
  viewDate: Date;
  getColor: (task: Task) => CalendarColor;
  onClickTask?: (task: Task) => void;
  members?: ProjectMember[];
}) {
  const sections = useMemo(
    () =>
      groups.map((group) => {
        const dayTasks = getDayGrid(viewDate, group.tasks)[0]?.tasks ?? [];
        return {
          group,
          inFlight: sortTasksByPriority(dayTasks.filter((t) => !isMilestone(t))),
          markers: getDayMarkers(viewDate, group.tasks),
        };
      }),
    [groups, viewDate],
  );

  const inFlightTotal = sections.reduce((s, x) => s + x.inFlight.length, 0);
  const dueTotal = sections.reduce(
    (s, x) => s + x.markers.filter((m) => m.kind !== "starts").length,
    0,
  );
  const blockedTotal = sections.reduce(
    (s, x) => s + x.inFlight.filter((t) => t.status === "blocked").length,
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-base-100/10">
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-base-200/40 bg-base-200/20 px-4 py-2.5 text-xs text-base-content/60">
        <Stat color="bg-secondary" n={sections.length} label={noun} />
        <Stat color="bg-primary" n={inFlightTotal} label="in flight" />
        <Stat color="bg-error" n={dueTotal} label="due today" />
        {blockedTotal > 0 && (
          <Stat color="bg-error" n={blockedTotal} label="blocked" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {sections.map(({ group, inFlight, markers }) => (
          <div key={group.key}>
            <GroupHeader
              label={group.label}
              count={group.tasks.length}
              color={colorForIndex(group.colorIndex)}
            />
            {inFlight.length === 0 && markers.length === 0 ? (
              <div className="py-4 text-center text-xs text-base-content/30">
                Nothing today
              </div>
            ) : (
              <>
                {inFlight.length > 0 && (
                  <div className="flex flex-col gap-1.5 p-3">
                    {inFlight.map((task) => (
                      <DayBar
                        key={task.id}
                        task={task}
                        viewDate={viewDate}
                        color={getColor(task)}
                        members={members}
                        onClick={onClickTask}
                      />
                    ))}
                  </div>
                )}
                {markers.length > 0 && (
                  <div
                    className="grid items-start gap-2 px-3 pb-3"
                    style={{
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(240px, 1fr))",
                    }}
                  >
                    {markers.map((marker, i) => (
                      <DayMarkerChip
                        key={`${marker.task.id}-${marker.kind}-${i}`}
                        marker={marker}
                        color={getColor(marker.task)}
                        onClick={onClickTask}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {sections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-base-content/40">
            <CalendarDays className="mb-3 h-10 w-10 opacity-50" />
            <p className="text-sm font-medium">Nothing to show</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  color,
  n,
  label,
}: {
  color: string;
  n: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-[7px] w-[7px] rounded-full", color)} />
      <span className="font-bold tabular-nums text-base-content">{n}</span>
      <span>{label}</span>
    </span>
  );
}

/* ── Day view: the week's language, in a single column ── */
function DayGridView({
  tasks,
  viewDate,
  getColor,
  onClickTask,
  members,
}: {
  tasks: Task[];
  viewDate: Date;
  getColor: (task: Task) => CalendarColor;
  onClickTask?: (task: Task) => void;
  members?: ProjectMember[];
}) {
  const dayTasks = useMemo(
    () => getDayGrid(viewDate, tasks)[0]?.tasks ?? [],
    [viewDate, tasks],
  );
  const markers = useMemo(
    () => getDayMarkers(viewDate, tasks),
    [viewDate, tasks],
  );

  // A deadline (due-only) task belongs in "starts & due" as a milestone — it has
  // no duration to be "in flight" for.
  const inFlight = useMemo(
    () => sortTasksByPriority(dayTasks.filter((t) => !isMilestone(t))),
    [dayTasks],
  );

  const dueCount = markers.filter((m) => m.kind !== "starts").length;
  const startCount = markers.filter((m) => m.kind === "starts").length;
  const blockedCount = inFlight.filter((t) => t.status === "blocked").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-base-100/10">
      {/* Same summary language as the week view */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-base-200/40 bg-base-200/20 px-4 py-2.5 text-xs text-base-content/60">
        <Stat color="bg-primary" n={inFlight.length} label="in flight" />
        <Stat color="bg-error" n={dueCount} label="due today" />
        <Stat color="bg-success" n={startCount} label="starting" />
        {blockedCount > 0 && (
          <Stat color="bg-error" n={blockedCount} label="blocked" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ZoneLabel
          title="In flight"
          count={`· ${inFlight.length} task${inFlight.length !== 1 ? "s" : ""}`}
        />
        <div className="flex flex-col gap-1.5 p-3">
          {inFlight.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-base-content/40">
              <CalendarDays className="mb-3 h-9 w-9 opacity-50" />
              <p className="text-sm font-medium">Nothing in flight today</p>
            </div>
          ) : (
            inFlight.map((task) => (
              <DayBar
                key={task.id}
                task={task}
                viewDate={viewDate}
                color={getColor(task)}
                members={members}
                onClick={onClickTask}
              />
            ))
          )}
        </div>

        <ZoneLabel title="Starts &amp; due" />
        <div className="p-3">
          {markers.length === 0 ? (
            <div className="py-6 text-center text-xs text-base-content/30">
              Nothing starts or is due today
            </div>
          ) : (
            <div
              className="grid items-start gap-2"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              }}
            >
              {markers.map((marker, i) => (
                <DayMarkerChip
                  key={`${marker.task.id}-${marker.kind}-${i}`}
                  marker={marker}
                  color={getColor(marker.task)}
                  onClick={onClickTask}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Estimated hours come through as raw floats (13.06) — show at most one decimal. */
function formatHours(hours?: number | null): string | null {
  if (typeof hours !== "number" || hours <= 0) return null;
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

/** Full-width bar: a day is a single column, so the strip spans the whole row. */
function DayBar({
  task,
  viewDate,
  color,
  members,
  onClick,
}: {
  task: Task;
  viewDate: Date;
  color: CalendarColor;
  members?: ProjectMember[];
  onClick?: (task: Task) => void;
}) {
  const progress =
    typeof task.progress === "number"
      ? Math.max(0, Math.min(100, task.progress))
      : 0;
  const assignee = members?.find(
    (m) =>
      m.user_id === task.assignee_id || task.assignee_ids?.includes(m.user_id),
  );

  const dayKey = toDateKey(viewDate);
  const startedBefore = task.start_date
    ? toDateKey(new Date(task.start_date)) < dayKey
    : false;
  const continuesAfter = task.due_date
    ? toDateKey(new Date(task.due_date)) > dayKey
    : false;
  const hours = formatHours(task.estimated_hours);

  return (
    <button
      className={cn(
        "cal-bar relative flex h-[34px] w-full items-center gap-2 rounded-lg px-3 overflow-hidden",
        "cursor-pointer transition-all hover:-translate-y-px hover:shadow-md",
        task.status === "done" && "cal-done",
      )}
      style={{ ["--cal-a"]: color.bg } as CSSProperties}
      title={`${task.title} — ${statusLabel(task.status)} (${task.priority})\n${formatDateRange(task.start_date, task.due_date)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(task);
      }}
    >
      {progress > 0 && (
        <span className="cal-prog" style={{ width: `${progress}%` }} />
      )}
      {startedBefore && (
        <span className="cal-z text-xs font-bold opacity-55">‹</span>
      )}
      {task.status === "blocked" && <span className="cal-dot-red cal-z" />}
      <span className="cal-lbl cal-z min-w-0 truncate text-[13px] font-semibold">
        {task.title}
      </span>
      {task.recurrence_rule && (
        <Repeat className="cal-z h-3 w-3 shrink-0 opacity-50" />
      )}
      <span className="cal-z ml-auto flex shrink-0 items-center gap-2.5">
        {hours && (
          <span className="hidden items-center gap-1 text-[11px] tabular-nums text-base-content/50 sm:inline-flex">
            <Clock className="h-3 w-3" />
            {hours}
          </span>
        )}
        <span className="hidden text-[11px] tabular-nums text-base-content/50 md:inline">
          {formatDateRange(task.start_date, task.due_date)}
        </span>
        {assignee && (
          <Avatar
            name={assignee.display_name || assignee.email}
            src={assignee.avatar_url}
            size="xs"
          />
        )}
        {progress > 0 && (
          <span className="cal-pct text-[10.5px] font-bold tabular-nums">
            {progress}%
          </span>
        )}
      </span>
      {continuesAfter && (
        <span className="cal-z text-xs font-bold opacity-55">›</span>
      )}
    </button>
  );
}
