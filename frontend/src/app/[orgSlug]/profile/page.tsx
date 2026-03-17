"use client";

import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { Avatar, Card, PageHeader } from "@/components/ui/shared";
import { api, ApiError } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { THEMES, useUIStore } from "@/stores/ui-store";
import type { TOTPRegistration } from "@/types/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle,
    Briefcase,
    Calendar, Camera,
    CheckCircle,
    Copy,
    Download,
    Globe,
    Key,
    Lock,
    Mail,
    Moon,
    Palette,
    RefreshCw,
    Shield, Smartphone,
    Sun,
    Trash2,
    User
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

const TIMEZONE_OPTIONS = [
  { value: "", label: "Select timezone" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central Europe (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const LANGUAGE_OPTIONS = [
  { value: "", label: "Select language" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

interface ProfileForm {
  name: string;
  phone: string;
  avatar_url: string;
  bio: string;
  job_title: string;
  department: string;
  timezone: string;
  language: string;
}

/* ─── Theme preview colors for visual picker ─── */
const THEME_PREVIEWS: Record<string, { bg: string; card: string; primary: string; secondary: string; accent: string; text: string; label: string }> = {
  "glass-light": {
    bg: "bg-gradient-to-br from-indigo-100 via-purple-50 to-teal-50",
    card: "bg-white/60 backdrop-blur-md border border-white/40",
    primary: "bg-indigo-500",
    secondary: "bg-violet-400",
    accent: "bg-teal-400",
    text: "text-gray-800",
    label: "Frosted glass with light gradient"
  },
  "glass-dark": {
    bg: "bg-gradient-to-br from-purple-950 via-indigo-950 to-cyan-950",
    card: "bg-white/10 backdrop-blur-md border border-white/10",
    primary: "bg-violet-500",
    secondary: "bg-cyan-400",
    accent: "bg-rose-400",
    text: "text-white",
    label: "Frosted glass with dark gradient"
  },
  "orbis-light": {
    bg: "bg-slate-50",
    card: "bg-white border border-slate-200",
    primary: "bg-blue-600",
    secondary: "bg-sky-500",
    accent: "bg-emerald-500",
    text: "text-slate-800",
    label: "Clean minimal light"
  },
  "orbis-dark": {
    bg: "bg-slate-900",
    card: "bg-slate-800 border border-slate-700",
    primary: "bg-indigo-500",
    secondary: "bg-teal-500",
    accent: "bg-amber-400",
    text: "text-white",
    label: "Clean minimal dark"
  },
};

function AppearanceTab() {
  const { theme: currentTheme, setTheme } = useUIStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleThemeChange = async (themeValue: string) => {
    setTheme(themeValue as typeof currentTheme);
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.auth.updateUser({
        data: { theme: themeValue },
      });
      useAuthStore.getState().updateUser({ ...user!, user_metadata: { ...user?.user_metadata, theme: themeValue } });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setSuccess("Theme saved!");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to save theme preference");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="alert alert-error mb-4 text-sm"><span>{error}</span></div>}
      {success && <div className="alert alert-success mb-4 text-sm"><CheckCircle className="w-4 h-4" /><span>{success}</span></div>}

      <Card>
        <div className="flex items-center gap-3 mb-6">
          <Palette className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-base">Theme</h3>
            <p className="text-sm text-base-content/50">Choose your preferred appearance</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {THEMES.map((t) => {
            const preview = THEME_PREVIEWS[t.value];
            const isActive = currentTheme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                disabled={saving}
                onClick={() => handleThemeChange(t.value)}
                className={cn(
                  "relative rounded-xl p-1 transition-all duration-200 text-left cursor-pointer",
                  isActive
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-base-100"
                    : "ring-1 ring-base-300 hover:ring-base-content/30"
                )}
              >
                {/* Theme preview mockup */}
                <div className={cn("rounded-lg overflow-hidden", preview.bg)}>
                  <div className="p-3 space-y-2">
                    {/* Mini topbar */}
                    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", preview.card)}>
                      <div className={cn("w-3 h-3 rounded-full", preview.primary)} />
                      <div className={cn("flex-1 h-2 rounded-full opacity-40", preview.primary)} />
                      <div className="w-4 h-4 rounded-full bg-current opacity-20" />
                    </div>
                    {/* Mini content cards */}
                    <div className="flex gap-2">
                      <div className={cn("flex-1 rounded-md p-2 space-y-1.5", preview.card)}>
                        <div className={cn("w-6 h-1.5 rounded-full", preview.primary)} />
                        <div className={cn("w-full h-1 rounded-full opacity-20", preview.text === "text-white" ? "bg-white" : "bg-black")} />
                        <div className={cn("w-3/4 h-1 rounded-full opacity-15", preview.text === "text-white" ? "bg-white" : "bg-black")} />
                      </div>
                      <div className={cn("flex-1 rounded-md p-2 space-y-1.5", preview.card)}>
                        <div className={cn("w-6 h-1.5 rounded-full", preview.secondary)} />
                        <div className={cn("w-full h-1 rounded-full opacity-20", preview.text === "text-white" ? "bg-white" : "bg-black")} />
                        <div className={cn("w-3/4 h-1 rounded-full opacity-15", preview.text === "text-white" ? "bg-white" : "bg-black")} />
                      </div>
                    </div>
                    {/* Color dots */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <div className={cn("w-3 h-3 rounded-full", preview.primary)} />
                      <div className={cn("w-3 h-3 rounded-full", preview.secondary)} />
                      <div className={cn("w-3 h-3 rounded-full", preview.accent)} />
                      <div className="flex-1" />
                      {t.colorScheme === "light" ? (
                        <Sun className={cn("w-3.5 h-3.5", preview.text, "opacity-40")} />
                      ) : (
                        <Moon className={cn("w-3.5 h-3.5", preview.text, "opacity-40")} />
                      )}
                    </div>
                  </div>
                </div>
                {/* Label */}
                <div className="px-2 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{t.label}</span>
                    {isActive && <span className="badge badge-primary badge-xs">Active</span>}
                  </div>
                  <p className="text-xs text-base-content/50 mt-0.5">{preview.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  const { user, orgs, currentOrg, updateUser } = useAuthStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "security">("profile");

  // ── Profile state ───────────────────────────────────────────────────────────
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const meta = user?.user_metadata || {};
  const { register, handleSubmit, reset, watch, setValue, formState: { isDirty } } = useForm<ProfileForm>({
    defaultValues: {
      name: (meta.name as string) || "",
      phone: user?.phone || "",
      avatar_url: (meta.avatar_url as string) || "",
      bio: (meta.bio as string) || "",
      job_title: (meta.job_title as string) || "",
      department: (meta.department as string) || "",
      timezone: (meta.timezone as string) || "",
      language: (meta.language as string) || "",
    },
  });

  useEffect(() => {
    const m = user?.user_metadata || {};
    reset({
      name: (m.name as string) || "",
      phone: user?.phone || "",
      avatar_url: (m.avatar_url as string) || "",
      bio: (m.bio as string) || "",
      job_title: (m.job_title as string) || "",
      department: (m.department as string) || "",
      timezone: (m.timezone as string) || "",
      language: (m.language as string) || "",
    });
  }, [user?.id, user?.phone, user?.user_metadata, reset]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const { phone, ...metadata } = data;
      return api.auth.updateUser({
        phone: phone || undefined,
        data: {
          name: metadata.name,
          avatar_url: metadata.avatar_url || undefined,
          bio: metadata.bio || undefined,
          job_title: metadata.job_title || undefined,
          department: metadata.department || undefined,
          timezone: metadata.timezone || undefined,
          language: metadata.language || undefined,
        },
      });
    },
    onSuccess: (updated) => {
      useAuthStore.getState().updateUser(updated);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setProfileSuccess("Profile updated successfully");
      setProfileError("");
      setTimeout(() => setProfileSuccess(""), 4000);
    },
    onError: (e: Error) => {
      setProfileError(e instanceof ApiError ? e.message : "Update failed");
      setProfileSuccess("");
    },
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg) return;
    if (!file.type.startsWith("image/")) { setProfileError("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { setProfileError("Image must be less than 5MB"); return; }
    setUploading(true);
    setProfileError("");
    try {
      const result = await api.uploads.upload(currentOrg.id, file);
      setValue("avatar_url", result.url, { shouldDirty: true });
      setProfileSuccess("Avatar uploaded! Click Save to apply.");
      setTimeout(() => setProfileSuccess(""), 3000);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const avatarUrl = watch("avatar_url");
  const nameVal = watch("name");

  // ── Security state ──────────────────────────────────────────────────────────
  const [secError, setSecError] = useState("");
  const [secSuccess, setSecSuccess] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showCodesModal, setShowCodesModal] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TOTPRegistration | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const clearSecMessages = useCallback(() => { setSecError(""); setSecSuccess(""); }, []);

  const totpEnabled = user?.totp_enabled ?? false;
  const otpEmailEnabled = user?.otp_email_enabled ?? false;
  const otpSMSEnabled = user?.otp_sms_enabled ?? false;
  const anyMFAEnabled = user?.mfa_enabled ?? false;

  const refreshUser = useCallback(async () => {
    try { const freshUser = await api.auth.getUser(); updateUser(freshUser); } catch { /* ignore */ }
  }, [updateUser]);

  useEffect(() => { refreshUser(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const registerTOTP = useMutation({
    mutationFn: () => api.mfa.registerTOTP(),
    onSuccess: (data) => { setTotpSetup(data); clearSecMessages(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to setup TOTP"); },
  });
  const verifyTOTP = useMutation({
    mutationFn: (code: string) => api.mfa.verifyTOTP(code),
    onSuccess: () => { setTotpSetup(null); setTotpCode(""); setSecSuccess("Authenticator app enabled successfully!"); refreshUser(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Invalid TOTP code — check your app and try again"); },
  });
  const removeTOTP = useMutation({
    mutationFn: () => api.mfa.removeTOTP(),
    onSuccess: () => { setSecSuccess("Authenticator app removed"); refreshUser(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to remove TOTP"); },
  });
  const enableOTPEmail = useMutation({
    mutationFn: () => api.mfa.enableOTPEmail(),
    onSuccess: () => { setSecSuccess("Email OTP enabled"); refreshUser(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to enable email OTP"); },
  });
  const disableOTPEmail = useMutation({
    mutationFn: () => api.mfa.disableOTPEmail(),
    onSuccess: () => { setSecSuccess("Email OTP disabled"); refreshUser(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to disable email OTP"); },
  });
  const enableOTPSMS = useMutation({
    mutationFn: () => api.mfa.enableOTPSMS(),
    onSuccess: () => { setSecSuccess("SMS OTP enabled"); refreshUser(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to enable SMS OTP"); },
  });
  const disableOTPSMS = useMutation({
    mutationFn: () => api.mfa.disableOTPSMS(),
    onSuccess: () => { setSecSuccess("SMS OTP disabled"); refreshUser(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to disable SMS OTP"); },
  });
  const generateCodes = useMutation({
    mutationFn: () => api.mfa.generateRecoveryCodes(),
    onSuccess: (data) => { setBackupCodes(data.codes); setShowCodesModal(true); clearSecMessages(); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to generate backup codes"); },
  });
  const removeCodes = useMutation({
    mutationFn: () => api.mfa.removeRecoveryCodes(),
    onSuccess: () => { setSecSuccess("Backup codes removed"); },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to remove backup codes"); },
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => api.auth.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setSecSuccess("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    },
    onError: (e: Error) => { setSecError(e instanceof ApiError ? e.message : "Failed to change password"); },
  });

  const handleChangePassword = () => {
    clearSecMessages();
    if (newPassword.length < 8) { setSecError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmNewPassword) { setSecError("Passwords do not match."); return; }
    changePasswordMutation.mutate();
  };

  const handleCopyAll = () => {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setSecSuccess("Backup codes copied to clipboard");
  };
  const handleDownload = () => {
    if (!backupCodes) return;
    const content = [
      "OrbisPM - Account Backup Codes", "================================",
      "Keep these codes in a safe place. Each code can only be used once.", "",
      ...backupCodes, "", `Generated: ${new Date().toLocaleString()}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "orbispm-backup-codes.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Account" description="Manage your profile and security settings" />

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-bordered mb-6">
        <button
          role="tab"
          className={cn("tab gap-2", activeTab === "profile" && "tab-active font-medium")}
          onClick={() => setActiveTab("profile")}
        >
          <User className="w-4 h-4" />
          Profile
        </button>
        <button
          role="tab"
          className={cn("tab gap-2", activeTab === "appearance" && "tab-active font-medium")}
          onClick={() => setActiveTab("appearance")}
        >
          <Palette className="w-4 h-4" />
          Appearance
        </button>
        <button
          role="tab"
          className={cn("tab gap-2", activeTab === "security" && "tab-active font-medium")}
          onClick={() => setActiveTab("security")}
        >
          <Shield className="w-4 h-4" />
          Security
        </button>
      </div>

      {/* ── Profile Tab ── */}
      {activeTab === "profile" && (
        <>
          {profileError && <div className="alert alert-error mb-4 text-sm"><span>{profileError}</span></div>}
          {profileSuccess && (
            <div className="alert alert-success mb-4 text-sm">
              <CheckCircle className="w-4 h-4" /><span>{profileSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
            {/* Avatar & Identity */}
            <Card>
              <div className="flex items-center gap-5 mb-6">
                <div className="relative group">
                  <Avatar name={nameVal || user?.email || "U"} src={avatarUrl || undefined} size="lg" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploading ? <span className="loading loading-spinner loading-sm text-white" /> : <Camera className="w-5 h-5 text-white" />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{nameVal || user?.email?.split("@")[0]}</h2>
                  <p className="text-sm text-base-content/50">{user?.email}</p>
                  {currentOrg && <span className="badge badge-sm badge-primary mt-1">{currentOrg.name}</span>}
                  <p className="text-xs text-base-content/40 mt-1">Click avatar to upload a photo</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <User className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base">Basic Information</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Full Name" placeholder="John Doe" {...register("name")} />
                <Input label="Email Address" type="email" defaultValue={user?.email || ""} disabled helperText="Contact support to change your email" />
                <Input label="Phone Number" type="tel" placeholder="+1 (555) 000-0000" {...register("phone")} />
                <Input label="Avatar URL" type="url" placeholder="https://example.com/avatar.jpg" helperText="Or use upload button above" {...register("avatar_url")} />
              </div>
            </Card>

            {/* Work */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <Briefcase className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base">Work Information</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Job Title" placeholder="Software Engineer" {...register("job_title")} />
                <Input label="Department" placeholder="Engineering" {...register("department")} />
                <div className="md:col-span-2">
                  <Textarea label="Bio" placeholder="A short bio about yourself..." {...register("bio")} />
                </div>
              </div>
            </Card>

            {/* Preferences */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base">Preferences</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select label="Timezone" options={TIMEZONE_OPTIONS} {...register("timezone")} />
                <Select label="Language" options={LANGUAGE_OPTIONS} {...register("language")} />
              </div>
            </Card>

            {/* Account Summary */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base">Account Summary</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-base-200 rounded-lg">
                  <div className="text-xs text-base-content/50 mb-1">Member Since</div>
                  <div className="text-sm font-medium">{user?.created_at ? formatDate(user.created_at) : "—"}</div>
                </div>
                <div className="text-center p-3 bg-base-200 rounded-lg">
                  <div className="text-xs text-base-content/50 mb-1">Organizations</div>
                  <div className="text-lg font-semibold">{orgs.length}</div>
                </div>
                <div className="text-center p-3 bg-base-200 rounded-lg">
                  <div className="text-xs text-base-content/50 mb-1">User ID</div>
                  <div className="font-mono text-xs truncate">{user?.id?.slice(0, 12)}…</div>
                </div>
              </div>
              {orgs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wider mb-2">Your Organizations</p>
                  <div className="space-y-2">
                    {orgs.map((org) => (
                      <div key={org.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-200 transition-colors">
                        <Avatar name={org.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{org.name}</span>
                          <span className="text-xs text-base-content/40 ml-2">/{org.slug}</span>
                        </div>
                        <span className={`badge badge-sm ${org.plan === "pro" ? "badge-primary" : "badge-ghost"}`}>{org.plan}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div className="flex items-center justify-between py-2">
              <p className="text-sm text-base-content/50">{isDirty ? "You have unsaved changes" : "Profile is up to date"}</p>
              <Button type="submit" loading={updateMutation.isPending} disabled={!isDirty && !updateMutation.isPending}>
                Save Profile
              </Button>
            </div>
          </form>
        </>
      )}

      {/* ── Appearance Tab ── */}
      {activeTab === "appearance" && <AppearanceTab />}

      {/* ── Security Tab ── */}
      {activeTab === "security" && (
        <>
          {secError && (
            <div className="alert alert-error mb-4 text-sm">
              <AlertTriangle className="w-4 h-4" /><span>{secError}</span>
            </div>
          )}
          {secSuccess && (
            <div className="alert alert-success mb-4 text-sm">
              <CheckCircle className="w-4 h-4" /><span>{secSuccess}</span>
            </div>
          )}

          {/* Change Password Card */}
          <Card className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-base">Change Password</h3>
            </div>
            <p className="text-sm text-base-content/60 mb-4">
              Update your account password. You&apos;ll need to enter your current password for verification.
            </p>
            <div className="space-y-3 max-w-sm">
              <Input
                label="Current Password"
                type="password"
                placeholder="Enter current password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              <Input
                label="New Password"
                type="password"
                placeholder="Enter new password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Input
                label="Confirm New Password"
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
              <Button
                size="sm"
                onClick={handleChangePassword}
                loading={changePasswordMutation.isPending}
                disabled={!oldPassword || !newPassword || !confirmNewPassword}
              >
                <Lock className="w-4 h-4" /> Update Password
              </Button>
            </div>
          </Card>

          {/* MFA Card */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-base">Multi-Factor Authentication</h3>
              <span className={`badge ${anyMFAEnabled ? "badge-success" : "badge-warning"} badge-sm ml-auto`}>
                {anyMFAEnabled ? "Enabled" : "Not Enabled"}
              </span>
            </div>
            <p className="text-sm text-base-content/60 mb-6">
              Add an extra layer of security to your account. When MFA is enabled,
              you&apos;ll need to provide a second verification code during login.
            </p>

            {/* TOTP */}
            <div className="border border-base-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-info" />
                  <div>
                    <h4 className="font-medium text-sm">Authenticator App (TOTP)</h4>
                    <p className="text-xs text-base-content/50">Use Google Authenticator, Authy, or similar app</p>
                  </div>
                  {totpEnabled && <span className="badge badge-success badge-xs">Active</span>}
                </div>
                {!totpSetup && (
                  <div className="flex gap-2">
                    {totpEnabled ? (
                      <Button size="sm" variant="error" onClick={() => { clearSecMessages(); removeTOTP.mutate(); }} loading={removeTOTP.isPending}>
                        <Trash2 className="w-4 h-4" /> Remove
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => { clearSecMessages(); registerTOTP.mutate(); }} loading={registerTOTP.isPending}>
                        <Key className="w-4 h-4" /> Setup
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {totpSetup && (
                <div className="mt-4 border-t border-base-200 pt-4">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2">1. Scan this QR code with your authenticator app:</p>
                      <div className="bg-white p-4 rounded-lg inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpSetup.uri)}`}
                          alt="TOTP QR Code" width={200} height={200}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">2. Or enter the secret manually:</p>
                      <code className="text-xs bg-base-200 p-2 rounded block break-all select-all">{totpSetup.secret}</code>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">3. Enter the 6-digit code from your app to verify:</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="000000" maxLength={6} value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                          className="w-32"
                        />
                        <Button onClick={() => { clearSecMessages(); verifyTOTP.mutate(totpCode); }} loading={verifyTOTP.isPending} disabled={totpCode.length !== 6}>
                          Verify &amp; Enable
                        </Button>
                        <Button variant="ghost" onClick={() => { setTotpSetup(null); setTotpCode(""); clearSecMessages(); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Email OTP */}
            <div className="border border-base-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-success" />
                  <div>
                    <h4 className="font-medium text-sm">Email OTP</h4>
                    <p className="text-xs text-base-content/50">Receive a one-time code via email ({user?.email})</p>
                  </div>
                  {otpEmailEnabled && <span className="badge badge-success badge-xs">Active</span>}
                </div>
                <div className="flex gap-2">
                  {otpEmailEnabled ? (
                    <Button size="sm" variant="error" onClick={() => { clearSecMessages(); disableOTPEmail.mutate(); }} loading={disableOTPEmail.isPending}>Disable</Button>
                  ) : (
                    <Button size="sm" onClick={() => { clearSecMessages(); enableOTPEmail.mutate(); }} loading={enableOTPEmail.isPending}>Enable</Button>
                  )}
                </div>
              </div>
            </div>

            {/* SMS OTP */}
            {user?.phone ? (
              <div className="border border-base-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-warning" />
                    <div>
                      <h4 className="font-medium text-sm">SMS OTP</h4>
                      <p className="text-xs text-base-content/50">Receive a code via SMS to {user.phone}</p>
                    </div>
                    {otpSMSEnabled && <span className="badge badge-success badge-xs">Active</span>}
                  </div>
                  <div className="flex gap-2">
                    {otpSMSEnabled ? (
                      <Button size="sm" variant="error" onClick={() => { clearSecMessages(); disableOTPSMS.mutate(); }} loading={disableOTPSMS.isPending}>Disable</Button>
                    ) : (
                      <Button size="sm" onClick={() => { clearSecMessages(); enableOTPSMS.mutate(); }} loading={enableOTPSMS.isPending}>Enable</Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-base-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-base-content/30" />
                  <div>
                    <h4 className="font-medium text-sm text-base-content/50">SMS OTP</h4>
                    <p className="text-xs text-base-content/40">Add a phone number in your profile to enable SMS OTP</p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Backup Codes */}
          {anyMFAEnabled && (
            <Card className="mt-6">
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base">Backup Codes</h3>
              </div>
              <p className="text-sm text-base-content/60 mb-4">
                Backup codes let you sign in if you lose access to your MFA device.
                Each code can only be used once. Store them somewhere safe.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { clearSecMessages(); generateCodes.mutate(); }} loading={generateCodes.isPending}>
                  <RefreshCw className="w-4 h-4" /> Generate New Codes
                </Button>
                <Button size="sm" variant="error" onClick={() => { clearSecMessages(); removeCodes.mutate(); }} loading={removeCodes.isPending}>
                  <Trash2 className="w-4 h-4" /> Remove Backup Codes
                </Button>
              </div>
              {showCodesModal && backupCodes && (
                <dialog className="modal modal-open" style={{ backgroundColor: "transparent" }}>
                  <div className="modal-box max-w-md">
                    <h3 className="font-bold text-lg mb-2">Your Backup Codes</h3>
                    <div className="alert alert-warning mb-4 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Save these codes now — they will not be shown again. Each code can only be used once.</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {backupCodes.map((code, i) => (
                        <code key={i} className="bg-base-200 rounded px-3 py-1.5 text-sm font-mono text-center select-all">{code}</code>
                      ))}
                    </div>
                    <div className="modal-action flex-wrap gap-2 justify-start">
                      <Button size="sm" variant="outline" onClick={handleCopyAll}><Copy className="w-4 h-4" /> Copy All</Button>
                      <Button size="sm" variant="outline" onClick={handleDownload}><Download className="w-4 h-4" /> Download .txt</Button>
                      <Button size="sm" className="ml-auto" onClick={() => { setShowCodesModal(false); setBackupCodes(null); }}>Done</Button>
                    </div>
                  </div>
                  <div className="modal-backdrop bg-transparent" onClick={() => { setShowCodesModal(false); setBackupCodes(null); }} />
                </dialog>
              )}
            </Card>
          )}

          {/* Account Info */}
          <Card className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <Key className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-base">Account Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-base-content/50">User ID</span>
                <p className="font-mono text-xs mt-1 truncate">{user?.id}</p>
              </div>
              <div>
                <span className="text-base-content/50">Email</span>
                <p className="mt-1">{user?.email}</p>
              </div>
              <div>
                <span className="text-base-content/50">MFA Status</span>
                <p className="mt-1">
                  <span className={`badge ${anyMFAEnabled ? "badge-success" : "badge-warning"} badge-sm`}>
                    {anyMFAEnabled ? "Active" : "Inactive"}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-base-content/50">Account Created</span>
                <p className="mt-1">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
