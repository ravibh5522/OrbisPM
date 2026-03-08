import { create } from "zustand";

type Theme = "glass-light" | "glass-dark" | "orbis-light" | "orbis-dark";

interface UIState {
  sidebarCollapsed: boolean;
  theme: Theme;
  commandPaletteOpen: boolean;
  mobileMenuOpen: boolean;
  breadcrumb: { label: string; backHref?: string } | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setMobileMenuOpen: (v: boolean) => void;
  setBreadcrumb: (b: { label: string; backHref?: string } | null) => void;
}

const VALID_THEMES: Theme[] = ["glass-light", "glass-dark", "orbis-light", "orbis-dark"];

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "orbis-light";
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored && VALID_THEMES.includes(stored)) return stored;
  return "orbis-light";
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  theme: getStoredTheme(),
  commandPaletteOpen: false,
  mobileMenuOpen: false,
  breadcrumb: null,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
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
}));

export const THEMES: { label: string; value: Theme; description: string; colorScheme: "light" | "dark" }[] = [
  { label: "Glass Light", value: "glass-light", description: "Frosted glass with light gradient", colorScheme: "light" },
  { label: "Glass Dark", value: "glass-dark", description: "Frosted glass with dark gradient", colorScheme: "dark" },
  { label: "Orbis Light", value: "orbis-light", description: "Clean minimal light", colorScheme: "light" },
  { label: "Orbis Dark", value: "orbis-dark", description: "Clean minimal dark", colorScheme: "dark" },
];
