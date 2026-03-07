"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useProjectTaskStore } from "@/stores/project-task-store";
import { Button } from "@/components/ui/button";
import { Play, Pause, StopCircle, Timer, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/domain";

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
      await send("task:update", { task_id: task.id, actual_hours: newHours });
      onUpdate?.();
    } catch {} finally { setSaving(false); }
  }, [send, task.id, onUpdate]);

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
    <div className="flex flex-col gap-2">
      {/* Timer display */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 p-3 rounded-lg border",
          state.isRunning
            ? "border-primary bg-primary/5"
            : "border-base-300 bg-base-100"
        )}
      >
        <div className="flex items-center gap-2">
          <Timer
            className={cn(
              "w-5 h-5",
              state.isRunning ? "text-primary animate-pulse" : "text-base-content/50"
            )}
          />
          <span
            className={cn(
              "font-mono text-xl",
              state.isRunning ? "text-primary" : "text-base-content"
            )}
          >
            {formatTime(displayMs)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Start/Pause button */}
          {state.isRunning ? (
            <Button variant="ghost" size="sm" onClick={pause} title="Pause">
              <Pause className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant={hasTime ? "ghost" : "primary"}
              size="sm"
              onClick={start}
              title="Start"
            >
              <Play className="w-4 h-4" />
            </Button>
          )}

          {/* Stop button (saves to actual_hours) */}
          {hasTime && (
            <Button
              variant="ghost"
              size="sm"
              onClick={stop}
              title="Stop and save time"
              loading={saving}
              className="text-success"
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          )}

          {/* Reset button */}
          {hasTime && !state.isRunning && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              title="Reset (discard time)"
              className="text-error"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Current hours display */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-base-content/60">Logged</span>
        <span className="font-mono">
          {(task.actual_hours || 0).toFixed(2)}h
          {task.estimated_hours && (
            <span className="text-base-content/40">
              {" "}/ {task.estimated_hours}h
            </span>
          )}
        </span>
      </div>

      {/* Progress bar */}
      {task.estimated_hours && task.estimated_hours > 0 && (
        <progress
          className="progress progress-primary w-full"
          value={task.actual_hours || 0}
          max={task.estimated_hours}
        />
      )}

      {/* Time breakdown info */}
      {hasTime && (
        <p className="text-xs text-base-content/50">
          Session: +{(displayMs / (1000 * 60 * 60)).toFixed(2)}h. Click{" "}
          <StopCircle className="w-3 h-3 inline-block text-success" /> to save to
          actual hours.
        </p>
      )}
    </div>
  );
}
