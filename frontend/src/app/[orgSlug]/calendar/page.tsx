"use client";

import {
  AppliedFilterChips,
  calendarFilterCount,
  CalendarFilterDropdown,
  CalendarView,
  EMPTY_CALENDAR_FILTER,
  getDateRange,
  GroupBySelector,
  isCalendarFilterActive,
  type CalendarFilterState,
  type CalendarGroupBy,
  type CalendarViewMode,
} from "@/components/calendar";
import { usePermissions } from "@/hooks/use-permissions";
import { useOrgPolicies } from "@/hooks/use-policies";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { Task } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";

export default function OrgCalendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id || "";
  const { can } = usePermissions();
  const policies = useOrgPolicies();
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);
  const router = useRouter();

  const [filter, setFilter] = useState<CalendarFilterState>({
    ...EMPTY_CALENDAR_FILTER,
  });
  const [showFilter, setShowFilter] = useState(false);
  const [groupBy, setGroupBy] = useState<CalendarGroupBy>("none");

  // Date range for API fetching
  const initialRange = getDateRange(new Date(), "month");
  const [dateRange, setDateRange] = useState(initialRange);

  useEffect(() => {
    setBreadcrumb({ label: "Calendar", backHref: `/${orgSlug}` });
    return () => setBreadcrumb(null);
  }, [orgSlug, setBreadcrumb]);

  // Fetch all projects
  const { data: projectsData } = useQuery({
    queryKey: ["projects", orgId, policies.canViewAllProjects],
    queryFn: () => api.projects.list(orgId, policies.projectListParams()),
    enabled: !!orgId && !policies.isLoading,
  });

  // Fetch all teams
  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgId, policies.canViewAllTeams],
    queryFn: () => api.teams.list(orgId, policies.teamListParams()),
    enabled: !!orgId && !policies.isLoading,
  });

  // Fetch org members
  const { data: membersData } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });

  const projects = projectsData?.data || [];
  const teams = teamsData?.data || [];
  const members = membersData?.data || [];

  // Build project→team lookup and name maps
  const projectTeamMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) {
      if (p.team_id) m.set(p.id, p.team_id);
      else if (p.team_ids?.[0]) m.set(p.id, p.team_ids[0]);
    }
    return m;
  }, [projects]);

  const projectNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const teamNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.name);
    return m;
  }, [teams]);

  // Determine which projects to fetch tasks from
  const targetProjectIds = useMemo(() => {
    let ids = projects.map((p) => p.id);

    if (filter.projectIds.length > 0) {
      ids = ids.filter((id) => filter.projectIds.includes(id));
    }

    if (filter.teamIds.length > 0) {
      ids = ids.filter((id) => {
        const proj = projects.find((p) => p.id === id);
        if (!proj) return false;
        if (proj.team_id && filter.teamIds.includes(proj.team_id)) return true;
        if (proj.team_ids?.some((tid) => filter.teamIds.includes(tid)))
          return true;
        return false;
      });
    }

    return ids;
  }, [projects, filter.projectIds, filter.teamIds]);

  // Build query params — server-side filtering
  const buildParams = useCallback(
    (projectId: string) => {
      const p = new URLSearchParams();
      p.set("due_date_from", dateRange.from);
      p.set("due_date_to", dateRange.to);
      p.set("limit", "200");

      if (filter.statuses.length > 0) {
        p.set("statuses", filter.statuses.join(","));
      }
      if (filter.priorities.length > 0) {
        p.set("priorities", filter.priorities.join(","));
      }
      if (filter.assigneeIds.length > 0) {
        p.set("assignee_ids", filter.assigneeIds.join(","));
      }
      if (filter.labels.length > 0) {
        p.set("labels", filter.labels.join(","));
      }
      if (filter.parentTaskId) {
        p.set("parent_id", filter.parentTaskId);
      }

      return p.toString();
    },
    [
      dateRange,
      filter.statuses,
      filter.priorities,
      filter.assigneeIds,
      filter.labels,
      filter.parentTaskId,
    ],
  );

  // Fetch tasks from all target projects in parallel
  const { data: allTasksData, isLoading: tasksLoading } = useQuery({
    queryKey: [
      "calendar-tasks",
      orgId,
      targetProjectIds,
      dateRange.from,
      dateRange.to,
      filter.statuses,
      filter.priorities,
      filter.assigneeIds,
      filter.labels,
      filter.parentTaskId,
    ],
    queryFn: async () => {
      if (targetProjectIds.length === 0) return [] as Task[];
      const results = await Promise.all(
        targetProjectIds.map((pid) =>
          api.tasks
            .list(orgId, pid, buildParams(pid))
            .then((r) => r.data || []),
        ),
      );
      return results.flat();
    },
    enabled: !!orgId && projects.length > 0,
  });

  const calendarTasks = allTasksData || [];

  // Map all project members for avatar display
  const allMembers = useMemo(() => {
    return members.map((m) => ({
      project_id: "",
      user_id: m.user_id,
      email: m.email,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      role: m.role,
      joined_at: m.joined_at,
    }));
  }, [members]);

  // Root-level tasks for parent filter
  const rootTasks = useMemo(
    () => calendarTasks.filter((t) => !t.parent_task_id && t.depth === 0),
    [calendarTasks],
  );

  const handleRangeChange = useCallback(
    (from: string, _to: string, _mode: CalendarViewMode) => {
      // Always fetch the full month grid range so week/day views
      // still have all tasks loaded (avoids blank day view bug).
      const midDate = new Date(from);
      const monthRange = getDateRange(midDate, "month");
      setDateRange(monthRange);
    },
    [],
  );

  const handleTaskClick = useCallback(
    (task: Task) => {
      if (currentOrg) {
        router.push(
          `/${currentOrg.slug}/projects/${task.project_id}?task=${task.id}`,
        );
      }
    },
    [currentOrg, router],
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-base-100">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 pb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Calendar</h1>
          {calendarTasks.length > 0 && (
            <span className="badge badge-ghost badge-sm">
              {calendarTasks.length} task{calendarTasks.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Group-By selector */}
          <GroupBySelector value={groupBy} onChange={setGroupBy} />

          {/* Filter button */}
          <div className="relative">
            <button
              className={cn(
                "btn btn-sm gap-1",
                isCalendarFilterActive(filter) ? "btn-primary" : "btn-ghost",
              )}
              onClick={() => setShowFilter((p) => !p)}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {isCalendarFilterActive(filter) && (
                <span className="badge badge-xs badge-neutral">
                  {calendarFilterCount(filter)}
                </span>
              )}
            </button>
            {showFilter && (
              <>
                {/* Invisible backdrop to intercept clicks outside the filter panel */}
                <div
                  className="fixed inset-0 z-[99]"
                  onClick={() => setShowFilter(false)}
                />
                <CalendarFilterDropdown
                  filter={filter}
                  projects={projects}
                  teams={teams}
                  members={members}
                  tasks={calendarTasks}
                  onChange={setFilter}
                  onClose={() => setShowFilter(false)}
                  groupBy={groupBy}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Applied filter chips */}
      {isCalendarFilterActive(filter) && (
        <AppliedFilterChips
          filter={filter}
          projects={projects}
          teams={teams}
          members={members}
          parentTasks={rootTasks}
          onChange={setFilter}
        />
      )}

      {/* Calendar body */}
      <div className="flex-1 min-h-0">
        <CalendarView
          tasks={calendarTasks}
          members={allMembers}
          isLoading={tasksLoading}
          onTaskClick={handleTaskClick}
          onRangeChange={handleRangeChange}
          groupBy={groupBy}
          projectNames={projectNames}
          teamNames={teamNames}
          projectTeamMap={projectTeamMap}
        />
      </div>
    </div>
  );
}
