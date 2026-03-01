"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

// Client-side auth guard hook
export function useRequireAuth() {
  const router = useRouter();
  const { isAuthenticated, isLoading, orgs } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    // After auth, if no orgs, redirect to onboarding
    if (orgs.length === 0) {
      router.replace("/onboarding");
    }
  }, [isAuthenticated, isLoading, orgs, router]);

  return { isAuthenticated, isLoading, hasOrgs: orgs.length > 0 };
}

// Hook for auth pages (login/signup) — redirect away if already logged in
export function useRedirectIfAuth() {
  const router = useRouter();
  const { isAuthenticated, isLoading, orgs, currentOrg } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      if (orgs.length === 0) {
        router.replace("/onboarding");
      } else if (currentOrg) {
        router.replace(`/${currentOrg.slug}`);
      }
    }
  }, [isAuthenticated, isLoading, orgs, currentOrg, router]);
}
