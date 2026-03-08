"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import LandingPage from "./(marketing)/landing/page";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, orgs, currentOrg } = useAuthStore();
  const [showLanding, setShowLanding] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setShowLanding(true);
    } else if (orgs.length === 0) {
      router.replace("/onboarding");
    } else if (currentOrg) {
      router.replace(`/${currentOrg.slug}`);
    }
  }, [isAuthenticated, isLoading, orgs, currentOrg, router]);

  if (showLanding) {
    return <LandingPage />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  );
}
