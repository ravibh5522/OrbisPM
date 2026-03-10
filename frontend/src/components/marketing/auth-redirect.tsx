"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export function AuthRedirect() {
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

  return null;
}
