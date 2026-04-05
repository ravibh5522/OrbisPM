"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  /**
   * "boxed"   → tabs-boxed (filled pill background)
   * "bordered" → tabs-bordered (underline style)
   * "lifted"  → tabs-lifted (lifted card style)
   */
  variant?: "boxed" | "bordered" | "lifted";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

/**
 * Shared Tabs component — wraps DaisyUI tabs with consistent sizing,
 * ARIA roles, and a single prop-driven API.
 *
 * Usage:
 *   <Tabs
 *     tabs={[{ id: "overview", label: "Overview" }, { id: "members", label: "Members" }]}
 *     activeTab={activeTab}
 *     onChange={setActiveTab}
 *     variant="boxed"
 *   />
 */
export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "boxed",
  size,
  className,
}: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="tabs"
      className={cn(
        "tabs",
        variant === "boxed" && "tabs-boxed",
        variant === "bordered" && "tabs-bordered",
        variant === "lifted" && "tabs-lifted",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={cn(
            "tab gap-1.5",
            size === "xs" && "tab-xs",
            size === "sm" && "tab-sm",
            size === "lg" && "tab-lg",
            activeTab === tab.id && "tab-active",
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && (
            <span className="w-4 h-4 flex-shrink-0">{tab.icon}</span>
          )}
          {tab.label}
          {tab.badge !== undefined && (
            <span className="badge badge-xs badge-secondary ml-0.5">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
