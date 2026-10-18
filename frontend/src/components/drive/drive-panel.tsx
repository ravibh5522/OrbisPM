"use client";

import { DriveBrowser } from "@/components/drive/drive-browser";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { DriveScope } from "@/types/domain";
import { ExternalLink, HardDrive, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function spaceFromPath(
  pathname: string,
): { scope: DriveScope; scopeId: string } | null {
  const m = pathname.match(/^\/[^/]+\/(teams|projects)\/([^/?#]+)/);
  if (!m) return null;
  return { scope: m[1] === "teams" ? "team" : "project", scopeId: m[2] };
}

/** Right-hand Drive drawer; stays open across navigation so files can be dropped from any page. */
export function DrivePanel() {
  const open = useUIStore((s) => s.drivePanelOpen);
  const setOpen = useUIStore((s) => s.setDrivePanelOpen);
  const orgSlug = useAuthStore((s) => s.currentOrg?.slug) || "";
  const pathname = usePathname();

  // Each open starts a fresh browser so it defaults to the team/project page
  // it was opened from; until the first open nothing is fetched.
  const [session, setSession] = useState(0);
  const [initial, setInitial] = useState<ReturnType<typeof spaceFromPath>>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSession((s) => s + 1);
      setInitial(spaceFromPath(pathname));
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Let an open dialog, preview or menu handle Escape first.
      if (document.querySelector('.modal-open, [aria-modal="true"], [role="menu"]'))
        return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <aside
      aria-label="Drive"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-base-100 shadow-2xl transition-transform duration-300 ease-in-out",
        "lg:inset-auto lg:top-14 lg:right-0 lg:bottom-0 lg:z-40 lg:w-[400px] lg:border-l lg:border-base-200",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-base-200 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Drive</h2>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          aria-label="Close Drive"
          onClick={() => setOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {session > 0 && (
          <DriveBrowser
            key={session}
            density="panel"
            scope={initial?.scope}
            scopeId={initial?.scopeId}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-base-200 p-2">
        <Link
          href={`/${orgSlug}/drive`}
          className="btn btn-ghost btn-sm w-full gap-1.5"
          onClick={() => setOpen(false)}
        >
          Open full page <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </aside>
  );
}
