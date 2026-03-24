"use client";

import { Card, PageHeader } from "@/components/ui/shared";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { MemberAnalytics } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ListTodo,
  Search,
  TrendingUp,
} from "lucide-react";
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

export default function MembersPerformancePage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgSlug = currentOrg?.slug || "";

  const { data: members } = useQuery({
    queryKey: ["org-members", currentOrg?.id],
    queryFn: () => api.members.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const memberList = members?.data || [];
  const activeMemberId = selectedMemberId || memberList[0]?.user_id;
  const activeMember = memberList.find((m) => m.user_id === activeMemberId);

  const filteredMembers = useMemo(() => {
    if (!searchQuery) return memberList;
    const q = searchQuery.toLowerCase();
    return memberList.filter(
      (m) =>
        (m.display_name && m.display_name.toLowerCase().includes(q)) ||
        m.email.toLowerCase().includes(q),
    );
  }, [memberList, searchQuery]);

  const { data: analytics, isLoading } = useQuery<MemberAnalytics>({
    queryKey: ["analytics-member", currentOrg?.id, activeMemberId],
    queryFn: () => api.analytics.member(currentOrg!.id, activeMemberId!),
    enabled: !!currentOrg && !!activeMemberId,
  });

  return (
    <div>
      <PageHeader
        title="Member Performance"
        description="Individual contributor analytics"
        actions={
          <Link
            href={`/${orgSlug}/performance`}
            className="btn btn-sm btn-ghost gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      {/* Member selector — search + scrollable list */}
      {memberList.length > 0 && (
        <div className="mb-6">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
            <input
              type="text"
              placeholder="Search members..."
              className="input input-bordered input-sm w-full max-w-xs pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="ml-3 text-xs text-base-content/50">
              {memberList.length} members
              {activeMember && (
                <>
                  {" "}
                  — selected:{" "}
                  <strong>
                    {activeMember.display_name || activeMember.email}
                  </strong>
                </>
              )}
            </span>
          </div>
          <VirtualScrollList<(typeof filteredMembers)[0]>
            items={filteredMembers}
            itemHeight={36}
            containerHeight={148}
            renderItem={(m) => (
              <button
                onClick={() => setSelectedMemberId(m.user_id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-base-200 transition-colors",
                  activeMemberId === m.user_id
                    ? "bg-primary text-primary-content font-medium"
                    : "text-base-content",
                )}
              >
                {m.display_name || m.email}
              </button>
            )}
          />
        </div>
      )}

      {memberList.length === 0 ? (
        <p className="text-sm text-base-content/50 py-12 text-center">
          No members found
        </p>
      ) : isLoading || !analytics ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-base-200 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card compact>
              <div className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 rounded-lg bg-success flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-success-content" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {analytics.tasks_completed}
                  </div>
                  <div className="text-xs text-base-content/50">Completed</div>
                </div>
              </div>
            </Card>
            <Card compact>
              <div className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                  <ListTodo className="w-5 h-5 text-primary-content" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {analytics.active_tasks}
                  </div>
                  <div className="text-xs text-base-content/50">Active</div>
                </div>
              </div>
            </Card>
            <Card compact>
              <div className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 rounded-lg bg-info flex items-center justify-center">
                  <Clock className="w-5 h-5 text-info-content" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {analytics.avg_cycle_time.toFixed(1)}h
                  </div>
                  <div className="text-xs text-base-content/50">
                    Avg Cycle Time
                  </div>
                </div>
              </div>
            </Card>
            <Card compact>
              <div className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-secondary-content" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {Math.round(analytics.completion_rate)}%
                  </div>
                  <div className="text-xs text-base-content/50">
                    Completion Rate
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Velocity Chart */}
          <Card title="Personal Velocity" compact>
            <AreaChartWidget
              data={analytics.velocity}
              dataKey="completed"
              secondaryKey="created"
              color="#22c55e"
              secondaryColor="#3b82f6"
              height={250}
            />
          </Card>
        </>
      )}
    </div>
  );
}
