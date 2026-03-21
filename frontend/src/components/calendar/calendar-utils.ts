import type { Task } from "@/types/domain";

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: Task[];
}

export type CalendarViewMode = "month" | "week" | "day";
export type CalendarGroupBy = "none" | "project" | "team";

/* ── Strip: a task rendered as a horizontal bar across calendar cells ── */
export interface TaskStrip {
  task: Task;
  /** 0-based column index where the strip starts (within the grid row) */
  startCol: number;
  /** How many columns the strip spans */
  span: number;
  /** Visual row slot within the day cell (for stacking) */
  lane: number;
  /** Is the left edge clipped (task started before this week row)? */
  clippedStart: boolean;
  /** Is the right edge clipped (task continues beyond this week row)? */
  clippedEnd: boolean;
}

/** A row of 7 days in the month grid with pre-computed strips */
export interface MonthWeekRow {
  days: CalendarDay[];
  /** Task strips laid out across this 7-day row */
  strips: TaskStrip[];
}

/* ────────────────────────────────────────────────────── */
/*  Grid Generators                                       */
/* ────────────────────────────────────────────────────── */

function getMonthGridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const day = first.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(year, month, 1 - diff);
}

/** Generate 6x7 month grid WITH strip layout per row */
export function getMonthGridWithStrips(
  year: number,
  month: number,
  tasks: Task[]
): MonthWeekRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gridStart = getMonthGridStart(year, month);

  const allDays: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    allDays.push({
      date: new Date(date),
      isCurrentMonth: date.getMonth() === month,
      isToday: date.getTime() === today.getTime(),
      tasks: [],
    });
  }

  const rows: MonthWeekRow[] = [];
  for (let r = 0; r < 6; r++) {
    const days = allDays.slice(r * 7, r * 7 + 7);
    const rowStart = days[0].date;
    const rowEnd = days[6].date;
    const strips = layoutStrips(tasks, rowStart, rowEnd);

    // Also populate day.tasks for point-in-time tasks
    const tasksByDate = buildTaskDateMap(tasks);
    for (const day of days) {
      day.tasks = tasksByDate.get(toDateKey(day.date)) || [];
    }

    rows.push({ days, strips });
  }

  return rows;
}

/** Lay out task strips for a 7-day row */
function layoutStrips(tasks: Task[], rowStart: Date, rowEnd: Date): TaskStrip[] {
  const rowStartMs = rowStart.getTime();
  const rowEndMs = rowEnd.getTime();
  const dayMs = 86400000;

  type StripCandidate = {
    task: Task;
    startCol: number;
    endCol: number;
    clippedStart: boolean;
    clippedEnd: boolean;
  };

  const candidates: StripCandidate[] = [];

  for (const task of tasks) {
    const dueStr = task.due_date;
    const startStr = task.start_date;
    if (!dueStr && !startStr) continue;

    let taskStart: Date;
    let taskEnd: Date;

    if (startStr && dueStr) {
      taskStart = new Date(startStr);
      taskEnd = new Date(dueStr);
      if (taskStart > taskEnd) [taskStart, taskEnd] = [taskEnd, taskStart];
    } else {
      const d = new Date(dueStr || startStr!);
      taskStart = d;
      taskEnd = d;
    }

    taskStart.setHours(0, 0, 0, 0);
    taskEnd.setHours(0, 0, 0, 0);

    if (taskEnd.getTime() < rowStartMs || taskStart.getTime() > rowEndMs) continue;

    const clippedStart = taskStart.getTime() < rowStartMs;
    const clippedEnd = taskEnd.getTime() > rowEndMs;

    const visibleStart = clippedStart ? rowStart : taskStart;
    const visibleEnd = clippedEnd ? rowEnd : taskEnd;

    const startCol = Math.round((visibleStart.getTime() - rowStartMs) / dayMs);
    const endCol = Math.round((visibleEnd.getTime() - rowStartMs) / dayMs);

    candidates.push({
      task,
      startCol: Math.max(0, Math.min(6, startCol)),
      endCol: Math.max(0, Math.min(6, endCol)),
      clippedStart,
      clippedEnd,
    });
  }

  // Sort: wider first, then by start col
  candidates.sort((a, b) => {
    const spanA = a.endCol - a.startCol;
    const spanB = b.endCol - b.startCol;
    if (spanA !== spanB) return spanB - spanA;
    return a.startCol - b.startCol;
  });

  // Greedy lane assignment
  const strips: TaskStrip[] = [];
  const lanes: [number, number][][] = [];

  for (const c of candidates) {
    let lane = 0;
    while (true) {
      if (!lanes[lane]) lanes[lane] = [];
      const conflict = lanes[lane].some(
        ([s, e]) => !(c.endCol < s || c.startCol > e)
      );
      if (!conflict) break;
      lane++;
    }
    lanes[lane].push([c.startCol, c.endCol]);
    strips.push({
      task: c.task,
      startCol: c.startCol,
      span: c.endCol - c.startCol + 1,
      lane,
      clippedStart: c.clippedStart,
      clippedEnd: c.clippedEnd,
    });
  }

  return strips;
}

/* ── Flat month grid (backward compat) ── */
export function getMonthGrid(year: number, month: number, tasks: Task[]): CalendarDay[] {
  const rows = getMonthGridWithStrips(year, month, tasks);
  return rows.flatMap((r) => r.days);
}

/* ── Week / Day grids ── */
export function getWeekGrid(date: Date, tasks: Task[]): CalendarDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(date);
  monday.setDate(date.getDate() - diff);
  const tasksByDate = buildTaskDateMap(tasks);
  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      date: new Date(d),
      isCurrentMonth: d.getMonth() === date.getMonth(),
      isToday: d.getTime() === today.getTime(),
      tasks: tasksByDate.get(toDateKey(d)) || [],
    });
  }
  return days;
}

export function getDayGrid(date: Date, tasks: Task[]): CalendarDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tasksByDate = buildTaskDateMap(tasks);
  const dateKey = toDateKey(date);
  return [{
    date: new Date(date),
    isCurrentMonth: true,
    isToday: date.getTime() === today.getTime(),
    tasks: tasksByDate.get(dateKey) || [],
  }];
}

/* ── Date -> Task[] map (place task on each day it spans) ── */
function buildTaskDateMap(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    const startStr = task.start_date;
    const dueStr = task.due_date;
    if (!startStr && !dueStr) continue;

    let from: Date, to: Date;
    if (startStr && dueStr) {
      from = new Date(startStr);
      to = new Date(dueStr);
      if (from > to) [from, to] = [to, from];
    } else {
      const d = new Date((dueStr || startStr)!);
      from = d;
      to = d;
    }
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);

    const cursor = new Date(from);
    let safety = 0;
    while (cursor <= to && safety < 60) {
      const key = toDateKey(cursor);
      const arr = map.get(key);
      if (arr) arr.push(task);
      else map.set(key, [task]);
      cursor.setDate(cursor.getDate() + 1);
      safety++;
    }
  }
  return map;
}

/* ── Helpers ── */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatWeekRange(date: Date): string {
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(date);
  monday.setDate(date.getDate() - diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${monday.toLocaleDateString("en-US", opts)} – ${sunday.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export function getDateRange(viewDate: Date, mode: CalendarViewMode): { from: string; to: string } {
  if (mode === "month") {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const gridStart = getMonthGridStart(year, month);
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + 41);
    return { from: toDateKey(gridStart), to: toDateKey(gridEnd) };
  }
  if (mode === "week") {
    const day = viewDate.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(viewDate);
    monday.setDate(viewDate.getDate() - diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: toDateKey(monday), to: toDateKey(sunday) };
  }
  return { from: toDateKey(viewDate), to: toDateKey(viewDate) };
}

export function navigateDate(viewDate: Date, mode: CalendarViewMode, direction: 1 | -1): Date {
  const d = new Date(viewDate);
  if (mode === "month") d.setMonth(d.getMonth() + direction);
  else if (mode === "week") d.setDate(d.getDate() + 7 * direction);
  else d.setDate(d.getDate() + direction);
  return d;
}

export function getWeekdayLabels(): string[] {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

export function sortTasksByPriority(tasks: Task[]): Task[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...tasks].sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
}

/** Extract unique values from tasks for auto-generated filter options */
export function extractFilterOptions(tasks: Task[]) {
  const labels = new Set<string>();
  const parentIds = new Map<string, string>();
  const projectIds = new Set<string>();
  const assigneeIds = new Set<string>();

  for (const t of tasks) {
    t.labels?.forEach((l) => labels.add(l));
    if (t.parent_task_id) parentIds.set(t.parent_task_id, "");
    projectIds.add(t.project_id);
    t.assignee_ids?.forEach((a) => assigneeIds.add(a));
    if (t.assignee_id) assigneeIds.add(t.assignee_id);
  }

  return {
    labels: Array.from(labels).sort(),
    parentTaskIds: Array.from(parentIds.keys()),
    projectIds: Array.from(projectIds),
    assigneeIds: Array.from(assigneeIds),
  };
}

/** Format date range for a task strip tooltip */
export function formatDateRange(start?: string | null, end?: string | null): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Due ${fmt(end)}`;
  return "";
}
