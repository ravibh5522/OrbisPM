"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { api } from "@/lib/api";
import { parseAuthError } from "@/lib/auth-errors";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

interface CompleteProfileForm {
  email: string;
}

/**
 * /auth/complete-profile
 *
 * Shown after SSO sign-in when the identity provider (e.g. GitHub with a
 * 100% private account) didn't expose an email address. The user must supply
 * one before we can create their organisation and proceed to the app.
 *
 * The user already has valid tokens at this point (stored by loginComplete in
 * the callback page). We just need to collect their email, push it to Zitadel,
 * update the local auth state, and then route them like a brand-new user.
 */
export default function CompleteProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, orgs, user, updateUser } = useAuthStore();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<CompleteProfileForm>();

  // If the user already has an email, they don't belong on this page.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (user?.email) {
      // Already has email — route to next step in lifecycle.
      if (orgs.length === 0) {
        router.replace("/onboarding");
      } else {
        router.replace(`/${orgs[0].slug}`);
      }
    }
  }, [isAuthenticated, isLoading, orgs, user, router]);

  if (isLoading || !isAuthenticated || (user?.email && orgs.length > 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center auth-bg">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const onSubmit = async (data: CompleteProfileForm) => {
    setServerError("");
    try {
      const updatedUser = await api.auth.completeProfile(data.email);
      // Update the auth store with the fresh user (which now has an email).
      updateUser(updatedUser);
      // Continue with the normal new-user lifecycle.
      if (orgs.length === 0) {
        router.push("/onboarding");
      } else {
        router.push(`/${orgs[0].slug}`);
      }
    } catch (err) {
      setServerError(parseAuthError(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 auth-bg">
      <div className="card bg-base-100 shadow-2xl rounded-2xl w-full max-w-md">
        <div className="card-body p-8">
          {/* Icon */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-base-content">
              One last step
            </h1>
            <p className="text-base-content/60 text-sm mt-2 max-w-xs mx-auto">
              Your sign-in provider didn&apos;t share your email address. Please
              enter it below so we can complete your account.
            </p>
          </div>

          {serverError && (
            <Alert
              variant="error"
              className="mb-5 text-sm py-3"
              onDismiss={() => setServerError("")}
            >
              {serverError}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              {...register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Enter a valid email address",
                },
              })}
              error={errors.email?.message}
            />

            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full"
            >
              Continue
            </Button>
          </form>

          <p className="text-center text-xs text-base-content/40 mt-5">
            Your email is used only for account recovery and notifications.
          </p>
        </div>
      </div>
    </div>
  );
}
