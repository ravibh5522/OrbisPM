"use client";

import { DriveBrowser } from "@/components/drive/drive-browser";
import { PageHeader } from "@/components/ui/shared";
import { useDriveUsage } from "@/hooks/use-drive";
import { formatBytes } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useSearchParams } from "next/navigation";
import { use, useEffect } from "react";

export default function DrivePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const itemId = useSearchParams().get("item") ?? undefined;
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);
  const { data: usage } = useDriveUsage();

  useEffect(() => {
    setBreadcrumb({ label: "Drive", backHref: `/${orgSlug}` });
    return () => setBreadcrumb(null);
  }, [orgSlug, setBreadcrumb]);

  // bytes_limit of -1 means unlimited.
  const limit = usage && usage.bytes_limit >= 0 ? usage.bytes_limit : null;
  const description = !usage
    ? "Files for you, your teams and your projects"
    : limit === null
      ? `${formatBytes(usage.bytes_used)} used`
      : `${formatBytes(usage.bytes_used)} of ${formatBytes(limit)} used`;

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Drive"
        description={description}
        actions={
          usage &&
          limit !== null && (
            <progress
              className="progress progress-primary w-40 h-1.5"
              value={usage.bytes_used}
              max={limit}
              aria-label="Storage used"
            />
          )
        }
      />
      <div className="card flex-1 min-h-0 bg-base-100/36 border border-base-200/55 backdrop-blur-xl card-glass-shadow rounded-2xl overflow-hidden">
        <DriveBrowser key={itemId} density="page" initialItemId={itemId} />
      </div>
    </div>
  );
}
