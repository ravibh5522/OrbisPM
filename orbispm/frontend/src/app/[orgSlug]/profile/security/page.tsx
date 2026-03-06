"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import {
  Shield,
  Smartphone,
  Mail,
  Key,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Download,
  Copy,
  RefreshCw,
} from "lucide-react";
import type { TOTPRegistration } from "@/types/domain";

export default function SecurityPage() {
  const { user, updateUser } = useAuthStore();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Backup codes state
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showCodesModal, setShowCodesModal] = useState(false);

  // TOTP Setup state
  const [totpSetup, setTotpSetup] = useState<TOTPRegistration | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const clearMessages = useCallback(() => {
    setError("");
    setSuccess("");
  }, []);

  // Derived per-factor state from user object (refreshed after each MFA operation)
  const totpEnabled = user?.totp_enabled ?? false;
  const otpEmailEnabled = user?.otp_email_enabled ?? false;
  const otpSMSEnabled = user?.otp_sms_enabled ?? false;
  const anyMFAEnabled = user?.mfa_enabled ?? false;

  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await api.auth.getUser();
      updateUser(freshUser);
    } catch {
      // ignore refresh errors silently
    }
  }, [updateUser]);

  // Sync MFA status from server on mount (store may have stale data from previous session)
  useEffect(() => {
    refreshUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register TOTP
  const registerTOTP = useMutation({
    mutationFn: () => api.mfa.registerTOTP(),
    onSuccess: (data) => {
      setTotpSetup(data);
      clearMessages();
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Failed to setup TOTP");
    },
  });

  // Verify TOTP
  const verifyTOTP = useMutation({
    mutationFn: (code: string) => api.mfa.verifyTOTP(code),
    onSuccess: () => {
      setTotpSetup(null);
      setTotpCode("");
      setSuccess("Authenticator app enabled successfully!");
      refreshUser();
    },
    onError: (e: Error) => {
      setError(
        e instanceof ApiError
          ? e.message
          : "Invalid TOTP code — check your app and try again"
      );
    },
  });

  // Remove TOTP
  const removeTOTP = useMutation({
    mutationFn: () => api.mfa.removeTOTP(),
    onSuccess: () => {
      setSuccess("Authenticator app removed");
      refreshUser();
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Failed to remove TOTP");
    },
  });

  // OTP Email
  const enableOTPEmail = useMutation({
    mutationFn: () => api.mfa.enableOTPEmail(),
    onSuccess: () => {
      setSuccess("Email OTP enabled");
      refreshUser();
    },
    onError: (e: Error) => {
      setError(
        e instanceof ApiError ? e.message : "Failed to enable email OTP"
      );
    },
  });

  const disableOTPEmail = useMutation({
    mutationFn: () => api.mfa.disableOTPEmail(),
    onSuccess: () => {
      setSuccess("Email OTP disabled");
      refreshUser();
    },
    onError: (e: Error) => {
      setError(
        e instanceof ApiError ? e.message : "Failed to disable email OTP"
      );
    },
  });

  // OTP SMS
  const enableOTPSMS = useMutation({
    mutationFn: () => api.mfa.enableOTPSMS(),
    onSuccess: () => {
      setSuccess("SMS OTP enabled");
      refreshUser();
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Failed to enable SMS OTP");
    },
  });

  const disableOTPSMS = useMutation({
    mutationFn: () => api.mfa.disableOTPSMS(),
    onSuccess: () => {
      setSuccess("SMS OTP disabled");
      refreshUser();
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Failed to disable SMS OTP");
    },
  });

  // Backup codes
  const generateCodes = useMutation({
    mutationFn: () => api.mfa.generateRecoveryCodes(),
    onSuccess: (data) => {
      setBackupCodes(data.codes);
      setShowCodesModal(true);
      clearMessages();
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Failed to generate backup codes");
    },
  });

  const removeCodes = useMutation({
    mutationFn: () => api.mfa.removeRecoveryCodes(),
    onSuccess: () => {
      setSuccess("Backup codes removed");
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? e.message : "Failed to remove backup codes");
    },
  });

  const handleCopyAll = () => {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setSuccess("Backup codes copied to clipboard");
  };

  const handleDownload = () => {
    if (!backupCodes) return;
    const content = [
      "OrbisPM - Account Backup Codes",
      "================================",
      "Keep these codes in a safe place. Each code can only be used once.",
      "",
      ...backupCodes,
      "",
      `Generated: ${new Date().toLocaleString()}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orbispm-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Security Settings"
        description="Manage your account security and multi-factor authentication"
      />

      {error && (
        <div className="alert alert-error mb-4 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success mb-4 text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>{success}</span>
        </div>
      )}

      {/* MFA Status Overview */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-base">Multi-Factor Authentication</h3>
          <span
            className={`badge ${anyMFAEnabled ? "badge-success" : "badge-warning"} badge-sm ml-auto`}
          >
            {anyMFAEnabled ? "Enabled" : "Not Enabled"}
          </span>
        </div>
        <p className="text-sm text-base-content/60 mb-6">
          Add an extra layer of security to your account. When MFA is enabled,
          you&apos;ll need to provide a second verification code during login.
        </p>

        {/* TOTP Authenticator App */}
        <div className="border border-base-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-info" />
              <div>
                <h4 className="font-medium text-sm">Authenticator App (TOTP)</h4>
                <p className="text-xs text-base-content/50">
                  Use Google Authenticator, Authy, or similar app
                </p>
              </div>
              {totpEnabled && (
                <span className="badge badge-success badge-xs">Active</span>
              )}
            </div>
            {!totpSetup && (
              <div className="flex gap-2">
                {totpEnabled ? (
                  <Button
                    size="sm"
                    variant="error"
                    onClick={() => {
                      clearMessages();
                      removeTOTP.mutate();
                    }}
                    loading={removeTOTP.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      clearMessages();
                      registerTOTP.mutate();
                    }}
                    loading={registerTOTP.isPending}
                  >
                    <Key className="w-4 h-4" />
                    Setup
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* TOTP Setup Flow */}
          {totpSetup && (
            <div className="mt-4 border-t border-base-200 pt-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">
                    1. Scan this QR code with your authenticator app:
                  </p>
                  <div className="bg-white p-4 rounded-lg inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpSetup.uri)}`}
                      alt="TOTP QR Code"
                      width={200}
                      height={200}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">
                    2. Or enter the secret manually:
                  </p>
                  <code className="text-xs bg-base-200 p-2 rounded block break-all select-all">
                    {totpSetup.secret}
                  </code>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">
                    3. Enter the 6-digit code from your app to verify:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="000000"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) =>
                        setTotpCode(e.target.value.replace(/\D/g, ""))
                      }
                      className="w-32"
                    />
                    <Button
                      onClick={() => {
                        clearMessages();
                        verifyTOTP.mutate(totpCode);
                      }}
                      loading={verifyTOTP.isPending}
                      disabled={totpCode.length !== 6}
                    >
                      Verify &amp; Enable
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTotpSetup(null);
                        setTotpCode("");
                        clearMessages();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Email OTP */}
        <div className="border border-base-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-success" />
              <div>
                <h4 className="font-medium text-sm">Email OTP</h4>
                <p className="text-xs text-base-content/50">
                  Receive a one-time code via email ({user?.email})
                </p>
              </div>
              {otpEmailEnabled && (
                <span className="badge badge-success badge-xs">Active</span>
              )}
            </div>
            <div className="flex gap-2">
              {otpEmailEnabled ? (
                <Button
                  size="sm"
                  variant="error"
                  onClick={() => {
                    clearMessages();
                    disableOTPEmail.mutate();
                  }}
                  loading={disableOTPEmail.isPending}
                >
                  Disable
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    clearMessages();
                    enableOTPEmail.mutate();
                  }}
                  loading={enableOTPEmail.isPending}
                >
                  Enable
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* SMS OTP */}
        {user?.phone ? (
          <div className="border border-base-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-warning" />
                <div>
                  <h4 className="font-medium text-sm">SMS OTP</h4>
                  <p className="text-xs text-base-content/50">
                    Receive a code via SMS to {user.phone}
                  </p>
                </div>
                {otpSMSEnabled && (
                  <span className="badge badge-success badge-xs">Active</span>
                )}
              </div>
              <div className="flex gap-2">
                {otpSMSEnabled ? (
                  <Button
                    size="sm"
                    variant="error"
                    onClick={() => {
                      clearMessages();
                      disableOTPSMS.mutate();
                    }}
                    loading={disableOTPSMS.isPending}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      clearMessages();
                      enableOTPSMS.mutate();
                    }}
                    loading={enableOTPSMS.isPending}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-base-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-base-content/30" />
              <div>
                <h4 className="font-medium text-sm text-base-content/50">
                  SMS OTP
                </h4>
                <p className="text-xs text-base-content/40">
                  Add a phone number in your profile to enable SMS OTP
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Backup Codes — only shown when at least one MFA factor is active */}
      {anyMFAEnabled && (
        <Card className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">Backup Codes</h3>
          </div>
          <p className="text-sm text-base-content/60 mb-4">
            Backup codes let you sign in if you lose access to your MFA device.
            Each code can only be used once. Store them somewhere safe.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => { clearMessages(); generateCodes.mutate(); }}
              loading={generateCodes.isPending}
            >
              <RefreshCw className="w-4 h-4" />
              Generate New Codes
            </Button>
            <Button
              size="sm"
              variant="error"
              onClick={() => { clearMessages(); removeCodes.mutate(); }}
              loading={removeCodes.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Remove Backup Codes
            </Button>
          </div>

          {/* Backup codes modal */}
          {showCodesModal && backupCodes && (
            <div className="modal modal-open">
              <div className="modal-box max-w-md">
                <h3 className="font-bold text-lg mb-2">Your Backup Codes</h3>
                <div className="alert alert-warning mb-4 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Save these codes now — they will not be shown again.
                    Each code can only be used once.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {backupCodes.map((code, i) => (
                    <code
                      key={i}
                      className="bg-base-200 rounded px-3 py-1.5 text-sm font-mono text-center select-all"
                    >
                      {code}
                    </code>
                  ))}
                </div>

                <div className="modal-action flex-wrap gap-2 justify-start">
                  <Button size="sm" variant="outline" onClick={handleCopyAll}>
                    <Copy className="w-4 h-4" />
                    Copy All
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownload}>
                    <Download className="w-4 h-4" />
                    Download .txt
                  </Button>
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() => { setShowCodesModal(false); setBackupCodes(null); }}
                  >
                    Done
                  </Button>
                </div>
              </div>
              <div
                className="modal-backdrop"
                onClick={() => { setShowCodesModal(false); setBackupCodes(null); }}
              />
            </div>
          )}
        </Card>
      )}

      {/* Account Info */}
      <Card className="mt-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-base">Account Information</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-base-content/50">User ID</span>
            <p className="font-mono text-xs mt-1 truncate">{user?.id}</p>
          </div>
          <div>
            <span className="text-base-content/50">Email</span>
            <p className="mt-1">{user?.email}</p>
          </div>
          <div>
            <span className="text-base-content/50">MFA Status</span>
            <p className="mt-1">
              <span
                className={`badge ${anyMFAEnabled ? "badge-success" : "badge-warning"} badge-sm`}
              >
                {anyMFAEnabled ? "Active" : "Inactive"}
              </span>
            </p>
          </div>
          <div>
            <span className="text-base-content/50">Account Created</span>
            <p className="mt-1">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString()
                : "—"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
