import { ApiError } from "@/lib/api";

// Maps lowercase substrings found in error descriptions → friendly messages
const DESC_MAP: [string, string][] = [
  // Password
  ["password is invalid",             "Incorrect password. Please try again."],
  ["password too weak",               "Password is too weak. Use letters, numbers and symbols."],
  ["password too short",              "Password must be at least 8 characters."],
  ["password does not meet",          "Password does not meet the complexity requirements."],
  ["passwords do not match",          "Passwords do not match."],
  ["password cannot be empty",        "Password is required."],

  // Email / user
  ["user not found",                  "No account found with that email address."],
  ["user does not exist",             "No account found with that email address."],
  ["email already exists",            "An account with this email already exists."],
  ["email already registered",        "An account with this email already exists."],
  ["already exists",                  "An account with this email already exists."],
  ["invalid email",                   "Please enter a valid email address."],
  ["email is invalid",                "Please enter a valid email address."],
  ["email not verified",              "Please verify your email address before signing in."],

  // Credentials
  ["invalid credentials",             "Invalid email or password."],
  ["invalid username or password",    "Invalid email or password."],
  ["invalid login",                   "Invalid email or password."],
  ["invalid argument",                "Invalid input. Please check your details."],

  // Auth / session
  ["unauthenticated",                 "Your session has expired. Please sign in again."],
  ["unauthorized",                    "Your session has expired. Please sign in again."],
  ["session expired",                 "Session expired. Please sign in again."],
  ["token expired",                   "Your session has expired. Please sign in again."],
  ["invalid token",                   "Invalid session. Please sign in again."],
  ["access denied",                   "You don't have permission to do this."],
  ["permission denied",               "You don't have permission to do this."],

  // MFA
  ["invalid otp",                     "Verification code is incorrect. Please try again."],
  ["otp expired",                     "Verification code has expired. Request a new one."],
  ["otp not found",                   "Verification code is incorrect or expired."],
  ["mfa required",                    "Two-factor authentication is required."],
  ["mfa code",                        "Invalid two-factor code. Please try again."],

  // Rate limiting
  ["too many requests",               "Too many attempts. Please wait a moment and try again."],
  ["rate limit",                      "Too many attempts. Please wait a moment and try again."],
  ["blocked",                         "This action has been temporarily blocked. Try again later."],

  // Account state
  ["account locked",                  "Your account has been locked. Please contact support."],
  ["account disabled",                "Your account has been disabled. Please contact support."],
  ["account not found",               "No account found with that email address."],
  ["not active",                      "Your account is not active. Please verify your email."],
  ["deactivated",                     "Your account has been deactivated. Please contact support."],

  // Server / network
  ["internal",                        "A server error occurred. Please try again."],
  ["unavailable",                     "Service is temporarily unavailable. Please try again shortly."],
  ["deadline exceeded",               "The request timed out. Please try again."],
  ["unimplemented",                   "This feature is not available yet."],
];

/** Match the first keyword found in `desc` and return its friendly message */
function matchDesc(desc: string): string | null {
  const lower = desc.toLowerCase();
  for (const [key, friendly] of DESC_MAP) {
    if (lower.includes(key)) return friendly;
  }
  return null;
}

/** Fallback HTTP-status-based message */
function httpStatusMessage(status: number): string {
  switch (status) {
    case 400: return "Invalid request. Please check your input.";
    case 401: return "Incorrect email or password.";
    case 403: return "You don't have permission to do this.";
    case 404: return "No account found with that email address.";
    case 409: return "An account with this email already exists.";
    case 422: return "Please check your input and try again.";
    case 429: return "Too many attempts. Please wait a moment and try again.";
    case 500: return "A server error occurred. Please try again.";
    case 503: return "Service temporarily unavailable. Please try again shortly.";
    default:  return "Something went wrong. Please try again.";
  }
}

/**
 * Converts any auth error (ApiError, gRPC error strings, plain Error) into a
 * short, user-friendly message suitable for display in the UI.
 *
 * Handles the backend format:
 *   "rpc error: code = InvalidArgument desc = Password is invalid (COMMAND-3M0fs) (code=400)"
 */
export function parseAuthError(err: unknown): string {
  // Network / offline errors (TypeError from fetch)
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("load failed") ||
      msg.includes("fetch")
    ) {
      return typeof navigator !== "undefined" && !navigator.onLine
        ? "You appear to be offline. Please check your internet connection."
        : "Unable to reach the server. Please check your connection and try again.";
    }
  }

  if (err instanceof ApiError) {
    const raw = err.message ?? "";

    // 1. gRPC format: extract everything after "desc = "
    const rpcMatch = raw.match(
      /\bdesc\s*=\s*(.+?)(?:\s*\([A-Z][A-Z0-9]*-[A-Za-z0-9]+\))*(?:\s*\(code=\d+\))?\s*$/i,
    );
    if (rpcMatch) {
      const desc = rpcMatch[1].trim();
      const mapped = matchDesc(desc);
      if (mapped) return mapped;
      // Strip internal Zitadel command codes like (COMMAND-3M0fs) and show cleaned desc
      const cleaned = desc.replace(/\s*\([A-Z][A-Z0-9]*-[A-Za-z0-9]+\)/g, "").trim();
      if (cleaned.length > 0 && cleaned.length < 150) return cleaned;
    }

    // 2. Try matching raw message directly
    const mapped = matchDesc(raw);
    if (mapped) return mapped;

    // 3. If raw is clean (short, no rpc prefix), display it
    if (!raw.toLowerCase().includes("rpc error") && raw.length < 150) return raw;

    // 4. Fallback: HTTP status
    return httpStatusMessage(err.status);
  }

  if (err instanceof Error) {
    const mapped = matchDesc(err.message);
    if (mapped) return mapped;
    if (err.message.length < 150 && !err.message.toLowerCase().includes("rpc error")) {
      return err.message;
    }
  }

  return "Something went wrong. Please try again.";
}
