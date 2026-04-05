"use client";

import { Button } from "@/components/ui/button";
import {
  PrimaryColorPicker,
  ProfileSwatch,
  isLightHex,
} from "@/components/ui/color-picker-panel";
import { api } from "@/lib/api";
import {
  DEFAULT_PROFILE_ID,
  PROFILES_BY_THEME,
  findProfile,
} from "@/lib/theme-profiles";
import { cn } from "@/lib/utils";
import { THEMES, ThemeCustomisation, useUIStore } from "@/stores/ui-store";
import {
  ALargeSmall,
  Lock,
  Paintbrush,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

interface ThemeCustomizerModalProps {
  open: boolean;
  onClose: () => void;
  locked?: boolean;
}

export function ThemeCustomizerModal({
  open,
  onClose,
  locked = false,
}: ThemeCustomizerModalProps) {
  const { theme, customisation, setCustomisation } = useUIStore();
  const profiles = PROFILES_BY_THEME[theme] ?? [];
  const colorScheme =
    THEMES.find((t) => t.value === theme)?.colorScheme ?? "light";

  // ── Local draft state ────────────────────────────────────────────────────────
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    customisation?.profileId ??
      DEFAULT_PROFILE_ID[theme] ??
      profiles[0]?.id ??
      "",
  );
  const [primaryOverride, setPrimaryOverride] = useState<string>(
    customisation?.primaryOverride ?? "",
  );
  const [baseContentOverride, setBaseContentOverride] = useState<string>(
    customisation?.baseContentOverride ?? "",
  );
  const [showCustomPrimary, setShowCustomPrimary] = useState(
    !!customisation?.primaryOverride,
  );

  // Sync when modal opens or theme changes
  useEffect(() => {
    if (!open) return;
    setSelectedProfileId(
      customisation?.profileId ??
        DEFAULT_PROFILE_ID[theme] ??
        profiles[0]?.id ??
        "",
    );
    setPrimaryOverride(customisation?.primaryOverride ?? "");
    setBaseContentOverride(customisation?.baseContentOverride ?? "");
    setShowCustomPrimary(!!customisation?.primaryOverride);
  }, [open, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview as user clicks around
  const previewCustomisation = (): ThemeCustomisation => ({
    profileId: selectedProfileId,
    primaryOverride: primaryOverride || undefined,
    baseContentOverride: baseContentOverride || undefined,
  });

  // Auto-derive text colour from primary
  const derivedTextColor = (): string => {
    const primary =
      primaryOverride ||
      findProfile(selectedProfileId)?.preview.primary ||
      "#6366f1";
    return isLightHex(primary) ? "#1e1b4b" : "#f0f0ff";
  };

  const handleProfileClick = (id: string) => {
    if (locked) return;
    setSelectedProfileId(id);
    setPrimaryOverride(""); // clear any custom primary when switching profiles
    setBaseContentOverride("");
    setShowCustomPrimary(false);
  };

  const handleApply = () => {
    const c = previewCustomisation();
    setCustomisation(c);
    api.auth
      .updateUser({
        data: {
          theme: useUIStore.getState().theme,
          theme_customisation: c,
        },
      })
      .catch(() => {
        /* non-critical */
      });
    onClose();
  };

  const handleReset = () => {
    setSelectedProfileId(DEFAULT_PROFILE_ID[theme] ?? profiles[0]?.id ?? "");
    setPrimaryOverride("");
    setBaseContentOverride("");
    setShowCustomPrimary(false);
    setCustomisation(null);
    api.auth
      .updateUser({
        data: {
          theme: useUIStore.getState().theme,
          theme_customisation: null,
        },
      })
      .catch(() => {
        /* non-critical */
      });
  };

  if (!open) return null;

  const activePrimaryPreview =
    primaryOverride ||
    findProfile(selectedProfileId)?.preview.primary ||
    "#6366f1";
  const activeSecondaryPreview =
    findProfile(selectedProfileId)?.preview.secondary ?? "#0ea5e9";
  const activeAccentPreview =
    findProfile(selectedProfileId)?.preview.accent ?? "#10b981";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop — transparent, click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet / Modal */}
      <div className="relative w-full sm:max-w-lg bg-base-100/15 backdrop-blur-[48px] saturate-150 sm:rounded-2xl shadow-2xl border border-base-300/30 overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Paintbrush className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Customise Colours</h2>
              <p className="text-xs text-base-content/50">
                Pick a profile that matches your style
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="btn-circle"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Locked overlay */}
          {locked && (
            <div className="flex items-center gap-3 rounded-xl bg-warning/10 border border-warning/25 px-4 py-3">
              <Lock className="w-4 h-4 text-warning flex-shrink-0" />
              <p className="text-sm text-warning/90">
                Theme locked by your admin. Contact them to make changes.
              </p>
            </div>
          )}

          {/* ── Profiles grid ── */}
          <div>
            <p className="text-xs font-semibold text-base-content/50 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Colour profiles for {THEMES.find((t) => t.value === theme)?.label}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {profiles.map((profile) => (
                <ProfileSwatch
                  key={profile.id}
                  profile={profile}
                  selected={selectedProfileId === profile.id}
                  onClick={() => handleProfileClick(profile.id)}
                  colorScheme={colorScheme}
                />
              ))}
            </div>
          </div>

          {/* ── Primary + Text linked pair ── */}
          <div className="border border-base-200 rounded-xl overflow-hidden">
            {/* Summary bar showing current trio */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ background: "var(--color-base-100)" }}
            >
              <div className="flex gap-1.5">
                <span
                  className="w-5 h-5 rounded-full shadow-sm border border-white/20"
                  style={{ backgroundColor: activePrimaryPreview }}
                />
                <span
                  className="w-5 h-5 rounded-full shadow-sm border border-white/20"
                  style={{ backgroundColor: activeSecondaryPreview }}
                />
                <span
                  className="w-5 h-5 rounded-full shadow-sm border border-white/20"
                  style={{ backgroundColor: activeAccentPreview }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-base-content truncate">
                  {findProfile(selectedProfileId)?.name ?? "Custom"}
                </p>
                <p className="text-[10px] text-base-content/50 truncate">
                  {findProfile(selectedProfileId)?.description ?? "—"}
                </p>
              </div>
              {!locked && (
                <Button
                  type="button"
                  onClick={() => setShowCustomPrimary((v) => !v)}
                  variant={showCustomPrimary ? "primary" : "ghost"}
                  size="xs"
                  className="gap-1 flex-shrink-0"
                >
                  <ALargeSmall className="w-3 h-3" />
                  {showCustomPrimary ? "Custom on" : "Custom"}
                </Button>
              )}
            </div>

            {/* Expandable custom primary + text */}
            {showCustomPrimary && !locked && (
              <div className="px-4 py-4 space-y-4 border-t border-base-200">
                {/* Primary colour */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-base-content/70">
                      Primary colour
                    </p>
                    {primaryOverride && (
                      <button
                        type="button"
                        onClick={() => setPrimaryOverride("")}
                        className="text-xs text-base-content/40 hover:text-base-content flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    )}
                  </div>
                  <PrimaryColorPicker
                    value={primaryOverride || activePrimaryPreview}
                    onChange={(hex) => {
                      setPrimaryOverride(hex);
                      // Auto-derive text colour so it always contrasts
                      setBaseContentOverride(
                        isLightHex(hex) ? "#1e1b4b" : "#f0f0ff",
                      );
                    }}
                    colorScheme={colorScheme}
                  />
                </div>

                {/* Text (base-content) — linked to primary */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-base-content/70">
                      Text colour
                      <span className="ml-1.5 badge badge-xs badge-ghost">
                        linked to primary
                      </span>
                    </p>
                    {baseContentOverride && (
                      <button
                        type="button"
                        onClick={() =>
                          setBaseContentOverride(derivedTextColor())
                        }
                        className="text-xs text-base-content/40 hover:text-base-content flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Auto
                      </button>
                    )}
                  </div>
                  {/* Contrast preview */}
                  <div
                    className="flex items-center gap-3 rounded-lg px-4 py-2.5 border border-base-300 text-sm font-medium mb-3"
                    style={{
                      backgroundColor: activePrimaryPreview,
                      color: baseContentOverride || derivedTextColor(),
                    }}
                  >
                    <span>Aa</span>
                    <span className="text-xs opacity-80">Preview contrast</span>
                  </div>
                  {/* Text colour swatches */}
                  <div className="flex gap-2">
                    {[
                      "#ffffff",
                      "#f0f0ff",
                      "#1e1b4b",
                      "#111827",
                      "#0f172a",
                    ].map((hex) => {
                      const sel =
                        (
                          baseContentOverride || derivedTextColor()
                        ).toLowerCase() === hex;
                      return (
                        <button
                          key={hex}
                          type="button"
                          title={hex}
                          onClick={() => setBaseContentOverride(hex)}
                          className={cn(
                            "w-8 h-8 rounded-lg border transition-all cursor-pointer",
                            sel
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-base-100 scale-110"
                              : "border-base-300 hover:scale-105",
                          )}
                          style={{ backgroundColor: hex }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-base-200 bg-base-200/40 flex-shrink-0">
          <Button
            type="button"
            onClick={handleReset}
            disabled={locked}
            variant="ghost"
            size="sm"
            className="gap-2 text-base-content/50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button type="button" onClick={onClose} variant="ghost" size="sm">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={locked}
              size="sm"
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
