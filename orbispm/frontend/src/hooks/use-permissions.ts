"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import type { OrgRole, CustomRole } from "@/types/domain";

/*
 * Built-in permission matrix for org-level roles.
 * Mirrors the Go backend's hasBuiltInPermission logic.
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
};

function hasBuiltInPermission(role: OrgRole, resource: string, action: string): boolean {
  if (role === "owner") return true;
  const allowed = BUILT_IN_PERMISSIONS[resource]?.[action];
  return allowed ? allowed.includes(role) : false;
}

function hasCustomRolePermission(
  customRoles: CustomRole[],
  roleName: string,
  resource: string,
  action: string
): boolean {
  const role = customRoles.find((r) => r.name === roleName);
  if (!role) return false;
  const perms = role.permissions as Record<string, Record<string, boolean>> | undefined;
  return perms?.[resource]?.[action] === true;
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
}

/**
 * usePermissions - provides permission checking for the current user in the current org.
 * Checks built-in org role permissions first, then falls back to custom role permissions.
 */
export function usePermissions(): PermissionsApi {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const membership = useAuthStore((s) => s.currentMembership);

  const { data: customRoles, isLoading: rolesLoading } = useQuery({
    queryKey: ["custom-roles", currentOrg?.id],
    queryFn: () => api.customRoles.list(currentOrg!.id),
    enabled: !!currentOrg,
    staleTime: 60_000,
  });

  const role = membership?.role ?? null;

  const api_ = useMemo<PermissionsApi>(() => {
    const isOwner = role === "owner";
    const isAdmin = role === "owner" || role === "admin";
    const isLoading = !membership || rolesLoading;

    const can = (resource: string, action: string): boolean => {
      if (!role) return false;
      // Owner bypasses everything
      if (role === "owner") return true;
      // Check built-in roles first
      const builtInRoles: OrgRole[] = ["owner", "admin", "member", "viewer", "billing_admin"];
      if (builtInRoles.includes(role as OrgRole)) {
        return hasBuiltInPermission(role as OrgRole, resource, action);
      }
      // Custom role — check permissions JSON
      return hasCustomRolePermission(customRoles?.data || [], role, resource, action);
    };

    return { can, role, isOwner, isAdmin, isLoading };
  }, [role, membership, rolesLoading, customRoles]);

  return api_;
}
