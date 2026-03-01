"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { useForm } from "react-hook-form";

interface OrgSettingsForm {
  name: string;
  slug: string;
}

export default function SettingsPage() {
  const { currentOrg, refreshOrgs } = useAuthStore();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OrgSettingsForm>({
    defaultValues: {
      name: currentOrg?.name || "",
      slug: currentOrg?.slug || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: OrgSettingsForm) => api.orgs.update(currentOrg!.id, data),
    onSuccess: () => {
      refreshOrgs();
      setSuccess("Settings updated");
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Update failed");
      setSuccess("");
    },
  });

  return (
    <div>
      <PageHeader title="General Settings" description="Manage your organization" />

      <Card className="max-w-xl">
        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        {success && <div className="alert alert-success mb-4"><span>{success}</span></div>}

        <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
          <Input
            label="Organization Name"
            {...register("name", { required: "Name is required" })}
            error={errors.name?.message}
          />
          <Input
            label="Slug"
            {...register("slug", { required: "Slug is required" })}
            error={errors.slug?.message}
          />
          <div className="pt-2">
            <Button type="submit" loading={updateMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
