import { create } from "zustand";
import {
  DEFAULT_PROFILE_ID,
  findProfile,
  PROFILES_BY_THEME,
  ThemeColorProfile,
} from "@/lib/theme-profiles";

type Theme = "glass-light" | "glass-dark" | "orbis-light" | "orbis-dark";
type ProjectTab =
  | "tasks"
  | "members"
  | "teams"
  | "reviews"
  | "announcements"
  | "dashboard"
  | "settings";
type TaskViewMode = "columns" | "list" | "tree" | "calendar";

/** Stored as `{profile_id, primary_override?, base_content_override?}` */
export interface ThemeCustomisation {
  /** Profile id e.g. "glass-dark:nebula" */
  profileId: string;
  /** Optional free-choice primary colour (hex or oklch).
   *  When set, overrides the profile primary but keeps secondary/accent. */
  primaryOverride?: string;
  /** Optional text (base-content) colour override. */
  baseContentOverride?: string;
}

interface UIState {
  sidebarCollapsed: boolean;
  theme: Theme;
  customisation: ThemeCustomisation | null;
  themeLocked: boolean;
  commandPaletteOpen: boolean;
  mobileMenuOpen: boolean;
  breadcrumb: { label: string; backHref?: string } | null;

  // Per-project view persistence
  projectTabs: Record<string, ProjectTab>;
  projectTaskViews: Record<string, TaskViewMode>;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  setCustomisation: (c: ThemeCustomisation | null) => void;
  /** Apply colours from a customisation without persisting to localStorage. */
  applyCustomisation: (c: ThemeCustomisation | null) => void;
  setThemeLocked: (locked: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setMobileMenuOpen: (v: boolean) => void;
  setBreadcrumb: (b: { label: string; backHref?: string } | null) => void;
  setProjectTab: (projectId: string, tab: ProjectTab) => void;
  getProjectTab: (projectId: string) => ProjectTab;
  setProjectTaskView: (projectId: string, view: TaskViewMode) => void;
  getProjectTaskView: (projectId: string) => TaskViewMode;
}

const VALID_THEMES: Theme[] = [
  "glass-light",
  "glass-dark",
  "orbis-light",
  "orbis-dark",
];

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "orbis-light";
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored && VALID_THEMES.includes(stored)) return stored;
  return "orbis-light";
}

function getStoredCustomisation(): ThemeCustomisation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("theme_customisation");
    if (!raw) return null;
    return JSON.parse(raw) as ThemeCustomisation;
  } catch {
    return null;
  }
}

function getStoredProjectViews(): {
  tabs: Record<string, ProjectTab>;
  views: Record<string, TaskViewMode>;
} {
  if (typeof window === "undefined") return { tabs: {}, views: {} };
  try {
    const tabs = JSON.parse(localStorage.getItem("project_tabs") || "{}");
    const views = JSON.parse(
      localStorage.getItem("project_task_views") || "{}",
    );
    return { tabs, views };
  } catch {
    return { tabs: {}, views: {} };
  }
}

/**
 * Applies theme profile colour vars to :root.
 * Also applies primary / base-content overrides if present.
 * Pass null to clear all inline overrides (revert to CSS theme defaults).
 */
export function applyThemeCustomisation(
  theme: Theme,
  customisation: ThemeCustomisation | null,
) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  const ALL_VARS = [
    "--color-primary",
    "--color-primary-content",
    "--color-secondary",
    "--color-secondary-content",
    "--color-accent",
    "--color-accent-content",
    "--color-base-content",
  ];

  // Clear previous inline overrides
  ALL_VARS.forEach((v) => root.style.removeProperty(v));

  if (!customisation) return;

  // Resolve profile
  const profile =
    findProfile(customisation.profileId) ??
    findProfile(DEFAULT_PROFILE_ID[theme]) ??
    PROFILES_BY_THEME[theme]?.[0];

  if (!profile) return;

  // Apply profile vars
  Object.entries(profile.vars).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });

  // Apply individual overrides (these take precedence)
  if (customisation.primaryOverride) {
    root.style.setProperty("--color-primary", customisation.primaryOverride);
    // Auto-derive primary-content from lightness
    const pct = extractOklchL(customisation.primaryOverride);
    if (pct !== null) {
      root.style.setProperty(
        "--color-primary-content",
        pct > 60 ? "oklch(15% 0.02 260)" : "oklch(97% 0.02 260)",
      );
    }
  }

  if (customisation.baseContentOverride) {
    root.style.setProperty("--color-base-content", customisation.baseContentOverride);
  }
}

/** Extract L% from an oklch() string, returns null for hex/other formats. */
function extractOklchL(value: string): number | null {
  const m = value.match(/oklch\(\s*([\d.]+)%/);
  return m ? parseFloat(m[1]) : null;
}

export const useUIStore = create<UIState>((set, get) => {
  const stored = getStoredProjectViews();
  const storedCustomisation = getStoredCustomisation();
  const storedTheme = getStoredTheme();

  if (typeof window !== "undefined") {
    applyThemeCustomisation(storedTheme, storedCustomisation);
  }

  return {
    sidebarCollapsed: false,
    theme: storedTheme,
    customisation: storedCustomisation,
    themeLocked: false,
    commandPaletteOpen: false,
    mobileMenuOpen: false,
    breadcrumb: null,
    projectTabs: stored.tabs,
    projectTaskViews: stored.views,

    toggleSidebar: () =>
      set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

    setTheme: (t) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", t);
        document.documentElement.setAttribute("data-theme", t);
      }
      // Clear customisation when switching base theme
      set({ theme: t, customisation: null });
      if (typeof window !== "undefined") {
        applyThemeCustomisation(t, null);
        localStorage.removeItem("theme_customisation");
      }
    },

    setCustomisation: (c) => {
      if (typeof window !== "undefined") {
        if (c) {
          localStorage.setItem("theme_customisation", JSON.stringify(c));
        } else {
          localStorage.removeItem("theme_customisation");
        }
      }
      applyThemeCustomisation(get().theme, c);
      set({ customisation: c });
    },

    applyCustomisation: (c) => {
      applyThemeCustomisation(get().theme, c);
      set({ customisation: c });
    },

    setThemeLocked: (locked) => set({ themeLocked: locked }),
    setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
    setMobileMenuOpen: (v) => set({ mobileMenuOpen: v }),
    setBreadcrumb: (b) => set({ breadcrumb: b }),

    setProjectTab: (projectId, tab) => {
      set((s) => {
        const next = { ...s.projectTabs, [projectId]: tab };
        if (typeof window !== "undefined")
          localStorage.setItem("project_tabs", JSON.stringify(next));
        return { projectTabs: next };
      });
    },
    getProjectTab: (projectId) => get().projectTabs[projectId] || "tasks",

    setProjectTaskView: (projectId, view) => {
      set((s) => {
        const next = { ...s.projectTaskViews, [projectId]: view };
        if (typeof window !== "undefined")
          localStorage.setItem("project_task_views", JSON.stringify(next));
        return { projectTaskViews: next };
      });
    },
    getProjectTaskView: (projectId) =>
      get().projectTaskViews[projectId] || "columns",
  };
});

export const THEMES: {
  label: string;
  value: Theme;
  description: string;
  colorScheme: "light" | "dark";
}[] = [
  {
    label: "Glass Light",
    value: "glass-light",
    description: "Frosted glass with light gradient",
    colorScheme: "light",
  },
  {
    label: "Glass Dark",
    value: "glass-dark",
    description: "Frosted glass with dark gradient",
    colorScheme: "dark",
  },
  {
    label: "Orbis Light",
    value: "orbis-light",
    description: "Clean minimal light",
    colorScheme: "light",
  },
  {
    label: "Orbis Dark",
    value: "orbis-dark",
    description: "Clean minimal dark",
    colorScheme: "dark",
  },
];

/** Re-export for convenience */
export type { ThemeColorProfile };
export { PROFILES_BY_THEME, DEFAULT_PROFILE_ID, findProfile };
