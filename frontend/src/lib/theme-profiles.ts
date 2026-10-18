/**
 * Theme colour profiles — curated, per-theme palettes.
 *
 * Each profile defines the full set of "brand" CSS custom properties that
 * differ from the theme's base defaults.  Background surfaces (base-100/200/300)
 * and semantic colours (info/success/warning/error) are left to the theme.
 *
 * Only primary, secondary and accent (+ their *-content counterparts) are
 * profile-scoped so every profile stays consistent with the theme's aesthetic.
 */

export interface ThemeColorProfile {
  /** Unique key used as the stored value */
  id: string;
  /** Display label */
  name: string;
  /** Short tagline shown in the swatch tooltip */
  description: string;
  /** CSS custom property overrides applied on top of the base theme */
  vars: {
    "--color-primary": string;
    "--color-primary-content": string;
    "--color-secondary": string;
    "--color-secondary-content": string;
    "--color-accent": string;
    "--color-accent-content": string;
  };
  /** Hex preview colours shown in the swatch UI (≈ visual match to oklch vars) */
  preview: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helper — derive a readable "content" colour from a primary oklch lightness.
   Light primary → dark content; dark primary → white content.
   ───────────────────────────────────────────────────────────────────────────── */

const LIGHT_CONTENT = "oklch(97% 0.02 260)"; // near-white
const DARK_CONTENT = "oklch(20% 0.03 260)";  // near-black

/* ─────────────────────────────────────────────────────────────────────────────
   orbis-light — clean, minimal light.  Colours should be saturated but not
   neon; they sit on a near-white surface.
   ───────────────────────────────────────────────────────────────────────────── */
export const ORBIS_LIGHT_PROFILES: ThemeColorProfile[] = [
  {
    id: "orbis-light:ds-red",
    name: "Design Red",
    description: "Red · Slate · Purple",
    vars: {
      "--color-primary": "#d92d39",
      "--color-primary-content": "#ffffff",
      "--color-secondary": "#3e4b51",
      "--color-secondary-content": "#ffffff",
      "--color-accent": "#9333ea",
      "--color-accent-content": "#ffffff",
    },
    preview: { primary: "#d92d39", secondary: "#3e4b51", accent: "#9333ea" },
  },
  {
    id: "orbis-light:ds-blue",
    name: "Design Blue",
    description: "Blue · Slate · Purple",
    vars: {
      "--color-primary": "#4285f6",
      "--color-primary-content": "#ffffff",
      "--color-secondary": "#3e4b51",
      "--color-secondary-content": "#ffffff",
      "--color-accent": "#9333ea",
      "--color-accent-content": "#ffffff",
    },
    preview: { primary: "#4285f6", secondary: "#3e4b51", accent: "#9333ea" },
  },
  {
    id: "orbis-light:ocean",
    name: "Ocean",
    description: "Blue · Sky · Emerald",
    vars: {
      "--color-primary": "oklch(50% 0.2 260)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(55% 0.15 200)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(65% 0.18 155)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#3b6cf4", secondary: "#0891b2", accent: "#10b981" },
  },
  {
    id: "orbis-light:violet",
    name: "Violet",
    description: "Purple · Indigo · Pink",
    vars: {
      "--color-primary": "oklch(48% 0.22 290)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(52% 0.2 310)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(62% 0.19 340)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#7c3aed", secondary: "#9333ea", accent: "#ec4899" },
  },
  {
    id: "orbis-light:forest",
    name: "Forest",
    description: "Emerald · Teal · Lime",
    vars: {
      "--color-primary": "oklch(55% 0.18 155)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(55% 0.15 175)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(68% 0.17 120)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#059669", secondary: "#0d9488", accent: "#65a30d" },
  },
  {
    id: "orbis-light:flame",
    name: "Flame",
    description: "Orange · Amber · Red",
    vars: {
      "--color-primary": "oklch(62% 0.2 40)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(70% 0.18 70)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(60% 0.22 20)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#ea580c", secondary: "#d97706", accent: "#dc2626" },
  },
  {
    id: "orbis-light:rose",
    name: "Rose",
    description: "Rose · Pink · Violet",
    vars: {
      "--color-primary": "oklch(52% 0.22 345)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(58% 0.2 320)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(54% 0.2 290)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#e11d48", secondary: "#db2777", accent: "#7c3aed" },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   orbis-dark — clean, minimal dark.  Colours should glow slightly against the
   dark surface.
   ───────────────────────────────────────────────────────────────────────────── */
export const ORBIS_DARK_PROFILES: ThemeColorProfile[] = [
  {
    id: "orbis-dark:ds-red",
    name: "Design Red",
    description: "Red · Grey · Purple",
    vars: {
      "--color-primary": "#d92d39",
      "--color-primary-content": "#ffffff",
      "--color-secondary": "#84878c",
      "--color-secondary-content": "#0c171d",
      "--color-accent": "#9333ea",
      "--color-accent-content": "#ffffff",
    },
    preview: { primary: "#d92d39", secondary: "#84878c", accent: "#9333ea" },
  },
  {
    id: "orbis-dark:ds-blue",
    name: "Design Blue",
    description: "Blue · Grey · Purple",
    vars: {
      "--color-primary": "#4285f6",
      "--color-primary-content": "#ffffff",
      "--color-secondary": "#84878c",
      "--color-secondary-content": "#0c171d",
      "--color-accent": "#9333ea",
      "--color-accent-content": "#ffffff",
    },
    preview: { primary: "#4285f6", secondary: "#84878c", accent: "#9333ea" },
  },
  {
    id: "orbis-dark:cosmos",
    name: "Cosmos",
    description: "Indigo · Teal · Amber",
    vars: {
      "--color-primary": "oklch(65% 0.2 265)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(68% 0.16 185)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(78% 0.15 80)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#6366f1", secondary: "#14b8a6", accent: "#f59e0b" },
  },
  {
    id: "orbis-dark:plasma",
    name: "Plasma",
    description: "Violet · Cyan · Rose",
    vars: {
      "--color-primary": "oklch(70% 0.2 280)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(74% 0.17 195)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(72% 0.18 350)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#8b5cf6", secondary: "#22d3ee", accent: "#f43f5e" },
  },
  {
    id: "orbis-dark:aurora",
    name: "Aurora",
    description: "Emerald · Blue · Purple",
    vars: {
      "--color-primary": "oklch(72% 0.18 155)",
      "--color-primary-content": DARK_CONTENT,
      "--color-secondary": "oklch(68% 0.18 220)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(70% 0.2 300)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#10b981", secondary: "#3b82f6", accent: "#a855f7" },
  },
  {
    id: "orbis-dark:ember",
    name: "Ember",
    description: "Orange · Red · Amber",
    vars: {
      "--color-primary": "oklch(72% 0.2 40)",
      "--color-primary-content": DARK_CONTENT,
      "--color-secondary": "oklch(68% 0.22 20)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(80% 0.18 80)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#f97316", secondary: "#ef4444", accent: "#fbbf24" },
  },
  {
    id: "orbis-dark:steel",
    name: "Steel",
    description: "Sky · Slate · Cyan",
    vars: {
      "--color-primary": "oklch(65% 0.16 230)",
      "--color-primary-content": DARK_CONTENT,
      "--color-secondary": "oklch(60% 0.12 255)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(72% 0.14 200)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#38bdf8", secondary: "#818cf8", accent: "#67e8f9" },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   glass-light — frosted glass on a soft pastel gradient.  Colours should be
   vibrant but still readable on the gradient bg.
   ───────────────────────────────────────────────────────────────────────────── */
export const GLASS_LIGHT_PROFILES: ThemeColorProfile[] = [
  {
    id: "glass-light:iris",
    name: "Iris",
    description: "Indigo · Violet · Teal",
    vars: {
      "--color-primary": "oklch(52% 0.22 265)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(57% 0.19 310)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(64% 0.16 180)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#4f46e5", secondary: "#9333ea", accent: "#0d9488" },
  },
  {
    id: "glass-light:sakura",
    name: "Sakura",
    description: "Pink · Rose · Plum",
    vars: {
      "--color-primary": "oklch(58% 0.22 350)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(60% 0.2 320)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(55% 0.2 290)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#f43f5e", secondary: "#ec4899", accent: "#a855f7" },
  },
  {
    id: "glass-light:garden",
    name: "Garden",
    description: "Teal · Emerald · Lime",
    vars: {
      "--color-primary": "oklch(58% 0.17 175)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(60% 0.18 155)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(68% 0.18 120)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#0d9488", secondary: "#059669", accent: "#65a30d" },
  },
  {
    id: "glass-light:coast",
    name: "Coast",
    description: "Sky · Blue · Cyan",
    vars: {
      "--color-primary": "oklch(58% 0.19 230)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(55% 0.18 245)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(65% 0.16 200)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#0ea5e9", secondary: "#3b82f6", accent: "#06b6d4" },
  },
  {
    id: "glass-light:dusk",
    name: "Dusk",
    description: "Orange · Amber · Coral",
    vars: {
      "--color-primary": "oklch(65% 0.2 45)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(72% 0.18 70)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(68% 0.2 30)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#f97316", secondary: "#f59e0b", accent: "#fb7185" },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   glass-dark — true frosted glass on a rich nebula gradient.  All colours
   should glow against the dark background.
   ───────────────────────────────────────────────────────────────────────────── */
export const GLASS_DARK_PROFILES: ThemeColorProfile[] = [
  {
    id: "glass-dark:nebula",
    name: "Nebula",
    description: "Violet · Cyan · Rose",
    vars: {
      "--color-primary": "oklch(72% 0.2 280)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(78% 0.17 195)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(74% 0.18 350)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#8b5cf6", secondary: "#22d3ee", accent: "#fb7185" },
  },
  {
    id: "glass-dark:galaxy",
    name: "Galaxy",
    description: "Deep Violet · Purple · Pink",
    vars: {
      "--color-primary": "oklch(65% 0.25 295)",
      "--color-primary-content": LIGHT_CONTENT,
      "--color-secondary": "oklch(68% 0.22 310)",
      "--color-secondary-content": LIGHT_CONTENT,
      "--color-accent": "oklch(76% 0.18 330)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#7c3aed", secondary: "#a855f7", accent: "#f472b6" },
  },
  {
    id: "glass-dark:arctic",
    name: "Arctic",
    description: "Cyan · Blue · Teal",
    vars: {
      "--color-primary": "oklch(80% 0.16 195)",
      "--color-primary-content": DARK_CONTENT,
      "--color-secondary": "oklch(70% 0.18 230)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(76% 0.16 180)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#22d3ee", secondary: "#60a5fa", accent: "#2dd4bf" },
  },
  {
    id: "glass-dark:solar",
    name: "Solar",
    description: "Amber · Orange · Red",
    vars: {
      "--color-primary": "oklch(82% 0.17 80)",
      "--color-primary-content": DARK_CONTENT,
      "--color-secondary": "oklch(76% 0.2 45)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(72% 0.22 20)",
      "--color-accent-content": LIGHT_CONTENT,
    },
    preview: { primary: "#fbbf24", secondary: "#fb923c", accent: "#f87171" },
  },
  {
    id: "glass-dark:emerald",
    name: "Emerald",
    description: "Green · Teal · Sky",
    vars: {
      "--color-primary": "oklch(76% 0.18 155)",
      "--color-primary-content": DARK_CONTENT,
      "--color-secondary": "oklch(76% 0.16 180)",
      "--color-secondary-content": DARK_CONTENT,
      "--color-accent": "oklch(78% 0.15 220)",
      "--color-accent-content": DARK_CONTENT,
    },
    preview: { primary: "#34d399", secondary: "#2dd4bf", accent: "#38bdf8" },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Unified lookup map
   ───────────────────────────────────────────────────────────────────────────── */
export const PROFILES_BY_THEME: Record<string, ThemeColorProfile[]> = {
  "orbis-light": ORBIS_LIGHT_PROFILES,
  "orbis-dark": ORBIS_DARK_PROFILES,
  "glass-light": GLASS_LIGHT_PROFILES,
  "glass-dark": GLASS_DARK_PROFILES,
};

/** Default profile id per theme (the first in each list). */
export const DEFAULT_PROFILE_ID: Record<string, string> = {
  "orbis-light": "orbis-light:ds-red",
  "orbis-dark": "orbis-dark:ds-red",
  "glass-light": "glass-light:iris",
  "glass-dark": "glass-dark:nebula",
};

/** Look up a profile by its id across all themes. */
export function findProfile(id: string): ThemeColorProfile | undefined {
  for (const profiles of Object.values(PROFILES_BY_THEME)) {
    const found = profiles.find((p) => p.id === id);
    if (found) return found;
  }
  return undefined;
}
