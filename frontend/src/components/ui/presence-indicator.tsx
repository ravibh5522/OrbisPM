"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/shared";
import { Eye } from "lucide-react";
import { formatRelative } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════
   Presence Indicator Component
   ─────────────────────────────────────────────────────────
   Shows who else is viewing a resource (task or project).
   Sends heartbeats every 30 seconds to maintain presence.
   ═══════════════════════════════════════════════════════ */

interface PresenceIndicatorProps {
  orgId: string;
  resourceType: "task" | "project";
  resourceId: string;
  currentUserId: string;
  currentUserName?: string;
  currentUserAvatar?: string;
}

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export function PresenceIndicator({
  orgId,
  resourceType,
  resourceId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
}: PresenceIndicatorProps) {
  const _qc = useQueryClient();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isActive, setIsActive] = useState(true);

  // Fetch current presence
  const { data: presenceData } = useQuery({
    queryKey: ["presence", orgId, resourceType, resourceId],
    queryFn: () => api.presence.get(orgId, resourceType, resourceId),
    refetchInterval: 15_000, // Refresh every 15 seconds
    enabled: isActive,
  });

  // Filter out current user
  const otherUsers = (presenceData || []).filter(
    (u) => u.user_id !== currentUserId
  );

  // Send heartbeats
  useEffect(() => {
    if (!orgId || !resourceId) return;

    const sendHeartbeat = async () => {
      try {
        await api.presence.heartbeat(orgId, {
          resource_type: resourceType,
          resource_id: resourceId,
          display_name: currentUserName,
          avatar_url: currentUserAvatar,
        });
      } catch (err) {
        console.error("Failed to send presence heartbeat:", err);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Handle visibility change (pause when tab is hidden)
    const handleVisibility = () => {
      if (document.hidden) {
        setIsActive(false);
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      } else {
        setIsActive(true);
        sendHeartbeat();
        heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [orgId, resourceType, resourceId, currentUserName, currentUserAvatar]);

  // Invalidate presence when receiving SSE events
  useEffect(() => {
    // This could be enhanced to listen to SSE events for immediate updates
    // For now, polling every 15s is sufficient
  }, []);

  if (otherUsers.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Eye className="w-4 h-4 text-primary animate-pulse" />
      <div className="flex items-center -space-x-2">
        {otherUsers.slice(0, 5).map((user) => (
          <div
            key={user.user_id}
            className="tooltip"
            data-tip={`${user.display_name || "User"} - viewing since ${formatRelative(user.viewing_since)}`}
          >
            <Avatar
              src={user.avatar_url}
              name={user.display_name || "User"}
              size="sm"
              className="border-2 border-base-100"
            />
          </div>
        ))}
        {otherUsers.length > 5 && (
          <div className="w-7 h-7 rounded-full bg-base-300 flex items-center justify-center text-xs font-medium border-2 border-base-100">
            +{otherUsers.length - 5}
          </div>
        )}
      </div>
      <span className="text-xs text-base-content/60">
        {otherUsers.length === 1
          ? "1 person viewing"
          : `${otherUsers.length} people viewing`}
      </span>
    </div>
  );
}

/* ── Compact presence badge (for list views) ── */
export function PresenceBadge({
  orgId,
  resourceType,
  resourceId,
  currentUserId,
}: {
  orgId: string;
  resourceType: "task" | "project";
  resourceId: string;
  currentUserId: string;
}) {
  const { data: presenceData } = useQuery({
    queryKey: ["presence", orgId, resourceType, resourceId],
    queryFn: () => api.presence.get(orgId, resourceType, resourceId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const otherUsers = (presenceData || []).filter(
    (u) => u.user_id !== currentUserId
  );

  if (otherUsers.length === 0) {
    return null;
  }

  return (
    <div
      className="tooltip tooltip-top"
      data-tip={`${otherUsers.length} ${otherUsers.length === 1 ? "person" : "people"} viewing`}
    >
      <div className="badge badge-sm badge-primary gap-1">
        <Eye className="w-3 h-3" />
        {otherUsers.length}
      </div>
    </div>
  );
}
