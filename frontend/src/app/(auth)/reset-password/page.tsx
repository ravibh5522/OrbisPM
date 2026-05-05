"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/form-fields";
import { useRedirectIfAuth } from "@/hooks/use-auth-guard";
import { api } from "@/lib/api";
import { parseAuthError } from "@/lib/auth-errors";
import { ArrowLeft, CheckCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

interface ResetForm {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ResetPasswordPage() {
  useRedirectIfAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<ResetForm>({
    defaultValues: {
      email: searchParams.get("email") || "",
    },
  });

  const onSubmit = async (data: ResetForm) => {
    setError("");
    try {
      await api.auth.resetPassword(data.email, data.code, data.newPassword);
      setSuccess(true);
    } catch (err) {
      setError(parseAuthError(err));
    }
  };

  if (success) {
    return (
      <div className="card bg-base-100 shadow-2xl rounded-2xl">
        <div className="card-body p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
            <h1 className="text-2xl font-bold">Password reset!</h1>
            <p className="text-base-content/60 mt-2 text-sm">
              Your password has been successfully changed. You can now sign in
              with your new password.
            </p>
          </div>
          <Button className="w-full" onClick={() => router.push("/login")}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-2xl rounded-2xl">
      <div className="card-body p-8">
        <div className="text-center mb-7">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-base-content">
            Reset your password
          </h1>
          <p className="text-base-content/55 mt-1.5 text-sm">
            Enter the code from your email and choose a new password
          </p>
        </div>

        {error && (
          <Alert variant="error" className="mb-5 text-sm py-3" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email", { required: "Email is required" })}
          />
          <Input
            label="Reset Code"
            placeholder="Enter the code from your email"
            autoComplete="one-time-code"
            autoFocus={!!searchParams.get("email")}
            error={errors.code?.message}
            {...register("code", { required: "Reset code is required" })}
          />
          <PasswordInput
            label="New Password"
            placeholder="Enter new password"
            autoComplete="new-password"
            {...register("newPassword", {
              required: "Password is required",
              minLength: {
                value: 8,
                message: "Password must be at least 8 characters",
              },
            })}
            error={errors.newPassword?.message}
          />
          <PasswordInput
            label="Confirm Password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            {...register("confirmPassword", {
              required: "Please confirm your password",
              validate: (v) =>
                v === watch("newPassword") || "Passwords do not match",
            })}
            error={errors.confirmPassword?.message}
          />
          <Button type="submit" loading={isSubmitting} className="w-full mt-1">
            Reset Password
          </Button>
        </form>

        <p className="text-center text-sm mt-5 text-base-content/60">
          <Link
            href="/login"
            className="link link-primary font-medium inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
