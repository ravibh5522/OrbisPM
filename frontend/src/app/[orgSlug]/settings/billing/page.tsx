"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Redirect from old /settings/billing route to the unified settings page
 * with ?tab=billing. Preserves any query params (e.g. ?success=true from Stripe).
 */
export default function BillingRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const segments = pathname.split("/");
    // pathname = /orgSlug/settings/billing → orgSlug is segments[1]
    const orgSlug = segments[1];
    const extra = searchParams.toString();
    const target = `/${orgSlug}/settings?tab=billing${extra ? `&${extra}` : ""}`;
    router.replace(target);
  }, [pathname, searchParams, router]);

  return null;
}
