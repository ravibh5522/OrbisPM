"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface TeamPermissionsApi {
  can: (resource: string, action: string) => boolean;
  role: string | null;
  isLoading: boolean;
}

/**
 * useTeamPermissions — provides permission checking for the current user
 * within a specific team. Calls the /my-permissions endpoint.
 */
export function useTeamPermissions(teamId: string | undefined): TeamPermissionsApi {
  const currentOrg = useAuthStore((s) => s.currentOrg);

  const { data, isLoading } = useQuery({
    queryKey: ["team-permissions", currentOrg?.id, teamId],
    queryFn: () => api.teams.myPermissions(currentOrg!.id, teamId!),
    enabled: !!currentOrg && !!teamId,
    staleTime: 30_000,
  });

  return useMemo<TeamPermissionsApi>(() => {
    const role = data?.role ?? null;
    const perms = data?.permissions ?? [];

    const can = (resource: string, action: string): boolean => {
      if (!role) return false;
      return perms.some((p) => p.resource === resource && p.action === action);
    };

    return {
      can,
      role,
      isLoading: !data || isLoading,
    };
  }, [data, isLoading]);
}
