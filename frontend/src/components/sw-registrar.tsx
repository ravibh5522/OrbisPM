"use client";

import { useEffect } from "react";

/**
 * Registers the service worker from /sw.js on mount.
 * Skips registration during development to avoid stale cache issues.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed — app works fine without it
    });
  }, []);

  return null;
}
