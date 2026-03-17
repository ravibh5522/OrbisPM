import { create } from "zustand";

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

interface UIState {
  sidebarCollapsed: boolean;
  theme: Theme;
  commandPaletteOpen: boolean;
  mobileMenuOpen: boolean;
  breadcrumb: { label: string; backHref?: string } | null;

  // Per-project view persistence
  projectTabs: Record<string, ProjectTab>;
  projectTaskViews: Record<string, TaskViewMode>;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (t: Theme) => void;
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

export const useUIStore = create<UIState>((set, get) => {
  const stored = getStoredProjectViews();
  return {
    sidebarCollapsed: false,
    theme: getStoredTheme(),
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
      set({ theme: t });
    },
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
