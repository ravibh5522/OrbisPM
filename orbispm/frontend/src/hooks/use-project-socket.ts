"use client";

import { useEffect, useRef, useCallback } from "react";
import { useProjectTaskStore } from "@/stores/project-task-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type PendingReq = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let _send: ((action: string, payload?: Record<string, any>) => Promise<any>) | null = null;

/**
 * Get the global WS send function (available after useProjectSocket mounts).
 * Returns null if not connected yet.
 */
export function getProjectSend() {
  return _send;
}

/**
 * Connects a bi-directional WebSocket to a project room.
 * Handles reconnect, request/response correlation, and broadcasts.
 *
 * Call once in the project page.
 */
export function useProjectSocket(orgId: string | undefined, projectId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingReq>>(new Map());
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unmountedRef = useRef(false);

  const store = useProjectTaskStore;

  // ─── send: action → Promise<payload> ──────────

  const send = useCallback(
    (action: string, payload?: Record<string, any>): Promise<any> => {
      return new Promise((resolve, reject) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket not connected"));
          return;
        }

        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error(`WS timeout for ${action}`));
        }, 30_000);

        pendingRef.current.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, action, payload: payload ?? {} }));
      });
    },
    [],
  );

  // ─── connect ──────────────────────────────────

  const connect = useCallback(() => {
    if (!orgId || !projectId || unmountedRef.current) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;

    // Close existing
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${API_BASE.replace(/^http/, "ws")}/api/v1/orgs/${orgId}/projects/${projectId}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected to project room");
      retryRef.current = 0;
      store.getState().setConnected(true);
      store.getState().setSend(send);
      _send = send;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg, pendingRef.current);
      } catch {
        // ignore non-JSON
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      store.getState().setConnected(false);
      store.getState().setSend(null);
      _send = null;
      wsRef.current = null;

      if (unmountedRef.current) return;
      const delay = Math.min(2000 * Math.pow(2, retryRef.current), 30_000);
      retryRef.current++;
      if (retryRef.current <= 15) {
        console.log(`[WS] Reconnecting in ${delay / 1000}s...`);
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [orgId, projectId, send, store]);

  // ─── lifecycle ────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      _send = null;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      // Drain pending
      for (const [, p] of pendingRef.current) {
        clearTimeout(p.timer);
        p.reject(new Error("WebSocket closed"));
      }
      pendingRef.current.clear();
      if (wsRef.current) wsRef.current.close();
      store.getState().reset();
    };
  }, [connect, store]);

  return { send, connected: useProjectTaskStore((s) => s.connected) };
}

// ─── Message handler ───────────────────────────
function handleMessage(
  msg: { id?: string; action: string; payload?: any; error?: string; actor_id?: string },
  pending: Map<string, PendingReq>,
) {
  const store = useProjectTaskStore.getState();

  // 1. If it has a request ID, match to pending request
  if (msg.id && pending.has(msg.id)) {
    const req = pending.get(msg.id)!;
    pending.delete(msg.id);
    clearTimeout(req.timer);

    if (msg.error) {
      req.reject(new Error(msg.error));
    } else {
      req.resolve(msg.payload);
    }
    return;
  }

  // 2. Broadcast from another user — apply to local state
  const p = msg.payload || {};

  switch (msg.action) {
    case "connected":
      store.setConnected(true, p.room_size);
      break;

    // ─── Task broadcasts ────
    case "task:created": {
      const task = p.task ?? p;
      if (task?.id) {
        // Add to any "root" or parent list that matches
        const parentKey = task.parent_task_id || "root";
        const existing = store.tasks.get(parentKey);
        if (existing) {
          store.setTasks(parentKey, [...existing, task], (store.totals.get(parentKey) ?? 0) + 1);
        }
      }
      break;
    }
    case "task:updated": {
      const task = p.task ?? p;
      if (task?.id) store.upsertTask(task);
      break;
    }
    case "task:deleted": {
      if (p.task_id) store.removeTask(p.task_id);
      break;
    }
    case "task:bulk-updated": {
      const tasks = Array.isArray(p) ? p : p.data ?? [];
      store.bulkUpsertTasks(tasks);
      break;
    }
    case "task:reordered":
      // Trigger a re-fetch from the server for reordering
      break;

    // ─── Checklist broadcasts ────
    case "checklist:created":
      if (p.task_id && p.item) store.addChecklist(p.task_id, p.item);
      break;
    case "checklist:updated":
      if (p.task_id && p.item) store.updateChecklist(p.task_id, p.item.id, p.item);
      break;
    case "checklist:deleted":
      if (p.task_id && p.id) store.removeChecklist(p.task_id, p.id);
      break;

    // ─── Comment broadcasts ────
    case "comment:created":
      if (p.task_id && p.item) store.addComment(p.task_id, p.item);
      break;
    case "comment:deleted":
      if (p.task_id && p.id) store.removeComment(p.task_id, p.id);
      break;

    // ─── Dependency broadcasts ────
    case "dependency:added":
      if (p.task_id) {
        store.addDependency(p.task_id, {
          task_id: p.task_id,
          depends_on_id: p.depends_on_id,
          type: p.type,
        });
      }
      break;
    case "dependency:removed":
      if (p.task_id && p.depends_on_id) store.removeDependency(p.task_id, p.depends_on_id);
      break;

    // ─── Change request broadcasts ────
    case "cr:approved":
    case "cr:rejected":
      // These modify task state too; components should re-fetch
      break;
  }
}
