"use client";

import { cn } from "@/lib/utils";
import type { MentionTrigger } from "./use-canvas-mentions";

export interface MentionRow {
  id: string;
  label: string;
  sublabel?: string;
  dotClassName?: string;
  avatarUrl?: string;
}

interface MentionDropdownProps {
  top: number;
  left: number;
  trigger: MentionTrigger;
  query: string;
  results: MentionRow[];
  loading: boolean;
  activeIndex: number;
  onSelect: (row: MentionRow) => void;
  onHover: (index: number) => void;
}

const TRIGGER_LABEL: Record<MentionTrigger, string> = {
  "@": "task",
  "#": "status",
  $: "member",
};

export function MentionDropdown({
  top,
  left,
  trigger,
  query,
  results,
  loading,
  activeIndex,
  onSelect,
  onHover,
}: MentionDropdownProps) {
  const kind = TRIGGER_LABEL[trigger];
  return (
    <div
      className="fixed w-72 bg-base-100 border border-base-200 rounded-xl shadow-lg z-[9999] max-h-56 overflow-y-auto"
      style={{ top, left }}
    >
      <div className="px-3 py-1.5 text-[11px] font-semibold text-base-content/40 uppercase tracking-wider">
        {query ? `${kind}s matching "${query}"` : `Link a ${kind}`}
      </div>
      {loading && (
        <div className="px-3 py-2 text-sm text-base-content/50">
          Searching…
        </div>
      )}
      {!loading && results.length === 0 && (
        <div className="px-3 py-2 text-sm text-base-content/50">
          No matching {kind}s
        </div>
      )}
      {!loading &&
        results.map((row, i) => (
          <button
            key={row.id}
            type="button"
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-base-300 transition-colors",
              i === activeIndex && "bg-base-300",
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(row);
            }}
            onMouseEnter={() => onHover(i)}
          >
            {row.avatarUrl !== undefined ? (
              <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[9px] flex-shrink-0 overflow-hidden">
                {row.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.avatarUrl} alt="" className="w-5 h-5 object-cover" />
                ) : (
                  row.label[0]?.toUpperCase()
                )}
              </span>
            ) : (
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  row.dotClassName ?? "bg-base-content/30",
                )}
              />
            )}
            <span className="truncate">{row.label}</span>
            {row.sublabel && (
              <span className="text-xs text-base-content/40 ml-auto truncate">
                {row.sublabel}
              </span>
            )}
          </button>
        ))}
    </div>
  );
}
