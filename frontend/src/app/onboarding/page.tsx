"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/stores/auth-store";
import { Input } from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { slugify } from "@/lib/utils";
import { Building2 } from "lucide-react";

interface OnboardingForm {
  orgName: string;
  orgSlug: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, orgs, setCurrentOrg } = useAuthStore();
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<OnboardingForm>();

  // Redirect in effect — never during render
  useEffect(() => {
    if (isAuthenticated && orgs.length > 0) {
      router.replace(`/${orgs[0].slug}`);
    }
  }, [isAuthenticated, orgs, router]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  // Show nothing while redirecting
  if (!isAuthenticated || orgs.length > 0) {
    return null;
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setValue("orgSlug", slugify(name));
  };

  const onSubmit = async (data: OnboardingForm) => {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    try {
      const org = await api.orgs.create({
        name: data.orgName,
        slug: data.orgSlug,
      });
      await setCurrentOrg(org);
      // Update orgs in store and navigate — no refreshOrgs to avoid re-render cascade
      useAuthStore.setState((s) => ({ orgs: [...s.orgs, org] }));
      router.push(`/${org.slug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create organization.");
      }
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <div className="w-full max-w-lg">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h1 className="text-2xl font-bold">Create Your Organization</h1>
              <p className="text-base-content/60 mt-2">
                Set up your workspace to start managing projects
              </p>
            </div>

            {error && (
              <div className="alert alert-error mb-4">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Organization Name"
                placeholder="My Company"
                {...register("orgName", { required: "Name is required" })}
                error={errors.orgName?.message}
                onChange={(e) => {
                  register("orgName").onChange(e);
                  handleNameChange(e);
                }}
              />
              <Input
                label="URL Slug"
                placeholder="my-company"
                helperText={`Your workspace will be at orbispm.com/${watch("orgSlug") || "my-company"}`}
                {...register("orgSlug", {
                  required: "Slug is required",
                  pattern: {
                    value: /^[a-z0-9-]+$/,
                    message: "Only lowercase letters, numbers, and dashes",
                  },
                })}
                error={errors.orgSlug?.message}
              />
              <Button type="submit" loading={isSubmitting} className="w-full">
                Create Organization
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
