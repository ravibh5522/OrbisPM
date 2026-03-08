"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import type { OrgRole, Role, Permission } from "@/types/domain";

/*
 * Built-in permission matrix for org-level roles.
 * Mirrors the Go backend's hasBuiltInPermission logic.
 * Kept as fallback when DB roles haven't loaded yet.
 */
const BUILT_IN_PERMISSIONS: Record<string, Record<string, OrgRole[]>> = {
  projects: {
    create: ["owner", "admin", "member"],
    read: ["owner", "admin", "member", "viewer"],
    update: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    manage_members: ["owner", "admin"],
  },
  tasks: {
    create: ["owner", "admin", "member"],
    read: ["owner", "admin", "member", "viewer"],
    update: ["owner", "admin", "member"],
    delete: ["owner", "admin", "member"],
    assign: ["owner", "admin", "member"],
    review: ["owner", "admin", "member"],
    direct_update: ["owner", "admin"],
  },
  teams: {
    create: ["owner", "admin"],
    read: ["owner", "admin", "member", "viewer"],
    update: ["owner", "admin"],
    delete: ["owner", "admin"],
    manage_members: ["owner", "admin"],
  },
  members: {
    invite: ["owner", "admin"],
    read: ["owner", "admin", "member", "viewer"],
    update_role: ["owner", "admin"],
    remove: ["owner", "admin"],
  },
  billing: {
    read: ["owner", "admin", "billing_admin"],
    manage: ["owner", "billing_admin"],
  },
  settings: {
    read: ["owner", "admin"],
    update: ["owner", "admin"],
  },
  change_requests: {
    create: ["owner", "admin", "member"],
    read: ["owner", "admin", "member", "viewer"],
    approve: ["owner", "admin"],
    reject: ["owner", "admin"],
  },
  permissions: {
    read: ["owner", "admin"],
    manage: ["owner", "admin"],
  },
};

function hasBuiltInPermission(role: OrgRole, resource: string, action: string): boolean {
  if (role === "owner") return true;
  const allowed = BUILT_IN_PERMISSIONS[resource]?.[action];
  return allowed ? allowed.includes(role) : false;
}

/** Check if a DB-driven role has a specific permission */
function roleHasPermission(role: Role, resource: string, action: string): boolean {
  if (!role.permissions) return false;
  return role.permissions.some(
    (p: Permission) => p.resource === resource && p.action === action
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
 * Uses DB-driven roles when available, falls back to built-in permission matrix.
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
      // Owner bypasses everything
      if (role === "owner") return true;
      // Admin bypasses most things
      if (role === "admin") {
        if (resource === "org" && (action === "delete" || action === "transfer_ownership")) {
          return false;
        }
        return true;
      }

      // Try DB-driven role first
      const dbRole = roles.find((r: Role) => r.slug === role);
      if (dbRole && dbRole.permissions) {
        return roleHasPermission(dbRole, resource, action);
      }

      // Fallback to built-in permission matrix
      const builtInRoles: OrgRole[] = ["owner", "admin", "member", "viewer", "billing_admin"];
      if (builtInRoles.includes(role as OrgRole)) {
        return hasBuiltInPermission(role as OrgRole, resource, action);
      }

      return false;
    };

    return { can, role, isOwner, isAdmin, isLoading, roles };
  }, [role, membership, rolesLoading, dbRoles]);

  return api_;
}
