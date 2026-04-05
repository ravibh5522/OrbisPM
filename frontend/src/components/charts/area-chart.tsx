"use client";

import {
  Area,
  CartesianGrid,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chart-utils";
import { AreaChartSkeleton } from "./chart-skeleton";

interface AreaChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  secondaryKey?: string;
  color?: string;
  secondaryColor?: string;
  height?: number;
  showGrid?: boolean;
}

export function AreaChartWidget({
  data,
  dataKey,
  xKey = "date",
  secondaryKey,
  color = "#6366f1",
  secondaryColor = "#f59e0b",
  height = 200,
  showGrid = true,
}: AreaChartProps) {
  if (!data || data.length === 0) {
    return <AreaChartSkeleton height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart
        data={data}
        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.2} />}
        <XAxis
          dataKey={xKey}
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
          dataKey={dataKey}
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          strokeWidth={2}
        />
        {secondaryKey && (
          <Area
            type="monotone"
            dataKey={secondaryKey}
            stroke={secondaryColor}
            fill={secondaryColor}
            fillOpacity={0.1}
            strokeWidth={2}
          />
        )}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
