"use client";

import { Input } from "@/components/ui/form-fields";
import { Card, PageHeader } from "@/components/ui/shared";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { useOrgPolicies } from "@/hooks/use-policies";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { ProjectAnalytics, RiskScore } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
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

const StackedAreaChart = dynamic(
  () =>
    import("@/components/charts/stacked-area-chart").then((mod) => ({
      default: mod.StackedAreaChart,
    })),
  { ssr: false },
);

const LineChartWidget = dynamic(
  () =>
    import("@/components/charts/line-chart").then((mod) => ({
      default: mod.LineChartWidget,
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

export default function ProjectsPerformancePage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const policies = useOrgPolicies();

  const { data: projects } = useQuery({
    queryKey: ["projects", currentOrg?.id, policies.canViewAllProjects],
    queryFn: () =>
      api.projects.list(currentOrg!.id, policies.projectListParams()),
    enabled: !!currentOrg && !policies.isLoading,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");

  const projectList = projects?.data || [];
  const activeProjectId = selectedProjectId || projectList[0]?.id;
  const activeProject = projectList.find((p) => p.id === activeProjectId);

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projectList;
    const q = searchQuery.toLowerCase();
    return projectList.filter((p) => p.name.toLowerCase().includes(q));
  }, [projectList, searchQuery]);

  const {
    data: analytics,
    isLoading,
    error: analyticsError,
  } = useQuery<ProjectAnalytics>({
    queryKey: ["analytics-project", currentOrg?.id, activeProjectId],
    queryFn: () => api.analytics.project(currentOrg!.id, activeProjectId!),
    enabled: !!currentOrg && !!activeProjectId,
    retry: false,
  });
  const analyticsForbidden =
    analyticsError instanceof ApiError && analyticsError.status === 403;

  return (
    <div>
      <PageHeader
        title="Project Performance"
        description="Detailed analytics per project"
        actions={
          <Link
            href={`/${orgSlug}/performance`}
            className="btn btn-sm btn-ghost gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      {/* Project selector */}
      {projectList.length > 0 && (
        <div className="mb-6">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
            <Input
              type="text"
              placeholder="Search projects..."
              className="input-sm w-full max-w-xs pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="ml-3 text-xs text-base-content/50">
              {projectList.length} projects
              {activeProject && (
                <>
                  {" "}
                  — selected: <strong>{activeProject.name}</strong>
                </>
              )}
            </span>
          </div>
          <VirtualScrollList<(typeof filteredProjects)[0]>
            items={filteredProjects}
            itemHeight={36}
            containerHeight={148}
            renderItem={(p) => (
              <button
                onClick={() => setSelectedProjectId(p.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-base-200 transition-colors",
                  activeProjectId === p.id
                    ? "bg-primary text-primary-content font-medium"
                    : "text-base-content",
                )}
              >
                {p.name}
              </button>
            )}
          />
        </div>
      )}

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 bg-base-200 rounded-xl" />
            ))}
          </div>
        </div>
      ) : analyticsForbidden ? (
        <div className="text-center py-12 space-y-1">
          <p>You don&apos;t have access to this project&apos;s analytics.</p>
          <p className="text-sm text-base-content/60">
            Ask a project lead to add you as a member to view detailed
            performance data.
          </p>
        </div>
      ) : !analytics ? (
        <div className="text-center py-12 text-base-content/60">
          No analytics available for this project yet.
        </div>
      ) : (
        <>
          {/* Health + Velocity + CFD */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card title="Project Health" compact>
              <div className="flex flex-col items-center py-4 relative">
                <HealthRing score={analytics.health.overall} size={130} />
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-4 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-base-content/60">Velocity</span>
                    <span className="font-semibold">
                      {Math.round(analytics.health.velocity_trend)}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-base-content/60">Completion</span>
                    <span className="font-semibold">
                      {Math.round(analytics.health.completion_rate)}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-base-content/60">Blocked</span>
                    <span className="font-semibold">
                      {Math.round(analytics.health.blocked_ratio)}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-base-content/60">Accuracy</span>
                    <span className="font-semibold">
                      {Math.round(analytics.health.estimate_accuracy)}%
                    </span>
                  </div>
                </div>
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

            <Card title="Cumulative Flow Diagram" compact>
              <StackedAreaChart data={analytics.cfd} height={200} />
            </Card>
          </div>

          {/* Burndown + Cycle Time + Throughput */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card title="Burndown" compact>
              <LineChartWidget
                data={analytics.burndown}
                dataKey="remaining"
                secondaryKey="ideal"
                color="#f59e0b"
                secondaryColor="#94a3b8"
                height={200}
              />
            </Card>

            <Card title="Cycle Time" compact>
              <div className="grid grid-cols-2 gap-3 py-4">
                {[
                  {
                    label: "Mean",
                    value: `${analytics.cycle_time.mean.toFixed(1)}h`,
                  },
                  {
                    label: "Median",
                    value: `${analytics.cycle_time.median.toFixed(1)}h`,
                  },
                  {
                    label: "P75",
                    value: `${analytics.cycle_time.p75.toFixed(1)}h`,
                  },
                  {
                    label: "P90",
                    value: `${analytics.cycle_time.p90.toFixed(1)}h`,
                  },
                  {
                    label: "P95",
                    value: `${analytics.cycle_time.p95.toFixed(1)}h`,
                  },
                  {
                    label: "Std Dev",
                    value: `${analytics.cycle_time.std_dev.toFixed(1)}h`,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="text-center p-2 rounded-lg bg-base-200/50"
                  >
                    <div className="text-lg font-bold">{item.value}</div>
                    <div className="text-[10px] text-base-content/50 uppercase tracking-wider">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Throughput" compact>
              <div className="flex flex-col items-center justify-center py-6 gap-4">
                <div className="grid grid-cols-3 gap-4 w-full text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {analytics.throughput.daily_avg.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-base-content/50 uppercase">
                      Daily Avg
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-secondary">
                      {analytics.throughput.weekly_avg.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-base-content/50 uppercase">
                      Weekly Avg
                    </div>
                  </div>
                  <div>
                    <div
                      className={cn(
                        "text-2xl font-bold",
                        analytics.throughput.trend >= 0
                          ? "text-success"
                          : "text-error",
                      )}
                    >
                      {analytics.throughput.trend >= 0 ? "+" : ""}
                      {analytics.throughput.trend.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-base-content/50 uppercase">
                      Trend
                    </div>
                  </div>
                </div>
                {analytics.completion_forecast && (
                  <div className="text-xs text-base-content/60 mt-2">
                    Forecast completion:{" "}
                    <span className="font-semibold">
                      {new Date(
                        analytics.completion_forecast,
                      ).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Workload + Risk Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Workload Distribution" compact>
              <BarChartWidget
                data={analytics.workload.map((w) => ({
                  name: w.display_name,
                  tasks: w.task_count,
                  done: w.done_count,
                }))}
                dataKey="tasks"
                xKey="name"
                color="#6366f1"
                height={200}
              />
            </Card>

            <Card title="At-Risk Tasks" compact>
              {analytics.risk_tasks.length === 0 ? (
                <p className="text-sm text-base-content/50 py-8 text-center">
                  No at-risk tasks
                </p>
              ) : (
                <VirtualScrollList<RiskScore>
                  items={analytics.risk_tasks}
                  itemHeight={44}
                  containerHeight={220}
                  renderItem={(r) => (
                    <div
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg text-xs mb-1",
                        r.risk_level === "critical"
                          ? "bg-error/10"
                          : r.risk_level === "high"
                            ? "bg-warning/10"
                            : "bg-base-200/50",
                      )}
                    >
                      <div
                        className={cn(
                          "badge badge-sm",
                          r.risk_level === "critical"
                            ? "badge-error"
                            : r.risk_level === "high"
                              ? "badge-warning"
                              : "badge-ghost",
                        )}
                      >
                        {r.risk_level}
                      </div>
                      <span className="truncate flex-1">
                        Score: {r.risk_score.toFixed(0)}
                      </span>
                      {r.predicted_completion && (
                        <span className="text-base-content/50">
                          Est:{" "}
                          {new Date(
                            r.predicted_completion,
                          ).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}
                />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
