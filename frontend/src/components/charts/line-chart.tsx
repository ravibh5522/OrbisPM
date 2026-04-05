"use client";

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chart-utils";
import { LineChartSkeleton } from "./chart-skeleton";

interface LineChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  secondaryKey?: string;
  color?: string;
  secondaryColor?: string;
  height?: number;
}

export function LineChartWidget({
  data,
  dataKey,
  xKey = "date",
  secondaryKey,
  color = "#6366f1",
  secondaryColor = "#94a3b8",
  height = 200,
}: LineChartProps) {
  if (!data || data.length === 0) {
    return <LineChartSkeleton height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
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
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
        />
        {secondaryKey && (
          <Line
            type="monotone"
            dataKey={secondaryKey}
            stroke={secondaryColor}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        )}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
