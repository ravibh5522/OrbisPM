/**
 * OrbisPM — Theme preview tile data
 *
 * Single source of truth for the mini-tile previews shown in the
 * theme picker (settings → Theme tab AND profile → Appearance tab).
 *
 * Both pages import from here instead of duplicating the constant.
 */

export interface ThemePreview {
  bg: string;
  card: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
}

export const THEME_PREVIEWS: Record<string, ThemePreview> = {
  "glass-light": {
    bg: "bg-gradient-to-br from-indigo-100 via-purple-50 to-teal-50",
    card: "bg-white/60 backdrop-blur-md border border-white/40",
    primary: "bg-indigo-500",
    secondary: "bg-violet-400",
    accent: "bg-teal-400",
    text: "text-gray-800",
  },
  "glass-dark": {
    bg: "bg-gradient-to-br from-purple-950 via-indigo-950 to-cyan-950",
    card: "bg-white/10 backdrop-blur-md border border-white/10",
    primary: "bg-violet-500",
    secondary: "bg-cyan-400",
    accent: "bg-rose-400",
    text: "text-white",
  },
  "orbis-light": {
    bg: "bg-slate-50",
    card: "bg-white border border-slate-200",
    primary: "bg-blue-600",
    secondary: "bg-sky-500",
    accent: "bg-emerald-500",
    text: "text-slate-800",
  },
  "orbis-dark": {
    bg: "bg-slate-900",
    card: "bg-slate-800 border border-slate-700",
    primary: "bg-indigo-500",
    secondary: "bg-teal-500",
    accent: "bg-amber-400",
    text: "text-white",
  },
};
