"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/stores/auth-store";
import { useRedirectIfAuth } from "@/hooks/use-auth-guard";
import { Input } from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api";
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
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Signup failed. Please try again.");
      }
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
      setError(err instanceof ApiError ? err.message : "Social signup failed");
      setIdpLoading(null);
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary">OrbisPM</h1>
          <p className="text-base-content/60 mt-2">Create your account</p>
        </div>

        {error && (
          <div className="alert alert-error mb-4">
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
            <div className="divider text-xs text-base-content/40">OR</div>
          </>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="John Doe"
            {...register("name", { required: "Name is required" })}
            error={errors.name?.message}
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            {...register("email", { required: "Email is required" })}
            error={errors.email?.message}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            {...register("password", {
              required: "Password is required",
              minLength: { value: 6, message: "At least 6 characters" },
            })}
            error={errors.password?.message}
          />
          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
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

        <p className="text-center text-sm mt-4">
          Already have an account?{" "}
          <Link href="/login" className="link link-primary">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
