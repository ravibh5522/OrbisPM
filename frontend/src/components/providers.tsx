"use client";

import { OfflineIndicator } from "@/components/offline-indicator";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";
import { TelemetryTracker } from "@/components/telemetry-tracker";
import { ApiError } from "@/lib/api";
import { createIDBPersister } from "@/lib/offline/persister";
import { useAuthStore } from "@/stores/auth-store";
import { applyThemeCustomisation, useUIStore } from "@/stores/ui-store";
import { MutationCache, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";

function AuthInitializer({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

function ThemeInitializer({ children }: { children: ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  const customisation = useUIStore((s) => s.customisation);

  useEffect(() => {
    // Always sync data-theme and CSS vars together so blur/glass effects
    // are never out-of-step with the store state (safety-net for SSR hydration
    // and any code path that updates theme outside of store actions).
    document.documentElement.setAttribute("data-theme", theme);
    applyThemeCustomisation(theme, customisation);
  }, [theme, customisation]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error) => {
            // Don't toast 401s (handled by auth redirect)
            if (error instanceof ApiError && error.status === 401) return;
            const msg =
              error instanceof ApiError
                ? error.message
                : error?.message || "Something went wrong";
            toast.error(msg);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            // 24h gcTime — cached data survives long enough for offline / instant loads
            gcTime: 24 * 60 * 60 * 1000,
            retry: 1,
            // Refetch when user returns to tab — ensures data freshness after inactivity
            refetchOnWindowFocus: "always",
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  const [persister] = useState(() => createIDBPersister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // Keep persisted cache for 24 hours
        maxAge: 24 * 60 * 60 * 1000,
        // Bust cache on new deployments to avoid stale data shapes
        buster: process.env.NEXT_PUBLIC_BUILD_ID || "",
      }}
    >
      <ThemeInitializer>
        <AuthInitializer>{children}</AuthInitializer>
      </ThemeInitializer>
      <OfflineIndicator />
      <ServiceWorkerRegistrar />
      <TelemetryTracker />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          className: "!bg-base-100 !text-base-content !border-base-300",
        }}
      />
    </PersistQueryClientProvider>
  );
}
