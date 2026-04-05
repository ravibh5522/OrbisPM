"use client";

import { CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chart-utils";
import { STATUS_HEX } from "@/lib/task-colors";
import type { CFDPoint } from "@/types/domain";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CFD_COLORS = {
  done: STATUS_HEX.done,
  in_progress: STATUS_HEX.in_progress,
  blocked: STATUS_HEX.blocked,
  todo: STATUS_HEX.todo,
};

interface StackedAreaChartProps {
  data: CFDPoint[];
  height?: number;
}

export function StackedAreaChart({
  data,
  height = 250,
}: StackedAreaChartProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-base-content/50 text-sm py-8 text-center">No data</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis
          dataKey="date"
          tick={CHART_AXIS_STYLE}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={CHART_AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={35}
        />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Area
          type="monotone"
          dataKey="done"
          stackId="1"
          stroke={CFD_COLORS.done}
          fill={CFD_COLORS.done}
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="in_progress"
          stackId="1"
          stroke={CFD_COLORS.in_progress}
          fill={CFD_COLORS.in_progress}
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="blocked"
          stackId="1"
          stroke={CFD_COLORS.blocked}
          fill={CFD_COLORS.blocked}
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="todo"
          stackId="1"
          stroke={CFD_COLORS.todo}
          fill={CFD_COLORS.todo}
          fillOpacity={0.6}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
