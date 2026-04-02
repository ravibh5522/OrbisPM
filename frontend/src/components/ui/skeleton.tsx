"use client";

import { cn } from "@/lib/utils";

// ─── Base Skeleton ────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  /** Disable the pulse animation */
  noAnimate?: boolean;
}

export function Skeleton({ className, noAnimate }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-base-300 rounded",
        !noAnimate && "animate-pulse",
        className,
      )}
    />
  );
}

// ─── Text Skeleton ────────────────────────────────────────────────────────────

interface SkeletonTextProps {
  lines?: number;
  className?: string;
  /** Width override for the last (shorter) line, e.g. "w-2/3" */
  lastLineWidth?: string;
}

export function SkeletonText({
  lines = 3,
  className,
  lastLineWidth = "w-2/3",
}: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 && lines > 1 ? lastLineWidth : "w-full",
          )}
        />
      ))}
    </div>
  );
}

// ─── Card Skeleton ────────────────────────────────────────────────────────────

interface SkeletonCardProps {
  className?: string;
  /** Height of the visual block at the top of the card (image/chart area) */
  headerHeight?: string;
  lines?: number;
  /** Show an avatar circle in the card header */
  withAvatar?: boolean;
}

export function SkeletonCard({
  className,
  headerHeight = "h-32",
  lines = 2,
  withAvatar = false,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "bg-base-100 border border-base-200 rounded-xl overflow-hidden animate-pulse",
        className,
      )}
    >
      {headerHeight && (
        <Skeleton className={cn(headerHeight, "rounded-none")} noAnimate />
      )}
      <div className="p-4 space-y-3">
        {withAvatar && (
          <div className="flex items-center gap-3">
            <Skeleton
              className="w-10 h-10 rounded-full flex-shrink-0"
              noAnimate
            />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" noAnimate />
              <Skeleton className="h-3 w-1/2" noAnimate />
            </div>
          </div>
        )}
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

// ─── Table Skeleton ───────────────────────────────────────────────────────────

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
  /** Show a header row */
  withHeader?: boolean;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
  withHeader = true,
}: SkeletonTableProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="table w-full">
        {withHeader && (
          <thead>
            <tr>
              {Array.from({ length: cols }).map((_, ci) => (
                <th key={ci}>
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }).map((_, ri) => (
            <tr key={ri}>
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci}>
                  <Skeleton className={cn("h-4", ci === 0 ? "w-32" : "w-20")} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stats Grid Skeleton ──────────────────────────────────────────────────────

interface SkeletonStatsProps {
  count?: number;
  className?: string;
}

export function SkeletonStats({ count = 4, className }: SkeletonStatsProps) {
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-4 bg-base-100 border border-base-200 rounded-xl animate-pulse"
        >
          <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" noAnimate />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-16" noAnimate />
            <Skeleton className="h-3 w-24" noAnimate />
          </div>
        </div>
      ))}
    </div>
  );
}
