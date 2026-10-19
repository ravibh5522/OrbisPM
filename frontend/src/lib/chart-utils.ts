/**
 * Simplify Projects — Shared Recharts chart configuration
 *
 * Import these constants in every chart component instead of
 * defining tooltip styles, cursor styles, and axis props inline.
 *
 * Usage:
 *   import { CHART_TOOLTIP_STYLE, CHART_CURSOR_STYLE, CHART_AXIS_STYLE } from "@/lib/chart-utils";
 *
 *   <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR_STYLE} />
 *   <XAxis tick={CHART_AXIS_STYLE} />
 */
import type { CSSProperties } from "react";

/**
 * Glassmorphic tooltip container style.
 * Uses CSS variables so it adapts automatically to all 4 themes:
 *   - bg-base-100 for background
 *   - border-base-200 for the border
 *   - base-content for text
 */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "var(--color-base-100)",
  border: "1px solid var(--color-base-200)",
  borderRadius: 10,
  color: "var(--color-base-content)",
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 4px 24px oklch(0% 0 0 / 0.15), 0 1px 4px oklch(0% 0 0 / 0.08)",
};

/**
 * Hover cursor bar/area fill that stays theme-aware.
 */
export const CHART_CURSOR_STYLE: CSSProperties = {
  fill: "var(--color-base-content)",
  fillOpacity: 0.06,
};

/**
 * Axis tick text style shared by XAxis / YAxis across all charts.
 */
export const CHART_AXIS_STYLE = {
  fontSize: 12,
  fill: "var(--color-base-content)",
  fillOpacity: 0.5,
} as const;

/**
 * Common chart margin used across Bar, Line, Area charts.
 */
export const CHART_MARGIN = { top: 8, right: 8, left: -16, bottom: 0 } as const;

/**
 * Fallback color palette for charts that use dynamic keys.
 * Index 0 is the default fallback (matches slate-400).
 */
export const CHART_PALETTE = [
  "#94a3b8",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
] as const;

/**
 * Build a Recharts tick-formatter for percentages.
 */
export function pctFormatter(value: number): string {
  return `${value}%`;
}
