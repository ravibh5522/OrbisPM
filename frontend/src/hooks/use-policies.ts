"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import {
  computeOrgPolicies,
  computeProjectPolicies,
  computeTeamPolicies,
  type OrgPolicies,
  type ProjectPolicies,
  type TeamPolicies,
} from "@/lib/policies";
import { useMemo } from "react";

/**
 * useOrgPolicies — returns org-scoped policy decisions.
 *
 * Consumers get simple booleans + auto-filter helpers instead of
 * checking raw permissions themselves.
 *
 * @example
 * const { canCreateProject, projectListParams } = useOrgPolicies();
 * const { data } = useQuery({
 *   queryFn: () => api.projects.list(orgId, { ...projectListParams(), limit: 20 }),
 * });
 */
export function useOrgPolicies(): OrgPolicies {
  const { can, role, isLoading } = usePermissions();
  return useMemo(
    () => computeOrgPolicies(role, can, isLoading),
    [can, role, isLoading],
  );
}

/**
 * useProjectPolicies — returns project-scoped policy decisions.
 */
export function useProjectPolicies(
  projectId: string | undefined,
): ProjectPolicies {
  const { can, role, isLoading } = useProjectPermissions(projectId);
  const orgPerms = usePermissions();

  return useMemo(() => {
    // Org owner/admin always gets full access at project level
    if (orgPerms.isOwner || orgPerms.isAdmin) {
      const fullCan = () => true;
      return computeProjectPolicies(
        role ?? orgPerms.role,
        fullCan,
        isLoading || orgPerms.isLoading,
      );
    }
    return computeProjectPolicies(role, can, isLoading);
  }, [
    can,
    role,
    isLoading,
    orgPerms.isOwner,
    orgPerms.isAdmin,
    orgPerms.role,
    orgPerms.isLoading,
  ]);
}

/**
 * useTeamPolicies — returns team-scoped policy decisions.
 */
export function useTeamPolicies(teamId: string | undefined): TeamPolicies {
  const { can, role, isLoading } = useTeamPermissions(teamId);
  const orgPerms = usePermissions();

  return useMemo(() => {
    if (orgPerms.isOwner || orgPerms.isAdmin) {
      const fullCan = () => true;
      return computeTeamPolicies(
        role ?? orgPerms.role,
        fullCan,
        isLoading || orgPerms.isLoading,
      );
    }
    return computeTeamPolicies(role, can, isLoading);
  }, [
    can,
    role,
    isLoading,
    orgPerms.isOwner,
    orgPerms.isAdmin,
    orgPerms.role,
    orgPerms.isLoading,
  ]);
}
