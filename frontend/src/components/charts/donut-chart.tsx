"use client";

import { statusLabel } from "@/lib/utils";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

import { DonutChartSkeleton } from "./chart-skeleton";

export function DonutChart({
  data,
  colors,
  title: _title,
}: {
  data: { name: string; value: number }[];
  colors: Record<string, string>;
  title: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <DonutChartSkeleton />;

  const chartSize = 170;
  const innerRadius = 40;
  const outerRadius = 82;

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-[152px] w-[152px] flex-shrink-0 items-center justify-center rounded-2xl">
        <PieChart width={chartSize} height={chartSize}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={colors[entry.name] || "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [value, "Tasks"]} />
        </PieChart>
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {data.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center justify-between text-xs gap-2 px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: colors[entry.name] || "#94a3b8",
                }}
              />
              <span className="truncate capitalize font-medium">
                {statusLabel(entry.name)}
              </span>
            </div>
            <span className="font-semibold tabular-nums flex-shrink-0">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
