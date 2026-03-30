"use client";

import {
  PrimaryColorPicker,
  ProfileSwatch,
  isLightHex,
} from "@/components/ui/color-picker-panel";
import { Card } from "@/components/ui/shared";
import { ApiError, api } from "@/lib/api";
import {
  DEFAULT_PROFILE_ID,
  PROFILES_BY_THEME,
  findProfile,
} from "@/lib/theme-profiles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { THEMES, ThemeCustomisation, useUIStore } from "@/stores/ui-store";
import type { OrgThemeConfig } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ALargeSmall,
  CheckCircle,
  Globe,
  Lock,
  LockOpen,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/* ─── Theme preview mini-tiles ─── */
const THEME_PREVIEWS: Record<
  string,
  {
    bg: string;
    card: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
  }
> = {
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

export default function ThemeTab() {
  const { currentOrg } = useAuthStore();
  const qc = useQueryClient();
  const orgId = currentOrg?.id || "";

  const { data: cfg, isLoading } = useQuery<OrgThemeConfig>({
    queryKey: ["org-theme", orgId],
    queryFn: () => api.orgTheme.get(orgId),
    enabled: !!orgId,
  });

  // Editable local state
  const [selectedBaseTheme, setSelectedBaseTheme] = useState("orbis-light");
  const [selectedProfileId, setSelectedProfileId] = useState(
    DEFAULT_PROFILE_ID["orbis-light"],
  );
  const [primaryOverride, setPrimaryOverride] = useState("");
  const [baseContentOverride, setBaseContentOverride] = useState("");
  const [showCustomPrimary, setShowCustomPrimary] = useState(false);
  const [locked, setLocked] = useState(false);

  // Sync from server
  useEffect(() => {
    if (!cfg) return;
    const baseTheme = cfg.base_theme || "orbis-light";
    setSelectedBaseTheme(baseTheme);
    setLocked(cfg.locked ?? false);

    // cfg.custom_colors stores a ThemeCustomisation object (or empty object)
    const saved = cfg.custom_colors as unknown as Partial<ThemeCustomisation>;
    if (saved?.profileId) {
      setSelectedProfileId(saved.profileId);
      setPrimaryOverride(saved.primaryOverride ?? "");
      setBaseContentOverride(saved.baseContentOverride ?? "");
      setShowCustomPrimary(!!saved.primaryOverride);
    } else {
      setSelectedProfileId(DEFAULT_PROFILE_ID[baseTheme] ?? "");
    }
  }, [cfg]);

  // When base theme changes, reset profile to that theme's default
  const handleBaseThemeChange = (t: string) => {
    setSelectedBaseTheme(t);
    setSelectedProfileId(DEFAULT_PROFILE_ID[t] ?? "");
    setPrimaryOverride("");
    setBaseContentOverride("");
    setShowCustomPrimary(false);
  };

  const profiles = PROFILES_BY_THEME[selectedBaseTheme] ?? [];
  const colorScheme =
    THEMES.find((t) => t.value === selectedBaseTheme)?.colorScheme ?? "light";

  const buildCustomisation = (): ThemeCustomisation => ({
    profileId: selectedProfileId,
    primaryOverride: primaryOverride || undefined,
    baseContentOverride: baseContentOverride || undefined,
  });

  const derivedTextColor = (): string => {
    const primary =
      primaryOverride ||
      findProfile(selectedProfileId)?.preview.primary ||
      "#6366f1";
    return isLightHex(primary) ? "#1e1b4b" : "#f0f0ff";
  };

  const saveMutation = useMutation({
    mutationFn: (data: {
      base_theme: string;
      custom_colors: Record<string, unknown>;
      locked: boolean;
    }) =>
      api.orgTheme.update(
        orgId,
        data as Parameters<typeof api.orgTheme.update>[1],
      ),
    onSuccess: (updated) => {
      qc.setQueryData(["org-theme", orgId], updated);
      const { initializeTheme, setOrgThemeConfig } = useUIStore.getState();
      const c = updated.custom_colors as unknown as ThemeCustomisation;
      const hasOrgCustomisation = !!c?.profileId;

      // Update org enforcement state
      setOrgThemeConfig({
        locked: updated.locked,
        customisation: hasOrgCustomisation ? c : null,
      });

      // Apply the theme immediately for the admin
      initializeTheme(
        updated.base_theme as Parameters<typeof initializeTheme>[0],
        hasOrgCustomisation ? c : null,
      );

      toast.success(
        updated.locked
          ? "Theme applied & locked for all members"
          : "Theme config saved",
      );
    },
    onError: (e: Error) => {
      toast.error(
        e instanceof ApiError ? e.message : "Failed to save theme config",
      );
    },
  });

  const handleApplyForAll = () => {
    saveMutation.mutate({
      base_theme: selectedBaseTheme,
      custom_colors: buildCustomisation() as unknown as Record<string, unknown>,
      locked,
    });
  };

  const handleResetCustom = () => {
    setPrimaryOverride("");
    setBaseContentOverride("");
    setShowCustomPrimary(false);
    setSelectedProfileId(DEFAULT_PROFILE_ID[selectedBaseTheme] ?? "");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const savedCustomisation = cfg?.custom_colors as unknown as
    | Partial<ThemeCustomisation>
    | undefined;
  const isDirty =
    selectedBaseTheme !== (cfg?.base_theme || "orbis-light") ||
    selectedProfileId !==
      (savedCustomisation?.profileId ??
        DEFAULT_PROFILE_ID[cfg?.base_theme || "orbis-light"]) ||
    primaryOverride !== (savedCustomisation?.primaryOverride ?? "") ||
    locked !== (cfg?.locked ?? false);

  const activeProfile = findProfile(selectedProfileId);
  const activePrimaryPreview =
    primaryOverride || activeProfile?.preview.primary || "#6366f1";

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/15 px-4 py-3">
        <Globe className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-primary">Org-wide theme</p>
          <p className="text-base-content/60 mt-0.5">
            Choose a base theme, pick a colour profile, then optionally
            customise the primary colour. Lock to prevent members overriding it.
          </p>
        </div>
      </div>

      {/* ── Step 1: Base theme ── */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <Palette className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">Base Theme</h3>
            <p className="text-xs text-base-content/50">
              Sets the surface colours and glass/flat style
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {THEMES.map((t) => {
            const preview = THEME_PREVIEWS[t.value];
            const isActive = selectedBaseTheme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => handleBaseThemeChange(t.value)}
                className={cn(
                  "relative rounded-xl p-1 transition-all duration-200 text-left cursor-pointer",
                  isActive
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-base-100"
                    : "ring-1 ring-base-300 hover:ring-base-content/30",
                )}
              >
                <div
                  className={cn("rounded-lg overflow-hidden h-16", preview.bg)}
                >
                  <div className="p-2 space-y-1.5">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded px-1.5 py-1",
                        preview.card,
                      )}
                    >
                      <div
                        className={cn("w-2 h-2 rounded-full", preview.primary)}
                      />
                      <div
                        className={cn(
                          "flex-1 h-1 rounded-full opacity-40",
                          preview.primary,
                        )}
                      />
                    </div>
                    <div className="flex gap-1">
                      {[preview.primary, preview.secondary, preview.accent].map(
                        (c, i) => (
                          <div
                            key={i}
                            className={cn("w-3 h-3 rounded-full", c)}
                          />
                        ),
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-1 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate">
                      {t.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {t.colorScheme === "light" ? (
                      <Sun className="w-2.5 h-2.5 text-base-content/40" />
                    ) : (
                      <Moon className="w-2.5 h-2.5 text-base-content/40" />
                    )}
                    <span className="text-[10px] text-base-content/40">
                      {t.colorScheme}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Step 2: Colour profile ── */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">Colour Profile</h3>
            <p className="text-xs text-base-content/50">
              Curated sets for{" "}
              {THEMES.find((t) => t.value === selectedBaseTheme)?.label} —
              primary · secondary · accent
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {profiles.map((profile) => (
            <ProfileSwatch
              key={profile.id}
              profile={profile}
              selected={selectedProfileId === profile.id}
              onClick={() => {
                setSelectedProfileId(profile.id);
                setPrimaryOverride("");
                setBaseContentOverride("");
              }}
              colorScheme={colorScheme}
            />
          ))}
        </div>
      </Card>

      {/* ── Step 3: Custom primary (optional) ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ALargeSmall className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">
                Custom Primary
                <span className="ml-2 badge badge-xs badge-ghost">
                  optional
                </span>
              </h3>
              <p className="text-xs text-base-content/50">
                Override the profile primary. Text colour adjusts automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCustomPrimary((v) => !v)}
            className={cn(
              "btn btn-xs gap-1.5",
              showCustomPrimary ? "btn-primary" : "btn-outline",
            )}
          >
            {showCustomPrimary ? "On" : "Enable"}
          </button>
        </div>

        {showCustomPrimary && (
          <div className="space-y-4">
            {/* Contrast preview */}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium"
              style={{
                backgroundColor: activePrimaryPreview,
                color: baseContentOverride || derivedTextColor(),
              }}
            >
              <span>Primary button preview</span>
              <span className="text-xs opacity-75">Aa</span>
            </div>

            <PrimaryColorPicker
              value={primaryOverride || activePrimaryPreview}
              onChange={(hex) => {
                setPrimaryOverride(hex);
                setBaseContentOverride(isLightHex(hex) ? "#1e1b4b" : "#f0f0ff");
              }}
              colorScheme={colorScheme}
            />

            <button
              type="button"
              onClick={handleResetCustom}
              className="btn btn-ghost btn-xs gap-1.5 text-base-content/40"
            >
              <RotateCcw className="w-3 h-3" /> Reset to profile default
            </button>
          </div>
        )}
      </Card>

      {/* ── Step 4: Lock ── */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {locked ? (
              <Lock className="w-5 h-5 text-warning" />
            ) : (
              <LockOpen className="w-5 h-5 text-base-content/50" />
            )}
            <div>
              <h3 className="font-semibold text-sm">
                {locked ? "Theme locked for members" : "Members can customise"}
              </h3>
              <p className="text-xs text-base-content/50">
                {locked
                  ? "Members see this theme and cannot change it"
                  : "Members can override the theme in their profile"}
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            className="toggle toggle-warning toggle-sm"
            checked={locked}
            onChange={(e) => setLocked(e.target.checked)}
          />
        </div>
        {locked && (
          <div className="flex items-center gap-2 mt-3 text-xs text-warning/80 bg-warning/8 border border-warning/20 rounded-lg px-3 py-2">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            Applying will override and lock all member themes immediately.
          </div>
        )}
      </Card>

      {/* ── Apply ── */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-base-content/40">
          {isDirty ? "You have unsaved changes" : "No pending changes"}
        </p>
        <button
          type="button"
          onClick={handleApplyForAll}
          disabled={saveMutation.isPending || !isDirty}
          className={cn("btn gap-2", locked ? "btn-warning" : "btn-primary")}
        >
          {saveMutation.isPending ? (
            <span className="loading loading-spinner loading-sm" />
          ) : locked ? (
            <Lock className="w-4 h-4" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          {locked ? "Apply & Lock for All" : "Apply for All"}
        </button>
      </div>
    </div>
  );
}
