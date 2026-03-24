"use client";

/**
 * Faded skeleton placeholders shown when chart data is empty or loading.
 * Use `pulse` prop (default true) to animate.
 */

interface SkeletonProps {
  height?: number;
  pulse?: boolean;
}

export function AreaChartSkeleton({
  height = 200,
  pulse = true,
}: SkeletonProps) {
  const w = 400;
  const h = height;
  // Fake wave path
  const path = `M0,${h * 0.6} C40,${h * 0.3} 80,${h * 0.8} 120,${h * 0.45} S200,${h * 0.2} 240,${h * 0.5} S320,${h * 0.7} 360,${h * 0.35} L400,${h * 0.4} L400,${h} L0,${h} Z`;
  const line = `M0,${h * 0.6} C40,${h * 0.3} 80,${h * 0.8} 120,${h * 0.45} S200,${h * 0.2} 240,${h * 0.5} S320,${h * 0.7} 360,${h * 0.35} L400,${h * 0.4}`;
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${pulse ? "animate-pulse" : ""}`}
      style={{ height }}
    >
      {/* Grid lines */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-30"
      >
        {[0.2, 0.4, 0.6, 0.8].map((y) => (
          <line
            key={y}
            x1="0"
            y1={h * y}
            x2={w}
            y2={h * y}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.4"
          />
        ))}
        {/* Area fill */}
        <path d={path} fill="currentColor" opacity="0.08" />
        {/* Line */}
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.2"
        />
      </svg>
      {/* "No data" label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs text-base-content/30 font-medium tracking-wide uppercase">
          No data yet
        </span>
      </div>
    </div>
  );
}

export function LineChartSkeleton({
  height = 200,
  pulse = true,
}: SkeletonProps) {
  const w = 400;
  const h = height;
  const line = `M0,${h * 0.5} C60,${h * 0.7} 100,${h * 0.2} 160,${h * 0.6} S250,${h * 0.3} 300,${h * 0.55} L400,${h * 0.4}`;
  const dots: [number, number][] = [
    [0, h * 0.5],
    [80, h * 0.35],
    [160, h * 0.6],
    [240, h * 0.3],
    [320, h * 0.55],
    [400, h * 0.4],
  ];
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${pulse ? "animate-pulse" : ""}`}
      style={{ height }}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-30"
      >
        {[0.25, 0.5, 0.75].map((y) => (
          <line
            key={y}
            x1="0"
            y1={h * y}
            x2={w}
            y2={h * y}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.3"
          />
        ))}
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.2"
        />
        {dots.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="4"
            fill="currentColor"
            opacity="0.2"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs text-base-content/30 font-medium tracking-wide uppercase">
          No data yet
        </span>
      </div>
    </div>
  );
}

export function DonutChartSkeleton({ pulse = true }: { pulse?: boolean }) {
  return (
    <div className={`flex items-center gap-4 ${pulse ? "animate-pulse" : ""}`}>
      {/* Ghost donut */}
      <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-2xl bg-base-200/60">
        <svg viewBox="0 0 128 128" className="w-28 h-28 opacity-20">
          <circle
            cx="64"
            cy="64"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="22"
            strokeDasharray="251"
            strokeDashoffset="0"
          />
        </svg>
      </div>
      {/* Ghost legend bars */}
      <div className="flex-1 space-y-2.5">
        {[80, 60, 90, 50, 70].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm bg-base-300 flex-shrink-0" />
            <div
              className="h-2.5 rounded-full bg-base-300"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
        <div className="text-xs text-base-content/25 mt-1 tracking-wide uppercase">
          No data yet
        </div>
      </div>
    </div>
  );
}
