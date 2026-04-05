import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface TrendProps {
  /** Positive = up, negative = down */
  value: number;
  label?: string;
}

interface StatCardProps {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  /** DaisyUI bg-* class for the icon container background. Defaults to "bg-primary/10" */
  iconBg?: string;
  /** DaisyUI text-* class for the icon color. Defaults to "text-primary" */
  iconColor?: string;
  trend?: TrendProps;
  compact?: boolean;
  className?: string;
}

/**
 * Unified KPI / stat card.
 *
 * Replaces:
 *  - dashboard MiniStat inline divs
 *  - my-tasks stat divs
 *  - performance <StatCard> in reports
 *  - members compact <Card> pattern
 *
 * Usage:
 *   <StatCard
 *     title="Total Tasks"
 *     value={142}
 *     icon={<CheckSquare className="w-5 h-5" />}
 *     trend={{ value: 12, label: "vs last week" }}
 *   />
 */
export function StatCard({
  title,
  value,
  description,
  icon,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
  trend,
  compact = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-base-100 rounded-xl border border-base-200 shadow-sm flex items-center gap-3",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "rounded-lg flex items-center justify-center flex-shrink-0",
            compact ? "w-9 h-9" : "w-10 h-10",
            iconBg,
            iconColor,
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-base-content/60 font-medium truncate">
          {title}
        </p>
        <p
          className={cn(
            "font-bold text-base-content leading-tight",
            compact ? "text-xl" : "text-2xl",
          )}
        >
          {value}
        </p>
        {description && (
          <p className="text-xs text-base-content/50 mt-0.5 truncate">
            {description}
          </p>
        )}
        {trend && (
          <p
            className={cn(
              "text-xs font-medium mt-0.5",
              trend.value >= 0 ? "text-success" : "text-error",
            )}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}%
            {trend.label && (
              <span className="ml-0.5 font-normal text-base-content/50">
                {trend.label}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
