"use client";

import { api } from "@/lib/api";
import type { ChannelRolePermissions, ChatMemberRole } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

export interface ChannelPermissionsApi {
  /** Check if the current user can perform resource:action in this channel. */
  can: (resource: string, action: string) => boolean;
  /** The user's role in the current channel. */
  role: ChatMemberRole | null;
  /** Convenience: user is owner. */
  isOwner: boolean;
  /** Convenience: user is owner or admin. */
  isAdminOrAbove: boolean;
  /** Convenience: user is moderator or above. */
  isModeratorOrAbove: boolean;
  /** True while loading. */
  isLoading: boolean;
}

/** Role hierarchy ranks (higher = more power). */
const ROLE_RANK: Record<ChatMemberRole, number> = {
  owner: 50,
  admin: 40,
  moderator: 30,
  member: 20,
  viewer: 10,
};

/** Returns a sorted list of all assignable roles (below the caller's rank). */
export function getAssignableRoles(
  callerRole: ChatMemberRole,
): ChatMemberRole[] {
  const callerRank = ROLE_RANK[callerRole] ?? 0;
  return (
    ["admin", "moderator", "member", "viewer"] as ChatMemberRole[]
  ).filter((r) => ROLE_RANK[r] < callerRank);
}

/** Check if callerRole can manage targetRole. */
export function canManageRole(
  callerRole: ChatMemberRole,
  targetRole: ChatMemberRole,
): boolean {
  return (ROLE_RANK[callerRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0);
}

/**
 * Hook that fetches and exposes RBAC permissions for a specific channel.
 * Uses the /chat/channels/{channelId}/my-permissions endpoint.
 */
export function useChannelPermissions(
  channelId: string | null,
): ChannelPermissionsApi {
  const { data, isLoading } = useQuery<ChannelRolePermissions>({
    queryKey: ["channel-permissions", channelId],
    queryFn: () => api.chat.roles.myPermissions(channelId!),
    enabled: !!channelId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const permissionSet = useMemo(() => {
    if (!data?.permissions) return new Set<string>();
    return new Set(data.permissions.map((p) => `${p.resource}:${p.action}`));
  }, [data]);

  const can = useCallback(
    (resource: string, action: string) => {
      if (!data) return false;
      // Owner has all permissions
      if (data.role === "owner") return true;
      return permissionSet.has(`${resource}:${action}`);
    },
    [data, permissionSet],
  );

  const role = data?.role ?? null;

  return {
    can,
    role,
    isOwner: role === "owner",
    isAdminOrAbove: role === "owner" || role === "admin",
    isModeratorOrAbove:
      role === "owner" || role === "admin" || role === "moderator",
    isLoading,
  };
}
