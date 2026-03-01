"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, orgs, currentOrg } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (orgs.length === 0) {
      router.replace("/onboarding");
    } else if (currentOrg) {
      router.replace(`/${currentOrg.slug}`);
    }
  }, [isAuthenticated, isLoading, orgs, currentOrg, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  );
}
