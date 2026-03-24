"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface ProjectPermissionsApi {
  can: (resource: string, action: string) => boolean;
  role: string | null;
  isLead: boolean;
  isLoading: boolean;
}

/**
 * useProjectPermissions — provides permission checking for the current user
 * within a specific project. Calls the /my-permissions endpoint.
 */
export function useProjectPermissions(projectId: string | undefined): ProjectPermissionsApi {
  const currentOrg = useAuthStore((s) => s.currentOrg);

  const { data, isLoading } = useQuery({
    queryKey: ["project-permissions", currentOrg?.id, projectId],
    queryFn: () => api.projects.myPermissions(currentOrg!.id, projectId!),
    enabled: !!currentOrg && !!projectId,
    staleTime: 30_000,
  });

  return useMemo<ProjectPermissionsApi>(() => {
    const role = data?.role ?? null;
    const perms = data?.permissions ?? [];

    const can = (resource: string, action: string): boolean => {
      if (!role) return false;
      return perms.some((p) => p.resource === resource && p.action === action);
    };

    return {
      can,
      role,
      isLead: role === "lead",
      isLoading: !data || isLoading,
    };
  }, [data, isLoading]);
}
