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
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={35}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        />
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
