/**
 * Simplify Projects — Single source of truth for task status and priority colors.
 *
 * Replaces all per-file STATUS_COLORS / PRIORITY_COLORS constant redefinitions.
 *
 * Two flavors for each:
 *   - BadgeClass maps  → DaisyUI `badge-*` modifier classes (for UI badges)
 *   - Hex maps         → CSS-variable-aware hex literals (for Recharts charts)
 *   - TextClass maps   → DaisyUI `text-*` classes (for colored text)
 *   - DotClass maps    → DaisyUI `bg-*` classes (for status dot indicators)
 *
 * Usage (badge):
 *   <span className={cn("badge badge-sm", STATUS_BADGE[task.status])}>
 *
 * Usage (chart):
 *   <Bar fill={STATUS_HEX[item.status] ?? "#94a3b8"} />
 */

import type { TaskPriority, TaskStatus } from "@/types/domain";

/* ─── Status: DaisyUI badge modifier ─────────────────────────── */
export const STATUS_BADGE: Record<TaskStatus, string> = {
  todo: "badge-ghost",
  in_progress: "badge-info",
  in_review: "badge-secondary",
  done: "badge-success",
  blocked: "badge-error",
  cancelled: "badge-ghost",
};

/* ─── Status: dot background color class ─────────────────────── */
export const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-base-content/30",
  in_progress: "bg-info",
  in_review: "bg-secondary",
  done: "bg-success",
  blocked: "bg-error",
  cancelled: "bg-base-content/20",
};

/* ─── Status: text color class ───────────────────────────────── */
export const STATUS_TEXT: Record<TaskStatus, string> = {
  todo: "text-base-content/60",
  in_progress: "text-info",
  in_review: "text-secondary",
  done: "text-success",
  blocked: "text-error",
  cancelled: "text-base-content/40",
};

/* ─── Status: hex color for Recharts (consistent across all views) */
export const STATUS_HEX: Record<TaskStatus, string> = {
  todo: "#94a3b8", // slate-400
  in_progress: "#3b82f6", // blue-500
  in_review: "#a855f7", // purple-500
  done: "#22c55e", // green-500
  blocked: "#ef4444", // red-500  ← authoritative (blocked = error/red)
  cancelled: "#6b7280", // gray-500
};

/* ─── Priority: DaisyUI badge modifier ───────────────────────── */
export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  critical: "badge-error",
  high: "badge-warning",
  medium: "badge-info",
  low: "badge-ghost",
};

/* ─── Priority: text color class ─────────────────────────────── */
export const PRIORITY_TEXT: Record<TaskPriority, string> = {
  critical: "text-error",
  high: "text-warning",
  medium: "text-info",
  low: "text-base-content/60",
};

/* ─── Priority: hex color for Recharts ───────────────────────── */
export const PRIORITY_HEX: Record<TaskPriority, string> = {
  critical: "#ef4444", // red-500
  high: "#f97316", // orange-500
  medium: "#eab308", // yellow-500
  low: "#94a3b8", // slate-400 (neutral/muted — NOT green)
};

/* ─── Generic multi-series chart palette ─────────────────────── */
export const CHART_PALETTE: string[] = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#22c55e", // green
];
