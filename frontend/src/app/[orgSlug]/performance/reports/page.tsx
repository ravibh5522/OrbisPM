"use client";

import { Card, PageHeader } from "@/components/ui/shared";
import { api, type ListResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { PerformanceReport } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileBarChart,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function ReportRow({ report }: { report: PerformanceReport }) {
  const [expanded, setExpanded] = useState(false);

  const statusClass =
    report.status === "completed"
      ? "badge-success"
      : report.status === "generating"
        ? "badge-warning"
        : report.status === "failed"
          ? "badge-error"
          : "badge-ghost";

  const isActive =
    report.status === "pending" || report.status === "generating";

  return (
    <div className="rounded-lg border border-base-200">
      <div
        className="flex items-center gap-3 p-3 hover:bg-base-200/40 transition-colors cursor-pointer"
        onClick={() => report.status === "completed" && setExpanded((v) => !v)}
      >
        {isActive ? (
          <Loader2 className="w-5 h-5 text-primary flex-shrink-0 animate-spin" />
        ) : (
          <FileBarChart className="w-5 h-5 text-primary flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium capitalize">
            {report.report_type.replace(/_/g, " ")} Report
          </p>
          <p className="text-[11px] text-base-content/40">
            {report.scope_type} •{" "}
            {new Date(report.created_at).toLocaleDateString()}
            {report.generated_at &&
              ` • generated ${new Date(report.generated_at).toLocaleTimeString()}`}
          </p>
        </div>
        <div className={`badge badge-sm ${statusClass}`}>{report.status}</div>
        {report.status === "completed" &&
          (expanded ? (
            <ChevronUp className="w-4 h-4 text-base-content/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-base-content/40" />
          ))}
      </div>

      {expanded && report.status === "completed" && (
        <div className="border-t border-base-200 p-3 bg-base-50">
          <p className="text-xs font-semibold text-base-content/60 mb-2 uppercase tracking-wide">
            Report Data
          </p>
          <pre className="text-xs bg-base-200 rounded-lg p-3 overflow-x-auto max-h-64 scrollbar-thin">
            {JSON.stringify(report.parameters, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";
  const qc = useQueryClient();

  const { data: reports, isLoading } = useQuery<
    ListResponse<PerformanceReport>
  >({
    queryKey: ["analytics-reports", currentOrg?.id],
    queryFn: () => api.analytics.reports.list(currentOrg!.id),
    enabled: !!currentOrg,
    refetchInterval: (query) => {
      const list = query.state.data?.data ?? [];
      const hasActive = list.some(
        (r) => r.status === "pending" || r.status === "generating",
      );
      return hasActive ? 3000 : false;
    },
  });

  const [reportType, setReportType] = useState("summary");

  const createReport = useMutation({
    mutationFn: () =>
      api.analytics.reports.create(currentOrg!.id, {
        report_type: reportType,
        scope_type: "org",
        scope_id: currentOrg!.id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analytics-reports", currentOrg?.id] });
    },
  });

  const reportList = reports?.data || [];
  const activeCount = reportList.filter(
    (r) => r.status === "pending" || r.status === "generating",
  ).length;

  return (
    <div>
      <PageHeader
        title="Performance Reports"
        description="Generate and view performance reports"
        actions={
          <Link
            href={`/${orgSlug}/performance`}
            className="btn btn-sm btn-ghost gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      {/* Generate Report */}
      <Card title="Generate New Report" compact className="mb-6">
        <div className="flex items-center gap-3 py-2">
          <select
            className="select select-bordered select-sm"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            <option value="summary">Summary Report</option>
            <option value="velocity">Velocity Report</option>
            <option value="cycle_time">Cycle Time Report</option>
            <option value="health">Health Report</option>
          </select>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={() => createReport.mutate()}
            disabled={createReport.isPending}
          >
            {createReport.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileBarChart className="w-4 h-4" />
            )}
            Generate
          </button>
        </div>
      </Card>

      {/* Reports list */}
      <Card title="Reports History" compact>
        {isLoading ? (
          <div className="animate-pulse space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-base-200 rounded-lg" />
            ))}
          </div>
        ) : reportList.length === 0 ? (
          <div className="text-center py-8">
            <FileBarChart className="w-10 h-10 text-base-content/15 mx-auto mb-2" />
            <p className="text-sm text-base-content/50">
              No reports generated yet
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-warning py-1 px-2 rounded-lg bg-warning/10 mb-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {activeCount} report{activeCount > 1 ? "s" : ""} being generated
                — auto-refreshing…
              </div>
            )}
            {reportList.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
