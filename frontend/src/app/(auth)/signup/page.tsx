"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/stores/auth-store";
import { useRedirectIfAuth } from "@/hooks/use-auth-guard";
import { Input, PasswordInput } from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api";
import { parseAuthError } from "@/lib/auth-errors";
import type { IDPInfo } from "@/types/domain";

const IDP_ICONS: Record<string, string> = {
  google: "G",
  microsoft: "M",
  github: "GH",
  gitlab: "GL",
};

function getIDPIcon(idp: IDPInfo): string {
  const name = idp.name.toLowerCase();
  for (const [key, icon] of Object.entries(IDP_ICONS)) {
    if (name.includes(key)) return icon;
  }
  return idp.name.charAt(0).toUpperCase();
}

function getIDPColor(idp: IDPInfo): string {
  const name = idp.name.toLowerCase();
  if (name.includes("google")) return "btn-error";
  if (name.includes("microsoft")) return "btn-info";
  if (name.includes("github")) return "btn-neutral";
  return "btn-secondary";
}

interface SignupForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function SignupPage() {
  useRedirectIfAuth();
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);
  const [error, setError] = useState("");
  const [idps, setIdps] = useState<IDPInfo[]>([]);
  const [idpLoading, setIdpLoading] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<SignupForm>();

  useEffect(() => {
    api.auth.listIDPs().then((res) => setIdps(res.idps || [])).catch(() => {});
  }, []);

  const onSubmit = async (data: SignupForm) => {
    setError("");
    try {
      await signup(data.email, data.password, data.name);
      router.push("/onboarding");
    } catch (err) {
      setError(parseAuthError(err));
    }
  };

  const handleIDPSignup = async (idp: IDPInfo) => {
    setError("");
    setIdpLoading(idp.id);
    try {
      const origin = window.location.origin;
      const res = await api.auth.startIDPLogin(
        idp.id,
        `${origin}/signup`,
        `${origin}/signup`,
      );
      window.location.href = res.auth_url;
    } catch (err) {
      setError(parseAuthError(err));
      setIdpLoading(null);
    }
  };

  return (
    <div className="card bg-base-100 shadow-2xl rounded-2xl">
      <div className="card-body p-8">
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-base-content">Create account</h1>
          <p className="text-base-content/55 mt-1.5 text-sm">Get started with OrbisPM for free</p>
        </div>

        {error && (
          <div className="alert alert-error mb-5 text-sm py-3">
            <span>{error}</span>
          </div>
        )}

        {/* Social Signup Buttons */}
        {idps.length > 0 && (
          <>
            <div className="space-y-2">
              {idps.map((idp) => (
                <button
                  key={idp.id}
                  type="button"
                  className={`btn ${getIDPColor(idp)} w-full gap-2`}
                  onClick={() => handleIDPSignup(idp)}
                  disabled={idpLoading !== null}
                >
                  {idpLoading === idp.id ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <span className="font-bold text-sm">{getIDPIcon(idp)}</span>
                  )}
                  Sign up with {idp.name}
                </button>
              ))}
            </div>
            <div className="divider text-xs text-base-content/40 my-4">OR</div>
          </>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="John Doe"
            autoComplete="name"
            {...register("name", { required: "Name is required" })}
            error={errors.name?.message}
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            {...register("email", { required: "Email is required" })}
            error={errors.email?.message}
          />
          <PasswordInput
            label="Password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("password", {
              required: "Password is required",
              minLength: { value: 8, message: "At least 8 characters" },
            })}
            error={errors.password?.message}
          />
          <PasswordInput
            label="Confirm Password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("confirmPassword", {
              required: "Please confirm your password",
              validate: (v) => v === watch("password") || "Passwords do not match",
            })}
            error={errors.confirmPassword?.message}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm mt-5 text-base-content/60">
          Already have an account?{" "}
          <Link href="/login" className="link link-primary font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
