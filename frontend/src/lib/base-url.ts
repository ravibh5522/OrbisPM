import { headers } from "next/headers";

/**
 * Returns the base URL for the current request.
 * Priority:
 *  1. NEXT_PUBLIC_APP_URL env var (explicit deployment override)
 *  2. x-forwarded-host / host header (auto-detects which domain is being used)
 *  3. Falls back to https://simplifyai.id
 */
export async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || "https";
    if (host) {
      return `${proto}://${host}`;
    }
  } catch {
    // headers() unavailable during static generation — use fallback
  }
  return "https://simplifyai.id";
}
