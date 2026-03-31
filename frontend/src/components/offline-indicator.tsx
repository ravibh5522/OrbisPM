"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Fixed banner at the top of the viewport when the browser goes offline.
 * Shows a "Back online" toast briefly when connectivity returns.
 */
export function OfflineIndicator() {
  const online = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setShowReconnected(false);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [online, wasOffline]);

  if (online && !showReconnected) return null;

  return (
    <div
      className={cn(
        "fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-sm font-medium transition-colors",
        !online
          ? "bg-warning text-warning-content"
          : "bg-success text-success-content",
      )}
    >
      {!online ? (
        <>
          <WifiOff className="w-4 h-4" />
          You&apos;re offline — showing cached data
        </>
      ) : (
        "Back online"
      )}
    </div>
  );
}
