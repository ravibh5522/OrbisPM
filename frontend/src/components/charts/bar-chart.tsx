"use client";

import { CHART_AXIS_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/chart-utils";
import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BarChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
  layout?: "horizontal" | "vertical";
}

export function BarChartWidget({
  data,
  dataKey,
  xKey = "name",
  color = "#6366f1",
  height = 200,
  layout = "vertical",
}: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-base-content/50 text-sm py-8 text-center">No data</p>
    );
  }

  if (layout === "horizontal") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
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
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
        <XAxis
          type="number"
          tick={CHART_AXIS_STYLE}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey={xKey}
          type="category"
          tick={CHART_AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={100}
        />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
