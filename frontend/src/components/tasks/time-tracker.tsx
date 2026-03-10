"use client";

import { cn } from "@/lib/utils";
import { useProjectTaskStore } from "@/stores/project-task-store";
import type { Task } from "@/types/domain";
import { Pause, Play, RotateCcw, StopCircle, Timer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════
   Time Tracking Timer Component
   ─────────────────────────────────────────────────────────
   Stores timer state in localStorage keyed by task ID.
   When stopped, adds elapsed time to task.actual_hours.
   ═══════════════════════════════════════════════════════ */

interface TimeTrackerProps {
  orgId: string;
  projectId: string;
  task: Task;
  /** Invoked when actual_hours is updated */
  onUpdate?: () => void;
}

interface TimerState {
  isRunning: boolean;
  startedAt: number | null;  // timestamp when timer started
  accumulatedMs: number;     // accumulated time from previous sessions
}

const STORAGE_KEY_PREFIX = "orbis_timer_";

function getStorageKey(taskId: string) {
  return `${STORAGE_KEY_PREFIX}${taskId}`;
}

function loadTimerState(taskId: string): TimerState {
  if (typeof window === "undefined") {
    return { isRunning: false, startedAt: null, accumulatedMs: 0 };
  }
  try {
    const stored = localStorage.getItem(getStorageKey(taskId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return { isRunning: false, startedAt: null, accumulatedMs: 0 };
}

function saveTimerState(taskId: string, state: TimerState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getStorageKey(taskId), JSON.stringify(state));
}

function clearTimerState(taskId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey(taskId));
}

export function TimeTracker({ orgId, projectId, task, onUpdate }: TimeTrackerProps) {
  const send = useProjectTaskStore((s) => s.send);
  const [state, setState] = useState<TimerState>(() => loadTimerState(task.id));
  const [displayMs, setDisplayMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate current elapsed time
  const calculateElapsed = useCallback(() => {
    if (state.isRunning && state.startedAt) {
      return state.accumulatedMs + (Date.now() - state.startedAt);
    }
    return state.accumulatedMs;
  }, [state.isRunning, state.startedAt, state.accumulatedMs]);

  // Update display every second while running
  useEffect(() => {
    if (state.isRunning) {
      setDisplayMs(calculateElapsed());
      intervalRef.current = setInterval(() => {
        setDisplayMs(calculateElapsed());
      }, 1000);
    } else {
      setDisplayMs(state.accumulatedMs);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [state.isRunning, state.startedAt, state.accumulatedMs, calculateElapsed]);

  const saveActualHours = useCallback(async (newHours: number) => {
    if (!send) return;
    setSaving(true);
    try {
      await send("task:update", {
        task_id: task.id,
        base_version: task.version ?? 0,
        actual_hours: newHours,
      });
      onUpdate?.();
    } catch {} finally { setSaving(false); }
  }, [send, task.id, task.version, onUpdate]);

  const start = useCallback(() => {
    const newState: TimerState = {
      isRunning: true,
      startedAt: Date.now(),
      accumulatedMs: state.accumulatedMs,
    };
    setState(newState);
    saveTimerState(task.id, newState);
  }, [task.id, state.accumulatedMs]);

  const pause = useCallback(() => {
    const elapsed = calculateElapsed();
    const newState: TimerState = {
      isRunning: false,
      startedAt: null,
      accumulatedMs: elapsed,
    };
    setState(newState);
    saveTimerState(task.id, newState);
  }, [task.id, calculateElapsed]);

  const stop = useCallback(() => {
    const elapsed = calculateElapsed();
    const hoursToAdd = elapsed / (1000 * 60 * 60); // convert ms to hours
    const currentHours = task.actual_hours || 0;
    const newHours = Math.round((currentHours + hoursToAdd) * 100) / 100;

    // Update task and clear timer state
    saveActualHours(newHours);
    clearTimerState(task.id);
    setState({ isRunning: false, startedAt: null, accumulatedMs: 0 });
  }, [task.id, task.actual_hours, calculateElapsed, saveActualHours]);

  const reset = useCallback(() => {
    clearTimerState(task.id);
    setState({ isRunning: false, startedAt: null, accumulatedMs: 0 });
  }, [task.id]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const hasTime = displayMs > 0;

  return (
    <div className="flex flex-col gap-1">
      {/* Compact timer row */}
      <div
        className={cn(
          "flex items-center justify-between gap-1.5 px-2 py-1 rounded border text-xs",
          state.isRunning
            ? "border-primary bg-primary/5"
            : "border-base-300 bg-base-100"
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Timer
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              state.isRunning ? "text-primary animate-pulse" : "text-base-content/50"
            )}
          />
          <span
            className={cn(
              "font-mono text-sm",
              state.isRunning ? "text-primary" : "text-base-content"
            )}
          >
            {formatTime(displayMs)}
          </span>
          <span className="text-base-content/40 truncate">
            {(task.actual_hours || 0).toFixed(1)}h
            {task.estimated_hours ? ` / ${task.estimated_hours}h` : ""}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {state.isRunning ? (
            <button className="btn btn-ghost btn-xs btn-square" onClick={pause} title="Pause">
              <Pause className="w-3 h-3" />
            </button>
          ) : (
            <button className={cn("btn btn-xs btn-square", hasTime ? "btn-ghost" : "btn-primary")} onClick={start} title="Start">
              <Play className="w-3 h-3" />
            </button>
          )}
          {hasTime && (
            <button className="btn btn-ghost btn-xs btn-square text-success" onClick={stop} title="Stop & save" disabled={saving}>
              <StopCircle className="w-3 h-3" />
            </button>
          )}
          {hasTime && !state.isRunning && (
            <button className="btn btn-ghost btn-xs btn-square text-error" onClick={reset} title="Reset">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Thin progress bar */}
      {task.estimated_hours && task.estimated_hours > 0 && (
        <progress
          className="progress progress-primary w-full h-1"
          value={task.actual_hours || 0}
          max={task.estimated_hours}
        />
      )}
    </div>
  );
}
