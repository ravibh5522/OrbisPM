"use client";

import { useChatStore } from "@/stores/chat-store";
import { useProjectTaskStore } from "@/stores/project-task-store";
import type { ChatMessage, DomainEvent } from "@/types/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type PendingReq = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Connects a single org-level WebSocket that handles:
 * 1. Task operations via project:join/leave rooms
 * 2. Org-wide events (replaces SSE) via event bus forwarding
 *
 * Mount once in OrgLayout.
 */
export function useOrgSocket(orgId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingReq>>(new Map());
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const unmountedRef = useRef(false);
  const connGenRef = useRef(0);
  const qc = useQueryClient();
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
    if (!orgId || unmountedRef.current) return;

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    if (!token) return;

    // Close existing
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Track connection generation to prevent stale onclose handlers
    const gen = ++connGenRef.current;

    const wsUrl = `${API_BASE.replace(/^http/, "ws")}/api/v1/orgs/${orgId}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (connGenRef.current !== gen) {
        ws.close();
        return;
      }
      console.log("[WS] Connected to org");
      retryRef.current = 0;
      store.getState().setConnected(true);
      store.getState().setRawSend(send);
    };

    ws.onmessage = (event) => {
      if (connGenRef.current !== gen) return;
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg, pendingRef.current, qc);
      } catch {
        // ignore non-JSON
      }
    };

    ws.onclose = () => {
      // Ignore stale connection close events
      if (connGenRef.current !== gen) return;
      console.log("[WS] Disconnected");
      store.getState().setConnected(false);
      store.getState().setRawSend(null);
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
  }, [orgId, send, store, qc]);

  // ─── lifecycle ────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
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
}

// ═══════════════════════════════════════
//  Message routing
// ═══════════════════════════════════════

function handleMessage(
  msg: {
    id?: string;
    action: string;
    payload?: any;
    error?: string;
    actor_id?: string;
  },
  pending: Map<string, PendingReq>,
  qc: ReturnType<typeof useQueryClient>,
) {
  const store = useProjectTaskStore.getState();

  // 1. Request/response correlation
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

  // 2. Org-level events from event bus → invalidate React Query
  if (msg.action.startsWith("event:")) {
    handleOrgEvent(msg.payload, qc);
    return;
  }

  // 3. Project-room broadcasts → update task store + sync QueryClient
  handleProjectBroadcast(msg, store, qc);
}

// ═══════════════════════════════════════
//  Org events (replaces SSE handleEvent)
// ═══════════════════════════════════════

function handleOrgEvent(
  event: DomainEvent | undefined,
  qc: ReturnType<typeof useQueryClient>,
) {
  if (!event) return;
  const type = event.type;
  const orgId = event.org_id;

  // Tasks — invalidate dashboard stats + my-tasks (user may be assignee)
  if (type.startsWith("task.")) {
    qc.invalidateQueries({ queryKey: ["dashboard-stats", orgId] });
    qc.invalidateQueries({ queryKey: ["analytics-dashboard", orgId] });
    qc.invalidateQueries({ queryKey: ["my-tasks", orgId] });
    if (event.payload?.project_id) {
      qc.invalidateQueries({
        queryKey: ["project-dashboard", orgId, event.payload.project_id],
      });
      // Invalidate task detail if we have the entity_id (task_id)
      if (event.entity_id) {
        qc.invalidateQueries({
          queryKey: ["task", orgId, event.payload.project_id, event.entity_id],
        });
        qc.invalidateQueries({
          queryKey: ["tasks", orgId, event.payload.project_id],
        });
      }
    }
  }

  // Checklists — invalidate task-scoped checklist queries
  if (type.startsWith("checklist.")) {
    const taskId = event.entity_id || event.payload?.task_id;
    const projectId = event.payload?.project_id;
    if (taskId) {
      qc.invalidateQueries({
        queryKey: ["checklists", orgId, projectId, taskId].filter(Boolean),
      });
    }
    // Also invalidate task detail since checklist progress affects task
    if (taskId && projectId) {
      qc.invalidateQueries({
        queryKey: ["task", orgId, projectId, taskId],
      });
    }
  }

  // Comments — invalidate task-scoped comment queries
  if (type.startsWith("comment.")) {
    const taskId = event.entity_id || event.payload?.task_id;
    const projectId = event.payload?.project_id;
    if (taskId) {
      qc.invalidateQueries({
        queryKey: ["comments", orgId, projectId, taskId].filter(Boolean),
      });
    }
  }

  // Dependencies — invalidate task-scoped dependency queries
  if (type.startsWith("dependency.")) {
    const taskId = event.entity_id || event.payload?.task_id;
    const projectId = event.payload?.project_id;
    if (taskId) {
      qc.invalidateQueries({
        queryKey: ["dependencies", orgId, projectId, taskId].filter(Boolean),
      });
    }
  }

  // Projects
  if (type.startsWith("project.")) {
    qc.invalidateQueries({ queryKey: ["projects", orgId] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats", orgId] });
    qc.invalidateQueries({ queryKey: ["analytics-dashboard", orgId] });
    qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
    if (event.entity_id) {
      qc.invalidateQueries({ queryKey: ["project", orgId, event.entity_id] });
      qc.invalidateQueries({
        queryKey: ["project-dashboard", orgId, event.entity_id],
      });
    }
  }

  // Teams
  if (type.startsWith("team.")) {
    qc.invalidateQueries({ queryKey: ["teams", orgId] });
    qc.invalidateQueries({ queryKey: ["teams-all", orgId] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats", orgId] });
    qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
    if (event.entity_id) {
      qc.invalidateQueries({ queryKey: ["team", orgId, event.entity_id] });
      qc.invalidateQueries({
        queryKey: ["team-dashboard", orgId, event.entity_id],
      });
      qc.invalidateQueries({
        queryKey: ["team-members", orgId, event.entity_id],
      });
    }
  }

  // Members — use orgId from URL context (event.org_id may be stale on some backends)
  if (type.startsWith("member.")) {
    const scope = event.payload?.scope as string | undefined;
    qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    if (scope === "team") {
      // Invalidate all team-members and team-dashboard regardless of which team
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["team-dashboard"] });
      qc.invalidateQueries({ queryKey: ["teams", orgId] });
    }
    if (scope === "project") {
      qc.invalidateQueries({ queryKey: ["project-members"] });
      qc.invalidateQueries({ queryKey: ["project-dashboard"] });
    }
    if (type === "member.role_updated") {
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
    }
  }

  // Notifications
  if (type.startsWith("notification.")) {
    qc.invalidateQueries({ queryKey: ["notifications", orgId] });
  }

  // Announcements — invalidate all announcement queries (project-scoped keys vary)
  if (type.startsWith("announcement.")) {
    qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  // Change requests — invalidate dashboard + my-tasks on approval
  if (type.startsWith("change_request.")) {
    qc.invalidateQueries({ queryKey: ["dashboard-stats", orgId] });
    qc.invalidateQueries({ queryKey: ["my-tasks", orgId] });
    if (event.payload?.project_id) {
      qc.invalidateQueries({
        queryKey: ["project-dashboard", orgId, event.payload.project_id],
      });
    }
  }

  // Activity — only invalidate on actual mutations, not reads
  if (
    type.includes(".created") ||
    type.includes(".updated") ||
    type.includes(".deleted")
  ) {
    qc.invalidateQueries({ queryKey: ["activity", orgId] });
  }

  // Chat events (forwarded from messaging-service via Redis)
  // This ensures users get chat notifications even when not on the messages page
  if (type.startsWith("message.")) {
    const chatStore = useChatStore.getState();
    if (type === "message.created") {
      const data = event.payload?.data as ChatMessage | undefined;
      const msg = data ?? (event.payload as unknown as ChatMessage);
      if (msg?.channel_id) {
        chatStore.appendMessage(msg.channel_id, msg);
        chatStore.updateChannel({
          id: msg.channel_id,
          last_message: msg.body,
          last_activity: msg.created_at,
        } as never);
        if (chatStore.activeChannelId !== msg.channel_id) {
          chatStore.incrementUnread(msg.channel_id);
        }
      }
    } else if (type === "message.edited") {
      const msg = (event.payload?.data ??
        event.payload) as unknown as ChatMessage;
      if (msg?.channel_id) chatStore.updateMessage(msg.channel_id, msg);
    } else if (type === "message.deleted") {
      const msg = (event.payload?.data ??
        event.payload) as unknown as ChatMessage;
      if (msg?.channel_id) chatStore.removeMessage(msg.channel_id, msg.id);
    }
    // Invalidate sidebar data so unread counts refresh
    qc.invalidateQueries({ queryKey: ["chat-channels", orgId] });
    qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
  }
}

// ═══════════════════════════════════════
//  Project broadcasts (same as old handleMessage)
// ═══════════════════════════════════════

function handleProjectBroadcast(
  msg: { action: string; payload?: any; actor_id?: string },
  store: ReturnType<typeof useProjectTaskStore.getState>,
  qc: ReturnType<typeof useQueryClient>,
) {
  const p = msg.payload || {};

  switch (msg.action) {
    case "connected":
      store.setConnected(true, p.org_size);
      break;

    // ─── Task broadcasts ────
    case "task:created": {
      const task = p.task ?? p;
      if (task?.id) {
        const parentKey = task.parent_task_id || "root";
        const existing = store.tasks.get(parentKey);
        if (existing && !existing.find((t: any) => t.id === task.id)) {
          store.setTasks(
            parentKey,
            [...existing, task],
            (store.totals.get(parentKey) ?? 0) + 1,
          );
        }
      }
      break;
    }
    case "task:updated": {
      const task = p.task ?? p;
      if (task?.id) {
        store.upsertTask(task);
        // Sync to QueryClient for task detail page
        if (task.project_id) {
          qc.invalidateQueries({
            queryKey: ["task", task.org_id, task.project_id, task.id],
          });
        }
      }
      break;
    }
    case "task:conflict": {
      // Version conflict detected — the server state has the latest version
      const serverTask = p.server_state;
      if (serverTask?.id) {
        // Update our local state with the server's authoritative version
        store.upsertTask(serverTask);
      }
      console.warn("[ws] task:conflict", {
        task_id: p.task_id,
        server_version: p.server_version,
        resolution: p.resolution,
      });
      break;
    }
    case "task:deleted": {
      if (p.task_id) store.removeTask(p.task_id);
      break;
    }
    case "task:bulk-updated": {
      const tasks = Array.isArray(p) ? p : (p.data ?? []);
      store.bulkUpsertTasks(tasks);
      break;
    }
    case "task:bulk-created": {
      const tasks: any[] = Array.isArray(p) ? p : (p.data ?? []);
      for (const task of tasks) {
        if (task?.id) {
          const parentKey = task.parent_task_id || "root";
          const existing = store.tasks.get(parentKey);
          if (existing && !existing.find((t: any) => t.id === task.id)) {
            store.setTasks(
              parentKey,
              [...existing, task],
              (store.totals.get(parentKey) ?? 0) + 1,
            );
          }
        }
      }
      break;
    }
    case "task:reordered":
      break; // Trigger re-fetch from server

    // ─── Checklist broadcasts ────
    case "checklist:created":
      if (p.task_id && p.item) {
        store.addChecklist(p.task_id, p.item);
        qc.invalidateQueries({ queryKey: ["checklists"], exact: false });
      }
      break;
    case "checklist:updated":
      if (p.task_id && p.item) {
        store.updateChecklist(p.task_id, p.item.id, p.item);
        qc.invalidateQueries({ queryKey: ["checklists"], exact: false });
      }
      break;
    case "checklist:deleted":
      if (p.task_id && p.id) {
        store.removeChecklist(p.task_id, p.id);
        qc.invalidateQueries({ queryKey: ["checklists"], exact: false });
      }
      break;

    // ─── Comment broadcasts ────
    case "comment:created":
      if (p.task_id && p.item) {
        store.addComment(p.task_id, p.item);
        qc.invalidateQueries({ queryKey: ["comments"], exact: false });
      }
      break;
    case "comment:deleted":
      if (p.task_id && p.id) {
        store.removeComment(p.task_id, p.id);
        qc.invalidateQueries({ queryKey: ["comments"], exact: false });
      }
      break;

    // ─── Dependency broadcasts ────
    case "dependency:added":
      if (p.task_id) {
        store.addDependency(p.task_id, {
          task_id: p.task_id,
          depends_on_id: p.depends_on_id,
          type: p.type,
        });
        qc.invalidateQueries({ queryKey: ["dependencies"], exact: false });
      }
      break;
    case "dependency:removed":
      if (p.task_id && p.depends_on_id) {
        store.removeDependency(p.task_id, p.depends_on_id);
        qc.invalidateQueries({ queryKey: ["dependencies"], exact: false });
      }
      break;

    // ─── Change request broadcasts ────
    case "cr:approved": {
      // Task was updated by approval — upsert if we have the task data
      const task = p.task ?? p;
      if (task?.task_id) {
        // CR payload has task_id; the task:updated broadcast will handle the actual task upsert
      }
      // Invalidate change request lists so components re-fetch
      store.setChangeRequests(p.task_id, []);
      break;
    }
    case "cr:rejected": {
      // No task change, just invalidate CR lists
      store.setChangeRequests(p.task_id, []);
      break;
    }
  }
}
