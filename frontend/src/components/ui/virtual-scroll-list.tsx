"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

interface VirtualScrollListProps<T> {
  items: T[];
  /** Estimated height of each row in px (used for initial layout calculations). */
  itemHeight?: number;
  /** Visible container height in px. */
  containerHeight?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Number of items to render outside the visible window for smooth scroll. */
  overscan?: number;
  className?: string;
  /** Shown when items array is empty. */
  emptyState?: React.ReactNode;
}

/**
 * VirtualScrollList — renders only visible rows in a fixed-height scrollable container.
 * Built on @tanstack/react-virtual v3. Works with any item shape.
 *
 * Auto-pagination effect: as the user scrolls, new items are rendered on demand
 * (virtualizer only mounts visible items + overscan buffer). DOM size stays constant
 * regardless of how many items are in the array.
 */
export function VirtualScrollList<T>({
  items,
  itemHeight = 52,
  containerHeight = 300,
  renderItem,
  overscan = 5,
  className = "",
  emptyState,
}: VirtualScrollListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan,
  });

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      ref={parentRef}
      style={{ height: containerHeight, overflowY: "auto" }}
      className={`scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent ${className}`}
    >
      {/* totalSize is the full virtual height — keeps scrollbar accurate */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((vItem) => (
          <div
            key={vItem.key}
            data-index={vItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vItem.start}px)`,
            }}
          >
            {renderItem(items[vItem.index], vItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
