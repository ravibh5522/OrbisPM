"use client";

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
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey={xKey}
          type="category"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={100}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
