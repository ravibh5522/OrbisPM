import { create } from "zustand";

type Theme = "orbis" | "dark" | "light" | "cupcake" | "forest" | "night";

interface UIState {
  sidebarCollapsed: boolean;
  theme: Theme;
  commandPaletteOpen: boolean;
  mobileMenuOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setMobileMenuOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  theme: (typeof window !== "undefined" ? localStorage.getItem("theme") as Theme : null) || "orbis",
  commandPaletteOpen: false,
  mobileMenuOpen: false,

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
}));

export const THEMES: { label: string; value: Theme }[] = [
  { label: "OrbisPM", value: "orbis" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "Cupcake", value: "cupcake" },
  { label: "Forest", value: "forest" },
  { label: "Night", value: "night" },
];
