"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface ScopedPermissionsApi {
  /** Check if user has a specific permission in this scope */
  can: (resource: string, action: string) => boolean;
  /** The user's effective role in this scope */
  role: string | null;
  /** Whether permissions are still loading */
  isLoading: boolean;
  /** Raw granted permission strings (e.g. "tasks.review") */
  permissions: string[];
}

/**
 * useProjectPermissions — checks the current user's permissions in the given project scope.
 * Uses the /my-permissions backend endpoint which applies the full inheritance chain:
 * direct project membership → team membership → org fallthrough.
 */
export function useProjectPermissions(
  projectId: string | undefined | null,
): ScopedPermissionsApi {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["my-permissions", orgId, "project", projectId],
    queryFn: () => api.permissions.myPermissions(orgId!, "project", projectId!),
    enabled: !!orgId && !!projectId,
    staleTime: 30_000,
  });

  return useMemo<ScopedPermissionsApi>(() => {
    const permissions = data?.permissions ?? [];
    const role = data?.role ?? null;
    const isOwnerOrWildcard = permissions.includes("*.*");

    const can = (resource: string, action: string): boolean => {
      if (isOwnerOrWildcard) return true;
      return permissions.includes(`${resource}.${action}`);
    };

    return { can, role, isLoading: isLoading && !!projectId, permissions };
  }, [data, isLoading, projectId]);
}

/**
 * useTeamPermissions — checks the current user's permissions in the given team scope.
 * Uses the /my-permissions backend endpoint.
 */
export function useTeamPermissions(
  teamId: string | undefined | null,
): ScopedPermissionsApi {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["my-permissions", orgId, "team", teamId],
    queryFn: () => api.permissions.myPermissions(orgId!, "team", teamId!),
    enabled: !!orgId && !!teamId,
    staleTime: 30_000,
  });

  return useMemo<ScopedPermissionsApi>(() => {
    const permissions = data?.permissions ?? [];
    const role = data?.role ?? null;
    const isOwnerOrWildcard = permissions.includes("*.*");

    const can = (resource: string, action: string): boolean => {
      if (isOwnerOrWildcard) return true;
      return permissions.includes(`${resource}.${action}`);
    };

    return { can, role, isLoading: isLoading && !!teamId, permissions };
  }, [data, isLoading, teamId]);
}
