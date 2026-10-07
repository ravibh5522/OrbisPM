"use client";

import { Input } from "@/components/ui/form-fields";
import { Card, PageHeader } from "@/components/ui/shared";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { useOrgPolicies } from "@/hooks/use-policies";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { ProjectHealthSummary, TeamAnalytics } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";

const AreaChartWidget = dynamic(
  () =>
    import("@/components/charts/area-chart").then((mod) => ({
      default: mod.AreaChartWidget,
    })),
  { ssr: false },
);

const HealthRing = dynamic(
  () =>
    import("@/components/charts/health-ring").then((mod) => ({
      default: mod.HealthRing,
    })),
  { ssr: false },
);

const BarChartWidget = dynamic(
  () =>
    import("@/components/charts/bar-chart").then((mod) => ({
      default: mod.BarChartWidget,
    })),
  { ssr: false },
);

export default function TeamsPerformancePage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const policies = useOrgPolicies();

  const { data: teams } = useQuery({
    queryKey: ["teams", currentOrg?.id, policies.canViewAllTeams],
    queryFn: () => api.teams.list(currentOrg!.id, policies.teamListParams()),
    enabled: !!currentOrg && !policies.isLoading,
  });

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const teamList = teams?.data || [];
  const activeTeamId = selectedTeamId || teamList[0]?.id;
  const activeTeam = teamList.find((t) => t.id === activeTeamId);

  const filteredTeams = useMemo(() => {
    if (!searchQuery) return teamList;
    const q = searchQuery.toLowerCase();
    return teamList.filter((t) => t.name.toLowerCase().includes(q));
  }, [teamList, searchQuery]);

  const {
    data: analytics,
    isLoading,
    error: analyticsError,
  } = useQuery<TeamAnalytics>({
    queryKey: ["analytics-team", currentOrg?.id, activeTeamId],
    queryFn: () => api.analytics.team(currentOrg!.id, activeTeamId!),
    enabled: !!currentOrg && !!activeTeamId,
    retry: false,
  });
  const analyticsForbidden =
    analyticsError instanceof ApiError && analyticsError.status === 403;

  return (
    <div>
      <PageHeader
        title="Team Performance"
        description="Analytics by team"
        actions={
          <Link
            href={`/${orgSlug}/performance`}
            className="btn btn-sm btn-ghost gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      {/* Team selector */}
      {teamList.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-col gap-2 mb-2">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
              <Input
                type="text"
                placeholder="Search teams..."
                className="input-sm w-full pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <span className="text-xs text-base-content/50">
              {teamList.length} teams
              {activeTeam && (
                <>
                  {" "}
                  — selected: <strong>{activeTeam.name}</strong>
                </>
              )}
            </span>
          </div>
          <VirtualScrollList<(typeof filteredTeams)[0]>
            items={filteredTeams}
            itemHeight={36}
            containerHeight={148}
            renderItem={(t) => (
              <button
                onClick={() => setSelectedTeamId(t.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-base-200 transition-colors",
                  activeTeamId === t.id
                    ? "bg-primary text-primary-content font-medium"
                    : "text-base-content",
                )}
              >
                {t.name}
              </button>
            )}
          />
        </div>
      )}

      {teamList.length === 0 ? (
        <p className="text-sm text-base-content/50 py-12 text-center">
          No teams found
        </p>
      ) : isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 bg-base-200 rounded-xl" />
            ))}
          </div>
        </div>
      ) : analyticsForbidden ? (
        <div className="text-center py-12 space-y-1">
          <p>You don&apos;t have access to this team&apos;s analytics.</p>
          <p className="text-sm text-base-content/60">
            Ask a team lead to add you as a member to view detailed
            performance data.
          </p>
        </div>
      ) : !analytics ? (
        <div className="text-center py-12 text-base-content/60">
          No analytics available for this team yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card title="Team Health" compact>
              <div className="flex flex-col items-center py-4 relative">
                <HealthRing score={analytics.health.overall} size={130} />
              </div>
            </Card>

            <Card title="Velocity Trend" compact>
              <AreaChartWidget
                data={analytics.velocity}
                dataKey="completed"
                secondaryKey="created"
                color="#22c55e"
                secondaryColor="#3b82f6"
                height={200}
              />
            </Card>

            <Card title="Member Workload" compact>
              <BarChartWidget
                data={analytics.workload.map((w) => ({
                  name: w.display_name,
                  tasks: w.task_count,
                }))}
                dataKey="tasks"
                xKey="name"
                color="#6366f1"
                height={200}
              />
            </Card>
          </div>

          {/* Team Projects */}
          <Card title="Team Projects" compact>
            {analytics.projects.length === 0 ? (
              <p className="text-sm text-base-content/50 py-8 text-center">
                No projects assigned
              </p>
            ) : (
              <VirtualScrollList<ProjectHealthSummary>
                items={analytics.projects}
                itemHeight={64}
                containerHeight={280}
                renderItem={(p) => (
                  <Link
                    href={`/${orgSlug}/projects/${p.project_id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200/60 transition-colors border border-base-200 mb-2"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{
                        backgroundColor:
                          p.health_score >= 80
                            ? "#22c55e"
                            : p.health_score >= 60
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    >
                      {Math.round(p.health_score)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {p.project_name}
                      </p>
                      <p className="text-[11px] text-base-content/40">
                        {p.done_count}/{p.task_count} done
                      </p>
                    </div>
                    <div className="text-xs text-base-content/50 flex-shrink-0">
                      <TrendingUp className="w-3 h-3 inline mr-0.5" />
                      {p.velocity.toFixed(1)}/wk
                    </div>
                  </Link>
                )}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
