// Chat background presets. Values use low-opacity rgba so they read well on
// both light and dark base-100 grounds (theme-aware without per-theme assets).
export interface ChatBackground {
  id: string;
  label: string;
  image: string; // CSS background-image ("" = default / none)
  size?: string; // CSS background-size
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  { id: "default", label: "Default", image: "" },
  {
    id: "soft",
    label: "Soft",
    image:
      "radial-gradient(circle at 15% 15%, rgba(99,102,241,0.07), transparent 42%), radial-gradient(circle at 85% 85%, rgba(16,185,129,0.07), transparent 42%)",
  },
  {
    id: "dots",
    label: "Dots",
    image: "radial-gradient(rgba(128,128,128,0.14) 1px, transparent 1px)",
    size: "18px 18px",
  },
  {
    id: "grid",
    label: "Grid",
    image:
      "linear-gradient(rgba(128,128,128,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(128,128,128,0.07) 1px, transparent 1px)",
    size: "24px 24px",
  },
  {
    id: "warm",
    label: "Warm",
    image:
      "linear-gradient(135deg, rgba(251,146,60,0.08), rgba(236,72,153,0.06))",
  },
  {
    id: "cool",
    label: "Cool",
    image:
      "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(14,165,233,0.06))",
  },
];

export function getChatBackground(id: string): ChatBackground {
  return CHAT_BACKGROUNDS.find((b) => b.id === id) ?? CHAT_BACKGROUNDS[0];
}
