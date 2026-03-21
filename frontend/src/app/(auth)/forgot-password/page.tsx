"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useRedirectIfAuth } from "@/hooks/use-auth-guard";
import { Input } from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { parseAuthError } from "@/lib/auth-errors";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

interface ForgotForm {
  email: string;
}

export default function ForgotPasswordPage() {
  useRedirectIfAuth();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ForgotForm>();

  const onSubmit = async (data: ForgotForm) => {
    setError("");
    try {
      await api.auth.forgotPassword(data.email);
      setSentEmail(data.email);
      setSent(true);
    } catch (err) {
      setError(parseAuthError(err));
    }
  };

  if (sent) {
    return (
      <div className="card bg-base-100 shadow-2xl rounded-2xl">
        <div className="card-body p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="text-base-content/60 mt-2 text-sm">
              If an account exists for <strong>{sentEmail}</strong>, we&apos;ve
              sent a password reset code.
            </p>
          </div>

          <Link
            href={`/reset-password?email=${encodeURIComponent(sentEmail)}`}
            className="btn btn-primary w-full"
          >
            Enter Reset Code
          </Link>

          <div className="divider text-xs text-base-content/40 my-3">OR</div>

          <button
            type="button"
            className="btn btn-ghost btn-sm w-full"
            onClick={() => {
              setSent(false);
              setSentEmail("");
            }}
          >
            Try a different email
          </button>

          <p className="text-center text-xs text-base-content/40 mt-4">
            Didn&apos;t receive the email? Check your spam folder or{" "}
            <button
              type="button"
              className="link link-primary"
              onClick={() => {
                setSent(false);
                setSentEmail("");
              }}
            >
              try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-2xl rounded-2xl">
      <div className="card-body p-8">
        <div className="text-center mb-7">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-base-content">
            Forgot password?
          </h1>
          <p className="text-base-content/55 mt-1.5 text-sm">
            Enter your email and we&apos;ll send you a reset code
          </p>
        </div>

        {error && (
          <div className="alert alert-error mb-5 text-sm py-3">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            {...register("email", { required: "Email is required" })}
          />
          <Button type="submit" loading={isSubmitting} className="w-full mt-1">
            Send Reset Code
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
