"use client";

import { useEffect, useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { User, Briefcase, Globe, CheckCircle, Calendar, Camera, Upload } from "lucide-react";
import { formatDate } from "@/lib/utils";

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

export default function ProfilePage() {
  const { user, orgs, currentOrg } = useAuthStore();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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
  }, [user?.id, reset]);

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
      useAuthStore.setState({ user: updated });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["org-members"] });
      setSuccess("Profile updated successfully");
      setError("");
      setTimeout(() => setSuccess(""), 4000);
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Update failed");
      setSuccess("");
    },
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const result = await api.uploads.upload(currentOrg.id, file);
      setValue("avatar_url", result.url, { shouldDirty: true });
      setSuccess("Avatar uploaded! Click Save to apply.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const avatarUrl = watch("avatar_url");
  const nameVal = watch("name");

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My Profile"
        description="Manage your personal information and preferences"
      />

      {error && <div className="alert alert-error mb-4 text-sm"><span>{error}</span></div>}
      {success && (
        <div className="alert alert-success mb-4 text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">

        {/* Avatar & Identity Header */}
        <Card>
          <div className="flex items-center gap-5 mb-6">
            <div className="relative group">
              <Avatar
                name={nameVal || user?.email || "U"}
                src={avatarUrl || undefined}
                size="lg"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading ? (
                  <span className="loading loading-spinner loading-sm text-white" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{nameVal || user?.email?.split("@")[0]}</h2>
              <p className="text-sm text-base-content/50">{user?.email}</p>
              {currentOrg && (
                <span className="badge badge-sm badge-primary mt-1">{currentOrg.name}</span>
              )}
              <p className="text-xs text-base-content/40 mt-1">Click avatar to upload a photo</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">Basic Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              placeholder="John Doe"
              {...register("name")}
            />
            <Input
              label="Email Address"
              type="email"
              defaultValue={user?.email || ""}
              disabled
              helperText="Contact support to change your email"
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+1 (555) 000-0000"
              {...register("phone")}
            />
            <Input
              label="Avatar URL"
              type="url"
              placeholder="https://example.com/avatar.jpg"
              helperText="Or use upload button above"
              {...register("avatar_url")}
            />
          </div>
        </Card>

        {/* Work */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Briefcase className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">Work Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Job Title"
              placeholder="Software Engineer"
              {...register("job_title")}
            />
            <Input
              label="Department"
              placeholder="Engineering"
              {...register("department")}
            />
            <div className="md:col-span-2">
              <Textarea
                label="Bio"
                placeholder="A short bio about yourself..."
                {...register("bio")}
              />
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
            <Select
              label="Timezone"
              options={TIMEZONE_OPTIONS}
              {...register("timezone")}
            />
            <Select
              label="Language"
              options={LANGUAGE_OPTIONS}
              {...register("language")}
            />
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
                    <span className={`badge badge-sm ${org.plan === "pro" ? "badge-primary" : "badge-ghost"}`}>
                      {org.plan}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between py-2">
          <p className="text-sm text-base-content/50">
            {isDirty ? "You have unsaved changes" : "Profile is up to date"}
          </p>
          <Button type="submit" loading={updateMutation.isPending} disabled={!isDirty && !updateMutation.isPending}>
            Save Profile
          </Button>
        </div>
      </form>
    </div>
  );
}
