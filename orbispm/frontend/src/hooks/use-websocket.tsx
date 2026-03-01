"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import type { DomainEvent } from "@/types/domain";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useWebSocket() {
  const esRef = useRef<EventSource | null>(null);
  const qc = useQueryClient();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const reconnectTimeout = useRef<NodeJS.Timeout>(undefined);
  const retryCount = useRef(0);

  const connect = useCallback(() => {
    if (!isAuthenticated || !currentOrg) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    // Close existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      const url = `${API_BASE}/api/v1/orgs/${currentOrg.id}/events/stream?token=${token}`;
      const es = new EventSource(url);

      es.onopen = () => {
        console.log("[SSE] Connected");
        retryCount.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const data: DomainEvent = JSON.parse(event.data);
          handleEvent(data, qc);
        } catch {
          // ignore non-JSON messages
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Exponential backoff: 5s, 10s, 20s, 30s max
        const delay = Math.min(5000 * Math.pow(2, retryCount.current), 30000);
        retryCount.current++;
        if (retryCount.current <= 10) {
          console.log(`[SSE] Disconnected, reconnecting in ${delay / 1000}s...`);
          reconnectTimeout.current = setTimeout(connect, delay);
        } else {
          console.log("[SSE] Max retries reached, stopping reconnection");
        }
      };

      esRef.current = es;
    } catch {
      // EventSource not supported or connection failed
      const delay = Math.min(5000 * Math.pow(2, retryCount.current), 30000);
      retryCount.current++;
      if (retryCount.current <= 10) {
        reconnectTimeout.current = setTimeout(connect, delay);
      }
    }
  }, [isAuthenticated, currentOrg, qc]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (esRef.current) esRef.current.close();
    };
  }, [connect]);
}

function handleEvent(event: DomainEvent, qc: ReturnType<typeof useQueryClient>) {
  const type = event.type;

  // Invalidate relevant queries based on event type
  if (type.startsWith("task.")) {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["task-tree"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  if (type.startsWith("project.")) {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  if (type.startsWith("team.")) {
    qc.invalidateQueries({ queryKey: ["teams"] });
  }

  if (type.startsWith("member.")) {
    qc.invalidateQueries({ queryKey: ["org-members"] });
  }

  if (type.startsWith("comment.")) {
    qc.invalidateQueries({ queryKey: ["comments"] });
  }

  if (type.startsWith("notification.")) {
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  // Always refresh activity
  qc.invalidateQueries({ queryKey: ["activity"] });
}

// Provider component to mount SSE connection
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  return <>{children}</>;
}
