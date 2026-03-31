/**
 * Centralized Policy Handler for OrbisPM
 *
 * Single source of truth for all UI access-control decisions.
 * Computes policies from the user's org role + DB-driven permissions
 * and exposes auto-filter params so list pages only show permitted data.
 *
 * Usage:
 *   const policies = useOrgPolicies();
 *   policies.canViewAllTeams      → true for owner/admin
 *   policies.canViewOwnTeams      → true for everyone (non-admin sees only theirs)
 *   policies.viewTeamsScope       → 'all' | 'own'
 *   policies.teamListParams()     → { mine?: string }   (ready for API)
 *
 * Permission inheritance:
 *   If viewTeamsScope === 'own', all team-level policies (canManageMembers, etc.)
 *   apply only within the teams the user can see.
 *   If viewProjectsScope === 'own', all project-level policies apply only within
 *   the projects the user can see (enforced by API list filters automatically).
 */

// ─── Policy Types ────────────────────────────────────────────

/** Org-scoped policy decisions derived from the user's role + permissions. */
export interface OrgPolicies {
  // ── Visibility: Teams ──
  /** Owner/admin can browse every team in the org. */
  canViewAllTeams: boolean;
  /** All authenticated org members can view at least their own teams. */
  canViewOwnTeams: boolean;
  /**
   * 'all'  → user sees every team in the org (admin/owner)
   * 'own'  → user sees only teams they are a member of
   */
  viewTeamsScope: "all" | "own";

  // ── Visibility: Projects ──
  /** Owner/admin can browse every project in the org. */
  canViewAllProjects: boolean;
  /** All authenticated org members can view at least their own projects. */
  canViewOwnProjects: boolean;
  /**
   * 'all'  → user sees every project in the org (admin/owner)
   * 'own'  → user sees only projects they are a member of
   *          — all project-level permissions are scoped to these projects
   */
  viewProjectsScope: "all" | "own";

  // ── Create ──
  canCreateTeam: boolean;
  canCreateProject: boolean;

  // ── Manage ──
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageBilling: boolean;
  canManageSettings: boolean;

  // ── Delete ──
  canDeleteTeam: boolean;
  canDeleteProject: boolean;

  // ── Convenience ──
  isOwner: boolean;
  isAdmin: boolean;
  role: string | null;
  isLoading: boolean;

  /** Raw permission checker for arbitrary resource/action pairs. */
  can: (resource: string, action: string) => boolean;

  // ── Auto-filter helpers ──
  /** Query params to inject into api.teams.list(). */
  teamListParams: () => Record<string, string>;
  /** Query params to inject into api.projects.list(). */
  projectListParams: () => Record<string, string>;
}

/** Project-scoped policy decisions. */
export interface ProjectPolicies {
  canEditTask: boolean;
  canDeleteTask: boolean;
  canCreateTask: boolean;
  canDirectUpdate: boolean;
  canManageMembers: boolean;
  canComment: boolean;
  canAttach: boolean;
  canReview: boolean;
  role: string | null;
  isLoading: boolean;
}

/** Team-scoped policy decisions. */
export interface TeamPolicies {
  canManageMembers: boolean;
  canEditTeam: boolean;
  canDeleteTeam: boolean;
  role: string | null;
  isLoading: boolean;
}

// ─── Compute Functions (pure, no hooks) ──────────────────────

type CanFn = (resource: string, action: string) => boolean;

/**
 * Compute org-level policies from role + permission checker.
 * This is the single place to add new policy rules.
 */
export function computeOrgPolicies(
  role: string | null,
  can: CanFn,
  isLoading: boolean,
): OrgPolicies {
  const isOwner = role === "owner";
  const isAdmin = isOwner || role === "admin";

  // View scope: admin/owner sees all; everyone else sees only their own
  const canViewAllTeams = isAdmin;
  const canViewOwnTeams = !!role; // any org member can view own teams
  const viewTeamsScope: "all" | "own" = canViewAllTeams ? "all" : "own";

  const canViewAllProjects = isAdmin;
  const canViewOwnProjects = !!role; // any org member can view own projects
  const viewProjectsScope: "all" | "own" = canViewAllProjects ? "all" : "own";

  const policies: OrgPolicies = {
    canViewAllTeams,
    canViewOwnTeams,
    viewTeamsScope,

    canViewAllProjects,
    canViewOwnProjects,
    viewProjectsScope,

    canCreateTeam: can("teams", "create"),
    canCreateProject: can("projects", "create"),

    canManageMembers: can("org", "manage_members"),
    canManageRoles: can("roles", "create") || can("roles", "update"),
    canManageBilling: can("billing", "manage"),
    canManageSettings: can("org", "update"),

    canDeleteTeam: isAdmin || can("teams", "delete"),
    canDeleteProject: isAdmin || can("projects", "delete"),

    isOwner,
    isAdmin,
    role,
    isLoading,

    can,

    teamListParams: () =>
      canViewAllTeams ? ({} as Record<string, string>) : { mine: "true" },
    projectListParams: () =>
      canViewAllProjects ? ({} as Record<string, string>) : { mine: "true" },
  };

  return policies;
}

/**
 * Compute project-level policies from role + permission checker.
 */
export function computeProjectPolicies(
  role: string | null,
  can: CanFn,
  isLoading: boolean,
): ProjectPolicies {
  return {
    canEditTask: can("tasks", "update"),
    canDeleteTask: can("tasks", "delete"),
    canCreateTask: can("tasks", "create"),
    canDirectUpdate: can("tasks", "direct_update"),
    canManageMembers: can("members", "manage"),
    canComment: can("comments", "create"),
    canAttach: can("attachments", "create"),
    canReview: can("tasks", "review"),
    role,
    isLoading,
  };
}

/**
 * Compute team-level policies from role + permission checker.
 */
export function computeTeamPolicies(
  role: string | null,
  can: CanFn,
  isLoading: boolean,
): TeamPolicies {
  return {
    canManageMembers: can("members", "manage") || can("team", "manage_members"),
    canEditTeam: can("team", "update"),
    canDeleteTeam: can("team", "delete"),
    role,
    isLoading,
  };
}
