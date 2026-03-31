"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import type { ReactNode } from "react";

/* ═══════════════════════════════════════════════════════
   PermissionGate — wraps content behind a permission check
   ═══════════════════════════════════════════════════════ */

interface PermissionGateProps {
  /** Resource to check, e.g. "projects", "tasks", "settings" */
  resource: string;
  /** Action to check, e.g. "create", "update", "delete" */
  action: string;
  /** Content to render when permission is granted */
  children: ReactNode;
  /** Fallback to render when permission is denied (default: null) */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on the current user's permissions.
 *
 * Example:
 * ```tsx
 * <PermissionGate resource="projects" action="create">
 *   <Button>New Project</Button>
 * </PermissionGate>
 * ```
 */
export function PermissionGate({ resource, action, children, fallback = null }: PermissionGateProps) {
  const { can, isLoading } = usePermissions();

  if (isLoading) return null;
  if (!can(resource, action)) return <>{fallback}</>;
  return <>{children}</>;
}

/* ═══════════════════════════════════════════════════════
   RequireAdmin — page-level guard for admin/owner pages
   ═══════════════════════════════════════════════════════ */

interface RequireAdminProps {
  children: ReactNode;
  /** Fallback for non-admin users */
  fallback?: ReactNode;
}

export function RequireAdmin({ children, fallback }: RequireAdminProps) {
  const { isAdmin, isLoading } = usePermissions();

  if (isLoading) return null;
  if (!isAdmin) {
    return (
      <>
        {fallback || (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Access Denied</h2>
              <p className="text-base-content/60">You don&apos;t have permission to view this page.</p>
            </div>
          </div>
        )}
      </>
    );
  }
  return <>{children}</>;
}

/* ═══════════════════════════════════════════════════════
   ProjectPermissionGate — wraps content behind a project-level permission check
   ═══════════════════════════════════════════════════════ */

interface ProjectPermissionGateProps {
  projectId: string | undefined;
  resource: string;
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function ProjectPermissionGate({ projectId, resource, action, children, fallback = null }: ProjectPermissionGateProps) {
  const { can, isLoading } = useProjectPermissions(projectId);
  const orgPerms = usePermissions();

  if (isLoading || orgPerms.isLoading) return null;
  // Org owner/admin always has access
  if (orgPerms.isOwner || orgPerms.isAdmin) return <>{children}</>;
  if (!can(resource, action)) return <>{fallback}</>;
  return <>{children}</>;
}
