"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const FLUSH_INTERVAL = 10_000; // 10 seconds
const MAX_BATCH_SIZE = 50;

interface TelemetryEvent {
  type: "page_view" | "feature_usage" | "error" | "session_end";
  path?: string;
  feature?: string;
  action?: string;
  error_type?: string;
  value?: number;
}

let eventQueue: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionStart: number | null = null;

function flush(): void {
  if (eventQueue.length === 0) return;

  const batch = eventQueue.splice(0, MAX_BATCH_SIZE);

  // Fire-and-forget — we don't await or retry
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  fetch(`${API_BASE}/api/v1/telemetry/events`, {
    method: "POST",
    headers,
    body: JSON.stringify({ events: batch }),
    keepalive: true, // survive page unload
  }).catch(() => {
    // silently discard on failure
  });
}

/** Start the telemetry flush loop. Call once on app mount. */
export function initTelemetry(): void {
  if (flushTimer !== null) return;
  sessionStart = Date.now();

  flushTimer = setInterval(flush, FLUSH_INTERVAL);

  // Flush remaining events on page unload + send session_end
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (sessionStart) {
        const duration = (Date.now() - sessionStart) / 1000;
        eventQueue.push({ type: "session_end", value: duration });
      }
      flush();
    });
  }
}

/** Stop the telemetry flush loop. */
export function stopTelemetry(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush();
}

/** Track a page view. */
export function trackPageView(path: string): void {
  eventQueue.push({ type: "page_view", path });

  // Flush immediately if batch is large
  if (eventQueue.length >= MAX_BATCH_SIZE) flush();
}

/** Track feature usage (e.g., "task_board", "kanban", "calendar", "chat"). */
export function trackFeatureUsage(
  feature: string,
  action: string = "click",
): void {
  eventQueue.push({ type: "feature_usage", feature, action });
}

/** Track a client-side error. */
export function trackError(errorType: string): void {
  eventQueue.push({ type: "error", error_type: errorType });
}
