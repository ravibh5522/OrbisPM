"use client";

import { cn } from "@/lib/utils";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POPUP_W = 288;
const POPUP_H = 340;
const MARGIN = 8;

interface DatePickerProps {
  /** Date as "YYYY-MM-DD", or "" for none. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Show the Clear button (default true). */
  clearable?: boolean;
  min?: string;
  max?: string;
}

function toDate(v: string): Date | null {
  if (!v) return null;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Date field whose calendar always stays inside the viewport. The popup is
 * rendered in a portal (so clipping/overflow of side panels can't cut it off)
 * and flips above/below and clamps left/right based on the available space.
 */
export function DatePicker({
  value,
  onChange,
  disabled,
  className,
  placeholder = "Select date",
  clearable = true,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => toDate(value) ?? new Date());
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = toDate(value);
  const minD = toDate(min ?? "");
  const maxD = toDate(max ?? "");

  const reposition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = popRef.current?.offsetHeight || POPUP_H;
    const w = Math.min(POPUP_W, vw - MARGIN * 2);

    let left = r.left;
    if (left + w > vw - MARGIN) left = r.right - w; // align to the right edge instead
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    const below = vh - r.bottom - MARGIN;
    const above = r.top - MARGIN;
    let top: number;
    if (below >= h || below >= above) top = r.bottom + 4; // prefer below
    else top = r.top - h - 4; // flip above
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, view, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, reposition]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(view)),
    end: endOfWeek(endOfMonth(view)),
  });

  const pick = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  };
  const outOfRange = (d: Date) => (minD && d < minD) || (maxD && d > maxD);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        onClick={() => {
          setView(selected ?? new Date());
          setOpen((o) => !o);
        }}
        className={cn(
          "input input-bordered flex w-full items-center justify-between gap-2 text-left",
          !selected && "text-base-content/50",
          className,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate">
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </span>
        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="Choose date"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: Math.min(POPUP_W, window.innerWidth - MARGIN * 2),
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-[1000] rounded-xl border border-base-300 bg-base-100 p-3 text-base-content shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                onClick={() => setView((v) => addMonths(v, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">
                {format(view, "MMMM yyyy")}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                onClick={() => setView((v) => addMonths(v, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-base-content/50">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-y-1">
              {days.map((d) => {
                const isSel = selected && isSameDay(d, selected);
                const isToday = isSameDay(d, new Date());
                return (
                  <button
                    type="button"
                    key={d.toISOString()}
                    disabled={!!outOfRange(d)}
                    onClick={() => pick(d)}
                    className={cn(
                      "mx-auto h-8 w-8 rounded-lg text-sm transition-colors",
                      !isSameMonth(d, view) && "text-base-content/30",
                      isToday && !isSel && "ring-1 ring-primary/60",
                      isSel
                        ? "bg-primary text-primary-content"
                        : "hover:bg-base-200",
                      outOfRange(d) && "cursor-not-allowed opacity-30",
                    )}
                  >
                    {format(d, "d")}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-base-200 pt-2 text-xs">
              {clearable ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="btn btn-ghost btn-xs text-primary"
                onClick={() => pick(new Date())}
              >
                Today
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
