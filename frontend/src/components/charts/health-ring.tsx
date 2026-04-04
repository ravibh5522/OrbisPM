"use client";

import { cn } from "@/lib/utils";

interface HealthRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "oklch(64% 0.18 180)";
  if (score >= 60) return "oklch(56% 0.16 270)";
  if (score >= 40) return "oklch(52% 0.14 282)";
  return "oklch(48% 0.12 300)";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "At Risk";
  return "Critical";
}

export function HealthRing({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  className,
}: HealthRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (clampedScore / 100) * circumference;
  const color = getScoreColor(clampedScore);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" style={{ backgroundColor: "transparent" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-base-200/30"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out drop-shadow-lg"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {Math.round(clampedScore)}
          </span>
          <span className="text-[10px] text-base-content/60 uppercase tracking-wider">
            {label || getScoreLabel(clampedScore)}
          </span>
        </div>
      </div>
    </div>
  );
}
