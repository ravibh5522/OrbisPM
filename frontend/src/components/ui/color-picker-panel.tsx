"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { ThemeColorProfile } from "@/lib/theme-profiles";

/* ─────────────────────────────────────────────────────────────────────────────
   Profile swatch card
   ───────────────────────────────────────────────────────────────────────────── */

interface ProfileSwatchProps {
  profile: ThemeColorProfile;
  selected: boolean;
  onClick: () => void;
  /** "dark" | "light" — controls swatch card background */
  colorScheme: "dark" | "light";
}

export function ProfileSwatch({
  profile,
  selected,
  onClick,
  colorScheme,
}: ProfileSwatchProps) {
  const { primary, secondary, accent } = profile.preview;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${profile.name} — ${profile.description}`}
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl p-3 border-2 transition-all duration-150 cursor-pointer w-full text-left",
        selected
          ? "border-primary shadow-md scale-[1.02]"
          : "border-base-300 hover:border-base-content/20 hover:shadow-sm",
      )}
      style={{
        backgroundColor: colorScheme === "dark" ? "oklch(16% 0.02 270)" : "oklch(96% 0.01 265)",
      }}
    >
      {/* Colour trio */}
      <div className="flex items-center gap-1.5">
        {/* Large primary dot */}
        <span
          className="w-7 h-7 rounded-full shadow-sm flex-shrink-0"
          style={{ backgroundColor: primary }}
        />
        {/* Secondary + accent stacked */}
        <div className="flex flex-col gap-1">
          <span
            className="w-4 h-3 rounded-sm"
            style={{ backgroundColor: secondary }}
          />
          <span
            className="w-4 h-3 rounded-sm"
            style={{ backgroundColor: accent }}
          />
        </div>
        {/* Tick */}
        {selected && (
          <span
            className="ml-auto w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: primary }}
          >
            <Check className="w-3 h-3 text-white" />
          </span>
        )}
      </div>
      {/* Name */}
      <div>
        <p
          className="text-xs font-semibold"
          style={{ color: colorScheme === "dark" ? "#f0f0ff" : "#1e1b4b" }}
        >
          {profile.name}
        </p>
        <p
          className="text-[10px] leading-tight opacity-60 mt-0.5"
          style={{ color: colorScheme === "dark" ? "#f0f0ff" : "#1e1b4b" }}
        >
          {profile.description}
        </p>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PrimaryColorPicker — for the "custom primary" fine-tune section.
   Shows 12 curated single-colour swatches relevant to the theme, plus a hex
   input and the native colour picker as a last resort.
   ───────────────────────────────────────────────────────────────────────────── */

const LIGHT_THEME_PRIMARIES = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#f97316", "#f59e0b",
  "#10b981", "#059669", "#0891b2", "#0284c7",
];

const DARK_THEME_PRIMARIES = [
  "#818cf8", "#a78bfa", "#c084fc", "#f472b6",
  "#fb7185", "#fb923c", "#fbbf24", "#34d399",
  "#2dd4bf", "#38bdf8", "#60a5fa", "#e879f9",
];

interface PrimaryColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  colorScheme: "dark" | "light";
}

export function PrimaryColorPicker({
  value,
  onChange,
  colorScheme,
}: PrimaryColorPickerProps) {
  const swatches =
    colorScheme === "dark" ? DARK_THEME_PRIMARIES : LIGHT_THEME_PRIMARIES;
  const currentHex = value?.startsWith("#") ? value : swatches[0];

  return (
    <div className="space-y-3">
      {/* Swatch grid */}
      <div className="flex flex-wrap gap-2">
        {swatches.map((hex) => {
          const isSelected = currentHex.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => onChange(hex)}
              className={cn(
                "w-8 h-8 rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center",
                "hover:scale-110 hover:shadow-lg hover:z-10",
                isSelected && "ring-2 ring-offset-2 ring-offset-base-100 ring-primary scale-110",
              )}
              style={{ backgroundColor: hex }}
            >
              {isSelected && (
                <Check className="w-3.5 h-3.5 drop-shadow"
                  style={{ color: isLightHex(hex) ? "#000" : "#fff" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Hex input + colour wheel */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg border border-base-300 shadow-inner flex-shrink-0"
          style={{ backgroundColor: currentHex }}
        />
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 text-sm font-mono">#</span>
          <input
            type="text"
            value={currentHex.replace("#", "")}
            maxLength={6}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, "");
              if (v.length === 6) onChange(`#${v}`);
            }}
            className="input input-sm input-bordered w-full pl-7 font-mono text-sm"
            placeholder="6366f1"
          />
        </div>
        <input
          type="color"
          value={currentHex}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg cursor-pointer border border-base-300 bg-transparent p-0.5 flex-shrink-0"
          title="Open native colour picker"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Utilities
   ───────────────────────────────────────────────────────────────────────────── */
export function isLightHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}
