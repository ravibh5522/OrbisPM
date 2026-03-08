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
import { Shield, Smartphone, Mail, Key } from "lucide-react";

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

// MFA method labels and icons for the step-2 UI
const MFA_METHOD_LABELS: Record<string, { label: string; Icon: React.ElementType; hint: string }> = {
  totp:          { label: "Authenticator App",  Icon: Smartphone, hint: "Enter the 6-digit code from your authenticator app." },
  otp_email:     { label: "Email One-Time Code", Icon: Mail,       hint: "A verification code will be sent to your email." },
  otp_sms:       { label: "SMS One-Time Code",   Icon: Smartphone, hint: "A verification code will be sent to your phone." },
  recovery_code: { label: "Backup Code",         Icon: Key,        hint: "Use one of your downloaded backup codes." },
};

interface LoginForm {
  email: string;
  password: string;
}

interface MFAChallenge {
  sessionId: string;
  sessionToken: string;
  availableMethods: string[];
}

export default function LoginPage() {
  useRedirectIfAuth();
  const router = useRouter();
  const { login, loginComplete } = useAuthStore();
  const [error, setError] = useState("");
  const [idps, setIdps] = useState<IDPInfo[]>([]);
  const [idpLoading, setIdpLoading] = useState<string | null>(null);

  // MFA two-step state
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null);
  const [mfaMethod, setMfaMethod] = useState<string>("");
  const [mfaCode, setMfaCode] = useState("");
  const [sendingChallenge, setSendingChallenge] = useState(false);
  const [challengeSent, setChallengeSent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginForm>();

  useEffect(() => {
    api.auth.listIDPs().then((res) => setIdps(res.idps || [])).catch(() => {});
  }, []);

  const redirectAfterLogin = () => {
    const orgs = useAuthStore.getState().orgs;
    if (orgs.length === 0) {
      router.push("/onboarding");
    } else {
      router.push(`/${orgs[0].slug}`);
    }
  };

  const onSubmit = async (data: LoginForm) => {
    setError("");
    try {
      await login(data.email, data.password);
      redirectAfterLogin();
    } catch (err) {
      // Check if this is an MFA challenge (thrown by the store)
      if (err instanceof Error && (err as unknown as { mfa_required?: boolean }).mfa_required) {
        const e = err as unknown as { session_id: string; session_token: string; available_methods: string[] };
        const methods = e.available_methods ?? [];
        setMfaChallenge({
          sessionId: e.session_id,
          sessionToken: e.session_token,
          availableMethods: [...methods, "recovery_code"], // always offer backup code
        });
        setMfaMethod(methods[0] ?? "totp");
        setError("");
        return;
      }
      setError(parseAuthError(err));
    }
  };

  const handleSendOTPChallenge = async () => {
    if (!mfaChallenge) return;
    setSendingChallenge(true);
    setError("");
    try {
      await api.auth.sendOTPChallenge(mfaChallenge.sessionId, mfaChallenge.sessionToken, mfaMethod);
      setChallengeSent(true);
    } catch (err) {
      setError(parseAuthError(err));
    } finally {
      setSendingChallenge(false);
    }
  };

  const handleMFAMethodChange = (method: string) => {
    setMfaMethod(method);
    setMfaCode("");
    setChallengeSent(false);
    setError("");
  };

  const handleMFAVerify = async () => {
    if (!mfaChallenge || !mfaCode.trim()) return;
    setVerifying(true);
    setError("");
    try {
      const tokens = await api.auth.verifyLoginMFA(
        mfaChallenge.sessionId,
        mfaChallenge.sessionToken,
        mfaMethod,
        mfaCode.trim(),
      );
      await loginComplete(tokens);
      redirectAfterLogin();
    } catch (err) {
      setError(parseAuthError(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleIDPLogin = async (idp: IDPInfo) => {
    setError("");
    setIdpLoading(idp.id);
    try {
      const origin = window.location.origin;
      const res = await api.auth.startIDPLogin(
        idp.id,
        `${origin}/login`,
        `${origin}/login`,
      );
      window.location.href = res.auth_url;
    } catch (err) {
      setError(parseAuthError(err));
      setIdpLoading(null);
    }
  };

  // ── MFA Step-2 UI ────────────────────────────────────────────────────────
  if (mfaChallenge) {
    const methodInfo = MFA_METHOD_LABELS[mfaMethod] ?? MFA_METHOD_LABELS.totp;
    const needsSend = mfaMethod === "otp_email" || mfaMethod === "otp_sms";

    return (
      <div className="card bg-base-100 shadow-2xl rounded-2xl">
        <div className="card-body p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Two-Factor Verification</h1>
            <p className="text-base-content/60 mt-1 text-sm">
              Your account is protected with MFA. Please verify your identity.
            </p>
          </div>

          {error && (
            <div className="alert alert-error mb-4 text-sm">
              <span>{error}</span>
            </div>
          )}

          {mfaChallenge.availableMethods.length > 1 && (
            <div className="mb-4">
              <label className="text-xs text-base-content/50 mb-1.5 block font-medium">Verification method</label>
              <div className="flex flex-wrap gap-2">
                {mfaChallenge.availableMethods.map((m) => {
                  const info = MFA_METHOD_LABELS[m] ?? MFA_METHOD_LABELS.totp;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleMFAMethodChange(m)}
                      className={`btn btn-sm gap-1 ${mfaMethod === m ? "btn-primary" : "btn-ghost btn-outline"}`}
                    >
                      <info.Icon className="w-3.5 h-3.5" />
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border border-base-200 rounded-xl p-4 mb-4 bg-base-50">
            <div className="flex items-center gap-2 mb-3">
              <methodInfo.Icon className="w-5 h-5 text-primary" />
              <span className="font-medium text-sm">{methodInfo.label}</span>
            </div>
            <p className="text-xs text-base-content/60 mb-3">{methodInfo.hint}</p>

            {/* Send OTP button for email/SMS */}
            {needsSend && !challengeSent && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSendOTPChallenge}
                loading={sendingChallenge}
                className="mb-3"
              >
                Send Code
              </Button>
            )}
            {needsSend && challengeSent && (
              <div className="text-xs text-success mb-3 flex items-center gap-1">
                ✓ Code sent — check your {mfaMethod === "otp_email" ? "email" : "phone"}
                <button
                  type="button"
                  className="link link-primary ml-2"
                  onClick={() => { setChallengeSent(false); handleSendOTPChallenge(); }}
                >
                  Resend
                </button>
              </div>
            )}

            <Input
              placeholder={mfaMethod === "recovery_code" ? "XXXX-XXXX-XXXX" : "000000"}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              maxLength={mfaMethod === "recovery_code" ? 32 : 8}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleMFAVerify()}
            />
          </div>

          <Button
            onClick={handleMFAVerify}
            loading={verifying}
            disabled={!mfaCode.trim() || (needsSend && !challengeSent)}
            className="w-full"
          >
            Verify &amp; Sign In
          </Button>

          <button
            type="button"
            className="btn btn-ghost btn-sm mt-2 w-full"
            onClick={() => { setMfaChallenge(null); setError(""); }}
          >
            ← Back to login
          </button>
        </div>
      </div>
    );
  }

  // ── Step-1: email + password ──────────────────────────────────────────────
  return (
    <div className="card bg-base-100 shadow-2xl rounded-2xl">
      <div className="card-body p-8">
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-base-content">Welcome back</h1>
          <p className="text-base-content/55 mt-1.5 text-sm">Sign in to your OrbisPM account</p>
        </div>

        {error && (
          <div className="alert alert-error mb-5 text-sm py-3">
            <span>{error}</span>
          </div>
        )}

        {/* Social Login Buttons */}
        {idps.length > 0 && (
          <>
            <div className="space-y-2">
              {idps.map((idp) => (
                <button
                  key={idp.id}
                  type="button"
                  className={`btn ${getIDPColor(idp)} w-full gap-2`}
                  onClick={() => handleIDPLogin(idp)}
                  disabled={idpLoading !== null}
                >
                  {idpLoading === idp.id ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <span className="font-bold text-sm">{getIDPIcon(idp)}</span>
                  )}
                  Continue with {idp.name}
                </button>
              ))}
            </div>
            <div className="divider text-xs text-base-content/40 my-4">OR</div>
          </>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            {...register("email", { required: "Email is required" })}
          />
          <PasswordInput
            label="Password"
            placeholder="••••••••"
            autoComplete="current-password"
            {...register("password", { required: "Password is required" })}
          />
          <div className="flex justify-end -mt-1">
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" loading={isSubmitting} className="w-full mt-1">
            Sign In
          </Button>
        </form>

        <p className="text-center text-sm mt-5 text-base-content/60">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="link link-primary font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
