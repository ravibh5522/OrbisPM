"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import type { DomainEvent } from "@/types/domain";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const qc = useQueryClient();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const reconnectTimeout = useRef<NodeJS.Timeout>(undefined);

  const connect = useCallback(() => {
    if (!isAuthenticated || !currentOrg) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(`${WS_BASE}/ws?token=${token}&org_id=${currentOrg.id}`);

      ws.onopen = () => {
        console.log("[WS] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data: DomainEvent = JSON.parse(event.data);
          handleEvent(data, qc, currentOrg.id);
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected, reconnecting in 5s...");
        reconnectTimeout.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // WebSocket not supported or connection failed
      reconnectTimeout.current = setTimeout(connect, 5000);
    }
  }, [isAuthenticated, currentOrg, qc]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);
}

function handleEvent(event: DomainEvent, qc: ReturnType<typeof useQueryClient>, orgId: string) {
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

// Provider component to mount WebSocket connection
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  return <>{children}</>;
}
