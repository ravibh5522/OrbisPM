"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/form-fields";
import { useRedirectIfAuth } from "@/hooks/use-auth-guard";
import { api } from "@/lib/api";
import { parseAuthError } from "@/lib/auth-errors";
import { useAuthStore } from "@/stores/auth-store";
import { Key, Mail, Shield, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

// ── SSO identity provider IDs configured in Zitadel ──────────────────────
const GOOGLE_IDP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_IDP_ID ?? "371632718112358914";
const GITHUB_IDP_ID =
  process.env.NEXT_PUBLIC_GITHUB_IDP_ID ?? "371633241645384194";

// sessionStorage key used by both this page and the callback page
const PKCE_STORAGE_KEY = "oidc_pkce";

// ── Demo personas ─────────────────────────────────────────────────────────
interface DemoUser {
  email: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  roleColor: string;
  title: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: "sarah.chen@acme.demo",
    name: "Sarah Chen",
    initials: "SC",
    color: "bg-violet-500",
    role: "Owner",
    roleColor: "badge-primary",
    title: "VP of Engineering",
  },
  {
    email: "marcus.johnson@acme.demo",
    name: "Marcus Johnson",
    initials: "MJ",
    color: "bg-blue-500",
    role: "Admin",
    roleColor: "badge-info",
    title: "Engineering Manager",
  },
  {
    email: "priya.patel@acme.demo",
    name: "Priya Patel",
    initials: "PP",
    color: "bg-emerald-500",
    role: "Member",
    roleColor: "badge-success",
    title: "Backend Engineer",
  },
  {
    email: "olivia.brown@acme.demo",
    name: "Olivia Brown",
    initials: "OB",
    color: "bg-rose-500",
    role: "Member",
    roleColor: "badge-success",
    title: "Lead Designer",
  },
  {
    email: "mia.anderson@acme.demo",
    name: "Mia Anderson",
    initials: "MA",
    color: "bg-amber-500",
    role: "Member",
    roleColor: "badge-success",
    title: "QA Lead",
  },
  {
    email: "mason.walker@acme.demo",
    name: "Mason Walker",
    initials: "MW",
    color: "bg-slate-500",
    role: "Billing",
    roleColor: "badge-warning",
    title: "Finance",
  },
];

const DEMO_PASSWORD = "Demo@Acme2026!";

// MFA method labels and icons for the step-2 UI
const MFA_METHOD_LABELS: Record<
  string,
  { label: string; Icon: React.ElementType; hint: string }
> = {
  totp: {
    label: "Authenticator App",
    Icon: Smartphone,
    hint: "Enter the 6-digit code from your authenticator app.",
  },
  otp_email: {
    label: "Email One-Time Code",
    Icon: Mail,
    hint: "A verification code will be sent to your email.",
  },
  otp_sms: {
    label: "SMS One-Time Code",
    Icon: Smartphone,
    hint: "A verification code will be sent to your phone.",
  },
  recovery_code: {
    label: "Backup Code",
    Icon: Key,
    hint: "Use one of your downloaded backup codes.",
  },
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
  const { login, loginComplete } = useAuthStore();
  const [error, setError] = useState("");
  const [ssoLoading, setSsoLoading] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  // MFA two-step state
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null);
  const [mfaMethod, setMfaMethod] = useState<string>("");
  const [mfaCode, setMfaCode] = useState("");
  const [sendingChallenge, setSendingChallenge] = useState(false);
  const [challengeSent, setChallengeSent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<LoginForm>();

  // ── OIDC PKCE + IDP hint ────────────────────────────────────────────────
  // Builds a Zitadel OIDC authorization URL that includes the IDP hint scope
  // (urn:zitadel:iam:org:idp:id:{idpId}), which causes Zitadel to skip its own
  // login page and redirect the user directly to the specified identity provider.
  const handleSSOLogin = async (idpId: string) => {
    setError("");
    setSsoLoading(idpId);
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const state = crypto.randomUUID();
      const result = await api.auth.oidcAuthorize(redirectUri, state, idpId);
      // Persist PKCE values so the callback page can complete the exchange
      sessionStorage.setItem(
        PKCE_STORAGE_KEY,
        JSON.stringify({
          codeVerifier: result.code_verifier,
          state: result.state,
          redirectUri,
        }),
      );
      window.location.href = result.auth_url;
    } catch (err) {
      setError(parseAuthError(err));
      setSsoLoading(null);
    }
  };

  const onSubmit = async (data: LoginForm) => {
    setError("");
    try {
      await login(data.email, data.password);
    } catch (err) {
      // Check if this is an MFA challenge (thrown by the store)
      if (
        err instanceof Error &&
        (err as unknown as { mfa_required?: boolean }).mfa_required
      ) {
        const e = err as unknown as {
          session_id: string;
          session_token: string;
          available_methods: string[];
        };
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
      await api.auth.sendOTPChallenge(
        mfaChallenge.sessionId,
        mfaChallenge.sessionToken,
        mfaMethod,
      );
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
    } catch (err) {
      setError(parseAuthError(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleDemoLogin = async (user: DemoUser) => {
    setError("");
    setDemoLoading(user.email);
    try {
      await login(user.email, DEMO_PASSWORD);
    } catch (err) {
      setError(parseAuthError(err));
      setDemoLoading(null);
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
            <Alert variant="error" className="mb-4 text-sm" onDismiss={() => setError("")}>
              {error}
            </Alert>
          )}

          {mfaChallenge.availableMethods.length > 1 && (
            <div className="mb-4">
              <label className="text-xs text-base-content/50 mb-1.5 block font-medium">
                Verification method
              </label>
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

          <div className="border border-base-200 rounded-xl p-4 mb-4 bg-base-100">
            <div className="flex items-center gap-2 mb-3">
              <methodInfo.Icon className="w-5 h-5 text-primary" />
              <span className="font-medium text-sm">{methodInfo.label}</span>
            </div>
            <p className="text-xs text-base-content/60 mb-3">
              {methodInfo.hint}
            </p>

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
                ✓ Code sent — check your{" "}
                {mfaMethod === "otp_email" ? "email" : "phone"}
                <button
                  type="button"
                  className="link link-primary ml-2"
                  onClick={() => {
                    setChallengeSent(false);
                    handleSendOTPChallenge();
                  }}
                >
                  Resend
                </button>
              </div>
            )}

            <Input
              placeholder={
                mfaMethod === "recovery_code" ? "XXXX-XXXX-XXXX" : "000000"
              }
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
            onClick={() => {
              setMfaChallenge(null);
              setError("");
            }}
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
          <p className="text-base-content/55 mt-1.5 text-sm">
            Sign in to your OrbisPM account
          </p>
        </div>

        {error && (
          <Alert variant="error" className="mb-5 text-sm py-3" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}

        {/* SSO Buttons — Google and GitHub via Zitadel IDP hint */}
        <div className="space-y-2.5 mb-2">
          <button
            type="button"
            className="btn btn-outline w-full gap-3 hover:bg-base-200 border-base-300"
            onClick={() => handleSSOLogin(GOOGLE_IDP_ID)}
            disabled={ssoLoading !== null || isSubmitting}
          >
            {ssoLoading === GOOGLE_IDP_ID ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            <span className="font-medium text-sm">Continue with Google</span>
          </button>

          <button
            type="button"
            className="btn btn-outline w-full gap-3 hover:bg-base-200 border-base-300"
            onClick={() => handleSSOLogin(GITHUB_IDP_ID)}
            disabled={ssoLoading !== null || isSubmitting}
          >
            {ssoLoading === GITHUB_IDP_ID ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
                />
              </svg>
            )}
            <span className="font-medium text-sm">Continue with GitHub</span>
          </button>
        </div>

        <div className="divider text-xs text-base-content/40 my-4">OR</div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email", { required: "Email is required" })}
          />
          <PasswordInput
            label="Password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password", { required: "Password is required" })}
          />
          <div className="flex justify-end -mt-1">
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
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

        {/* Demo Login Panel */}
        <div className="mt-6">
          <div className="divider text-xs text-base-content/40 my-0">
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              className="btn btn-ghost btn-xs gap-1 text-base-content/50 hover:text-base-content"
            >
              <span>Try a demo account</span>
              <span
                className={`transition-transform duration-200 ${showDemo ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>
          </div>

          {showDemo && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-center text-base-content/50 mb-3">
                Click any persona to sign in instantly — no setup needed.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => handleDemoLogin(user)}
                    disabled={demoLoading !== null}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-base-200 hover:border-primary/40 hover:bg-base-200/60 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed group"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg ${user.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}
                    >
                      {demoLoading === user.email ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        user.initials
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-base-content truncate group-hover:text-primary transition-colors">
                        {user.name}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className={`badge badge-xs ${user.roleColor} shrink-0`}
                        >
                          {user.role}
                        </span>
                        <span className="text-[10px] text-base-content/50 truncate">
                          {user.title}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
