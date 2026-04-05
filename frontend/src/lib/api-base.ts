/**
 * Client-side API base URL constant.
 * Single source of truth — import this instead of defining API_BASE inline.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
