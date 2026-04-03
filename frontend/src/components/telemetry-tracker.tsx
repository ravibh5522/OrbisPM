"use client";

import { initTelemetry, stopTelemetry, trackPageView } from "@/lib/telemetry";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Invisible component that initializes telemetry and tracks page views
 * on every Next.js route change. Mount once in providers.tsx.
 */
export function TelemetryTracker() {
  const pathname = usePathname();
  const initialized = useRef(false);

  // Initialize telemetry once
  useEffect(() => {
    if (!initialized.current) {
      initTelemetry();
      initialized.current = true;
    }
    return () => {
      stopTelemetry();
    };
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (pathname) {
      trackPageView(pathname);
    }
  }, [pathname]);

  return null;
}
