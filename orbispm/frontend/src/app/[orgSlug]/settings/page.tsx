"use client";

import { useEffect, useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";
import { Building2, Mail, MapPin, Briefcase, Calendar, CheckCircle, Camera } from "lucide-react";
import { formatDate } from "@/lib/utils";

const INDUSTRY_OPTIONS = [
  { value: "", label: "Select industry" },
  { value: "technology", label: "Technology" },
  { value: "finance", label: "Finance & Banking" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "ecommerce", label: "E-commerce & Retail" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "media", label: "Media & Entertainment" },
  { value: "nonprofit", label: "Non-profit" },
  { value: "consulting", label: "Consulting" },
  { value: "other", label: "Other" },
];

const SIZE_OPTIONS = [
  { value: "", label: "Select size" },
  { value: "1-10", label: "1 – 10 employees" },
  { value: "11-50", label: "11 – 50 employees" },
  { value: "51-200", label: "51 – 200 employees" },
  { value: "201-500", label: "201 – 500 employees" },
  { value: "501-1000", label: "501 – 1,000 employees" },
  { value: "1000+", label: "1,000+ employees" },
];

const TIMEZONE_OPTIONS = [
  { value: "", label: "Select timezone" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
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

interface OrgSettingsForm {
  // Identity
  name: string;
  slug: string;
  logo_url: string;
  description: string;
  // Contact
  website: string;
  contact_email: string;
  support_email: string;
  phone: string;
  // Location
  address: string;
  city: string;
  country: string;
  // Details
  industry: string;
  size: string;
  timezone: string;
}

export default function SettingsPage() {
  const { currentOrg, refreshOrgs } = useAuthStore();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract extra settings from org.settings JSONB
  const settings = (currentOrg?.settings || {}) as Record<string, string>;

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm<OrgSettingsForm>({
    defaultValues: {
      name: currentOrg?.name || "",
      slug: currentOrg?.slug || "",
      logo_url: currentOrg?.logo_url || "",
      description: settings.description || "",
      website: settings.website || "",
      contact_email: settings.contact_email || "",
      support_email: settings.support_email || "",
      phone: settings.phone || "",
      address: settings.address || "",
      city: settings.city || "",
      country: settings.country || "",
      industry: settings.industry || "",
      size: settings.size || "",
      timezone: settings.timezone || "",
    },
  });

  // Reset when org changes
  useEffect(() => {
    const s = (currentOrg?.settings || {}) as Record<string, string>;
    reset({
      name: currentOrg?.name || "",
      slug: currentOrg?.slug || "",
      logo_url: currentOrg?.logo_url || "",
      description: s.description || "",
      website: s.website || "",
      contact_email: s.contact_email || "",
      support_email: s.support_email || "",
      phone: s.phone || "",
      address: s.address || "",
      city: s.city || "",
      country: s.country || "",
      industry: s.industry || "",
      size: s.size || "",
      timezone: s.timezone || "",
    });
  }, [currentOrg?.id, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: OrgSettingsForm) => {
      const { name, slug, logo_url, ...rest } = data;
      const settingsPayload: Record<string, string> = {};
      for (const [k, v] of Object.entries(rest)) {
        settingsPayload[k] = v as string;
      }
      return api.orgs.update(currentOrg!.id, {
        name,
        slug,
        logo_url: logo_url || undefined,
        settings: settingsPayload,
      });
    },
    onSuccess: () => {
      refreshOrgs();
      qc.invalidateQueries({ queryKey: ["org"] });
      setSuccess("Settings saved successfully");
      setError("");
      setTimeout(() => setSuccess(""), 4000);
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Update failed");
      setSuccess("");
    },
  });

  const logoUrl = watch("logo_url");
  const orgName = watch("name");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setValue("logo_url", result.url, { shouldDirty: true });
      setSuccess("Logo uploaded! Click Save to apply.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="General Settings"
        description="Manage your organization profile and preferences"
      />

      {error && <div className="alert alert-error mb-4 text-sm"><span>{error}</span></div>}
      {success && (
        <div className="alert alert-success mb-4 text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">

        {/* ── Identity ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <Building2 className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Organization Identity</h2>
          </div>

          {/* Logo preview */}
          <div className="flex items-center gap-4 mb-5 p-3 bg-base-200 rounded-lg">
            <div className="relative group">
              <Avatar
                name={orgName || currentOrg?.name || "O"}
                src={logoUrl || undefined}
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
                onChange={handleLogoUpload}
              />
            </div>
            <div>
              <p className="font-medium text-sm">{orgName || currentOrg?.name}</p>
              <p className="text-xs text-base-content/50">
                {currentOrg?.plan ? `Plan: ${currentOrg.plan}` : ""}
                {currentOrg?.created_at ? ` · Created ${formatDate(currentOrg.created_at)}` : ""}
              </p>
              <p className="text-xs text-base-content/40 mt-1">Click logo to upload</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Organization Name"
              placeholder="Acme Corp"
              {...register("name", { required: "Name is required", minLength: { value: 2, message: "Min 2 chars" } })}
              error={errors.name?.message}
            />
            <Input
              label="URL Slug"
              placeholder="acme-corp"
              helperText="Used in your workspace URL"
              {...register("slug", {
                required: "Slug is required",
                pattern: { value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: "Lowercase letters, numbers and hyphens only" },
              })}
              error={errors.slug?.message}
            />
            <div className="md:col-span-2">
              <Input
                label="Logo URL"
                type="url"
                placeholder="https://example.com/logo.png"
                helperText="Direct link to your organization logo"
                {...register("logo_url")}
              />
            </div>
            <div className="md:col-span-2">
              <Textarea
                label="Description"
                placeholder="Brief description of your organization"
                {...register("description")}
              />
            </div>
          </div>
        </Card>

        {/* ── Contact ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Contact Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Website"
              type="url"
              placeholder="https://yourcompany.com"
              {...register("website")}
            />
            <Input
              label="Phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              {...register("phone")}
            />
            <Input
              label="Contact Email"
              type="email"
              placeholder="contact@yourcompany.com"
              helperText="Public contact email"
              {...register("contact_email")}
            />
            <Input
              label="Support Email"
              type="email"
              placeholder="support@yourcompany.com"
              helperText="Customer support email"
              {...register("support_email")}
            />
          </div>
        </Card>

        {/* ── Location ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <MapPin className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Location</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Street Address"
                placeholder="123 Main Street, Suite 100"
                {...register("address")}
              />
            </div>
            <Input
              label="City"
              placeholder="New York"
              {...register("city")}
            />
            <Input
              label="Country"
              placeholder="United States"
              {...register("country")}
            />
          </div>
        </Card>

        {/* ── Organization Details ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <Briefcase className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Organization Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Industry"
              options={INDUSTRY_OPTIONS}
              {...register("industry")}
            />
            <Select
              label="Company Size"
              options={SIZE_OPTIONS}
              {...register("size")}
            />
            <Select
              label="Timezone"
              options={TIMEZONE_OPTIONS}
              {...register("timezone")}
            />
          </div>
        </Card>

        {/* ── Plan Info (read-only) ── */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Account Summary</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-base-200 rounded-lg">
              <div className="text-xs text-base-content/50 mb-1">Plan</div>
              <div className="font-semibold capitalize">{currentOrg?.plan || "free"}</div>
            </div>
            <div className="text-center p-3 bg-base-200 rounded-lg">
              <div className="text-xs text-base-content/50 mb-1">Org ID</div>
              <div className="font-mono text-xs truncate">{currentOrg?.id?.slice(0, 12)}…</div>
            </div>
            <div className="text-center p-3 bg-base-200 rounded-lg">
              <div className="text-xs text-base-content/50 mb-1">Created</div>
              <div className="text-sm">{currentOrg?.created_at ? formatDate(currentOrg.created_at) : "—"}</div>
            </div>
            <div className="text-center p-3 bg-base-200 rounded-lg">
              <div className="text-xs text-base-content/50 mb-1">Updated</div>
              <div className="text-sm">{currentOrg?.updated_at ? formatDate(currentOrg.updated_at) : "—"}</div>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between py-2">
          <p className="text-sm text-base-content/50">
            {isDirty ? "You have unsaved changes" : "All changes are saved"}
          </p>
          <Button type="submit" loading={updateMutation.isPending} disabled={!isDirty && !updateMutation.isPending}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
