"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { OrgRole, Permission, Role } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/** Check if a DB-driven role has a specific permission */
function roleHasPermission(
  role: Role,
  resource: string,
  action: string,
): boolean {
  if (!role.permissions) return false;
  return role.permissions.some(
    (p: Permission) => p.resource === resource && p.action === action,
  );
}

export interface PermissionsApi {
  /** Check if user has a specific permission */
  can: (resource: string, action: string) => boolean;
  /** Current org role */
  role: OrgRole | string | null;
  /** Whether user is org owner */
  isOwner: boolean;
  /** Whether user is org admin or higher */
  isAdmin: boolean;
  /** Whether permissions are still loading */
  isLoading: boolean;
  /** All DB-driven roles for the org */
  roles: Role[];
}

/**
 * usePermissions - provides permission checking for the current user in the current org.
 * Uses DB-driven roles exclusively. Owner and admin bypass is determined by the
 * backend role slug — no hardcoded permission matrix.
 */
export function usePermissions(): PermissionsApi {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const membership = useAuthStore((s) => s.currentMembership);

  // Fetch DB-driven org roles with their permissions
  const { data: dbRoles, isLoading: rolesLoading } = useQuery({
    queryKey: ["permissions-roles", currentOrg?.id, "org"],
    queryFn: () => api.permissions.roles.list(currentOrg!.id, "org"),
    enabled: !!currentOrg,
    staleTime: 60_000,
  });

  const role = membership?.role ?? null;

  const api_ = useMemo<PermissionsApi>(() => {
    const isOwner = role === "owner";
    const isAdmin = role === "owner" || role === "admin";
    const isLoading = !membership || rolesLoading;
    const roles = dbRoles || [];

    const can = (resource: string, action: string): boolean => {
      if (!role) return false;
      // Owner bypasses everything (matches backend PermissionResolver)
      if (isOwner) return true;
      // Admin bypasses most things (matches backend PermissionResolver)
      if (isAdmin) {
        if (
          resource === "org" &&
          (action === "delete" || action === "transfer_ownership")
        ) {
          return false;
        }
        return true;
      }

      // While DB roles are still loading, deny access (safe default)
      if (isLoading) return false;

      // Use DB-driven role permissions exclusively
      const dbRole = roles.find((r: Role) => r.slug === role);
      if (dbRole) {
        return roleHasPermission(dbRole, resource, action);
      }

      return false;
    };

    return { can, role, isOwner, isAdmin, isLoading, roles };
  }, [role, membership, rolesLoading, dbRoles]);

  return api_;
}
