// Curated calendar palette. Ordered so consecutive indices are visually distant
// (warm/cool alternating) — incremental assignment never places two similar hues
// side by side. Solid fills for now; the tinted "premium bar" treatment lands in
// the bar-restyle pass. `accent` (same hue, darker) is reserved for that pass.
export interface CalendarColor {
  bg: string;
  text: string;
  accent: string;
}

export const CALENDAR_PALETTE: CalendarColor[] = [
  { bg: "#6366F1", text: "#ffffff", accent: "#4f46e5" }, // indigo
  { bg: "#F59E0B", text: "#3b2f0b", accent: "#d97706" }, // amber
  { bg: "#10B981", text: "#052e21", accent: "#059669" }, // emerald
  { bg: "#F43F5E", text: "#ffffff", accent: "#e11d48" }, // rose
  { bg: "#0EA5E9", text: "#ffffff", accent: "#0284c7" }, // sky
  { bg: "#F97316", text: "#3a1c05", accent: "#ea580c" }, // orange
  { bg: "#8B5CF6", text: "#ffffff", accent: "#7c3aed" }, // violet
  { bg: "#84CC16", text: "#1a2e05", accent: "#65a30d" }, // lime
  { bg: "#EC4899", text: "#ffffff", accent: "#db2777" }, // pink
  { bg: "#14B8A6", text: "#04211d", accent: "#0d9488" }, // teal
  { bg: "#D946EF", text: "#ffffff", accent: "#c026d3" }, // fuchsia
  { bg: "#06B6D4", text: "#04252b", accent: "#0891b2" }, // cyan
];

// FNV-1a 32-bit — a stable, well-spread hash so the same key always maps to the
// same color across renders while distributing keys across the palette.
function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Color for a positional index (used where entries are already numbered, e.g.
 * project/team timelines). First 12 distinct indices are all different. */
export function colorForIndex(index: number): CalendarColor {
  return CALENDAR_PALETTE[index % CALENDAR_PALETTE.length];
}

/** Deterministic color for an arbitrary string key (used for per-task coloring
 * where there is no natural index). Same key → same color every render. */
export function colorForKey(key: string): CalendarColor {
  return CALENDAR_PALETTE[hashKey(key) % CALENDAR_PALETTE.length];
}
