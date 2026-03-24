"use client";

import { statusLabel } from "@/lib/utils";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export function DonutChart({
  data,
  colors,
  title,
}: {
  data: { name: string; value: number }[];
  colors: Record<string, string>;
  title: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0)
    return (
      <p className="text-base-content/50 text-sm py-8 text-center">No data</p>
    );

  return (
    <div className="flex items-center gap-4">
      <div className="w-32 h-32 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={52}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={colors[entry.name] || "#94a3b8"}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [value, "Tasks"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center justify-between text-xs gap-2"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: colors[entry.name] || "#94a3b8",
                }}
              />
              <span className="truncate capitalize">
                {statusLabel(entry.name)}
              </span>
            </div>
            <span className="font-semibold tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
