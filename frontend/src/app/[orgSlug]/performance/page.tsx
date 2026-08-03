"use client";

import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/shared";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type {
  MetricAlert,
  OrgAnalytics,
  ProjectHealthSummary,
} from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListTodo,
  TrendingUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

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

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 bg-base-100 rounded-xl border border-base-200 shadow-sm">
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-lg ${color}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-base-content/50">{label}</div>
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const setBreadcrumb = useUIStore((s) => s.setBreadcrumb);
  const [days, setDays] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    setBreadcrumb({ label: "Performance", backHref: `/${orgSlug}` });
    return () => setBreadcrumb(null);
  }, [orgSlug, setBreadcrumb]);

  const {
    data,
    isLoading,
    error: dataError,
  } = useQuery<OrgAnalytics>({
    queryKey: ["analytics-org", currentOrg?.id, days],
    queryFn: () => api.analytics.org(currentOrg!.id, days),
    enabled: !!currentOrg,
    retry: false,
  });

  if (!isLoading && !data) {
    const forbidden = dataError instanceof ApiError && dataError.status === 403;
    return (
      <div className="text-center py-12 text-base-content/60">
        {forbidden
          ? "You don't have access to organization analytics."
          : "No analytics available yet."}
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-base-300 rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-base-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 bg-base-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const completionPct =
    data.total_tasks > 0
      ? Math.round((data.completed_tasks / data.total_tasks) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="Performance"
        description="Organization-wide analytics and insights"
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <div className="join">
              {([7, 30, 90] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={days === d ? "primary" : "outline"}
                  className="join-item"
                  onClick={() => setDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
            <Link
              href={`/${orgSlug}/performance/projects`}
              className="btn btn-sm btn-outline"
            >
              Projects
            </Link>
            <Link
              href={`/${orgSlug}/performance/teams`}
              className="btn btn-sm btn-outline"
            >
              Teams
            </Link>
            <Link
              href={`/${orgSlug}/performance/reports`}
              className="btn btn-sm btn-outline"
            >
              Reports
            </Link>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Tasks"
          value={data.total_tasks}
          icon={<ListTodo className="w-5 h-5 text-primary-content" />}
          color="bg-primary"
        />
        <StatCard
          label="Completed"
          value={`${data.completed_tasks} (${completionPct}%)`}
          icon={<CheckCircle2 className="w-5 h-5 text-success-content" />}
          color="bg-success"
        />
        <StatCard
          label="Overdue"
          value={data.overdue_tasks}
          icon={<AlertTriangle className="w-5 h-5 text-error-content" />}
          color="bg-error"
        />
        <StatCard
          label="Avg Cycle Time"
          value={`${data.avg_cycle_time.toFixed(1)}h`}
          icon={<Clock className="w-5 h-5 text-info-content" />}
          color="bg-info"
        />
      </div>

      {/* Health + Velocity + Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card title="Organization Health" compact>
          <div className="flex flex-col items-center py-4 relative">
            <HealthRing score={data.health.overall} size={140} />
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-base-content/60">Velocity</span>
                <span className="font-semibold">
                  {Math.round(data.health.velocity_trend)}%
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-base-content/60">Completion</span>
                <span className="font-semibold">
                  {Math.round(data.health.completion_rate)}%
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-base-content/60">Blocked</span>
                <span className="font-semibold">
                  {Math.round(data.health.blocked_ratio)}%
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-base-content/60">Accuracy</span>
                <span className="font-semibold">
                  {Math.round(data.health.estimate_accuracy)}%
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Velocity Trend (30 days)" compact>
          <AreaChartWidget
            data={data.velocity}
            dataKey="completed"
            secondaryKey="created"
            color="#22c55e"
            secondaryColor="#3b82f6"
            height={220}
          />
        </Card>

        <Card title="Workload by Project" compact>
          <BarChartWidget
            data={data.workload.map((w) => ({
              name: w.display_name,
              tasks: w.task_count,
            }))}
            dataKey="tasks"
            xKey="name"
            color="#6366f1"
            height={220}
          />
        </Card>
      </div>

      {/* Project Health + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Project Health" compact>
          {data.project_health.length === 0 ? (
            <p className="text-sm text-base-content/50 py-8 text-center">
              No projects
            </p>
          ) : (
            <VirtualScrollList<ProjectHealthSummary>
              items={data.project_health}
              itemHeight={56}
              containerHeight={320}
              renderItem={(p) => (
                <Link
                  href={`/${orgSlug}/performance/projects`}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-base-200/60 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
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
                      {p.done_count}/{p.task_count} done •{" "}
                      {p.overdue_count > 0 && (
                        <span className="text-error">
                          {p.overdue_count} overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-xs text-base-content/50 flex-shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                    {p.velocity.toFixed(1)}/wk
                  </div>
                </Link>
              )}
            />
          )}
        </Card>

        <Card title="Active Alerts" compact>
          {data.active_alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="w-8 h-8 text-success mb-2" />
              <p className="text-sm text-base-content/60">No active alerts</p>
            </div>
          ) : (
            <VirtualScrollList<MetricAlert>
              items={data.active_alerts}
              itemHeight={68}
              containerHeight={320}
              renderItem={(alert) => (
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg text-sm mb-1 ${
                    alert.severity === "critical"
                      ? "bg-error/10"
                      : alert.severity === "warning"
                        ? "bg-warning/10"
                        : "bg-info/10"
                  }`}
                >
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      alert.severity === "critical"
                        ? "text-error"
                        : alert.severity === "warning"
                          ? "text-warning"
                          : "text-info"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-xs text-base-content/60 mt-0.5">
                      {alert.description}
                    </p>
                  </div>
                </div>
              )}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
