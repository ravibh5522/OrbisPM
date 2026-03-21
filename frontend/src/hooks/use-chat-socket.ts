"use client";

import { useChatStore } from "@/stores/chat-store";
import type { ChatMessage } from "@/types/domain";
import { useCallback, useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Connects to the messaging-service WebSocket via Kong at /ws/chat.
 * Handles channel:join/leave, event routing (message.created, typing, etc.),
 * and request/response correlation.
 *
 * Mount once in the messages page layout.
 */
export function useChatSocket(orgId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<
    Map<
      string,
      {
        resolve: (data: unknown) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >
  >(new Map());
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unmountedRef = useRef(false);
  const store = useChatStore;

  const send = useCallback(
    (action: string, payload?: Record<string, unknown>): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("Chat WS not connected"));
          return;
        }
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error(`Chat WS timeout: ${action}`));
        }, 15_000);
        pendingRef.current.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, action, payload: payload ?? {} }));
      });
    },
    [],
  );

  const connect = useCallback(() => {
    if (!orgId || unmountedRef.current) return;
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    if (!token) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${API_BASE.replace(/^http/, "ws")}/ws/chat?token=${encodeURIComponent(token)}&org_id=${orgId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      retryRef.current = 0;
      store.getState().setConnected(true);
      store.getState().setWs(ws);
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
      store.getState().setConnected(false);
      store.getState().setWs(null);
      wsRef.current = null;

      if (unmountedRef.current) return;
      const delay = Math.min(2000 * Math.pow(2, retryRef.current), 30_000);
      retryRef.current++;
      if (retryRef.current <= 15) {
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [orgId, store]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      for (const [, p] of pendingRef.current) {
        clearTimeout(p.timer);
        p.reject(new Error("Chat WS closed"));
      }
      pendingRef.current.clear();
      if (wsRef.current) wsRef.current.close();
      store.getState().setConnected(false);
      store.getState().setWs(null);
    };
  }, [connect, store]);

  return { send };
}

// ──────────────────────────────────────────────

type PendingReq = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function handleMessage(
  msg: {
    id?: string;
    action: string;
    payload?: unknown;
    error?: string;
    actor_id?: string;
  },
  pending: Map<string, PendingReq>,
) {
  const store = useChatStore.getState();

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

  // 2. Real-time event broadcasts
  const payload = msg.payload as Record<string, unknown> | undefined;
  if (!payload) return;

  switch (msg.action) {
    case "event:message.created": {
      const m = payload as unknown as ChatMessage;
      if (m.channel_id) {
        store.appendMessage(m.channel_id, m);
        // If this message is a thread reply, append to thread too
        if (
          m.parent_message_id &&
          m.parent_message_id === store.threadParentId
        ) {
          store.appendThreadMessage(m);
        }
        // Update channel last_message and bump it
        store.updateChannel({
          id: m.channel_id,
          last_message: m.body,
          last_activity: m.created_at,
        } as never);
        // Increment unread if not the active channel
        if (store.activeChannelId !== m.channel_id) {
          store.incrementUnread(m.channel_id);
        }
      }
      break;
    }
    case "event:message.edited": {
      const m = payload as unknown as ChatMessage;
      if (m.channel_id) {
        store.updateMessage(m.channel_id, m);
      }
      break;
    }
    case "event:message.deleted": {
      const m = payload as unknown as ChatMessage;
      if (m.channel_id) {
        store.removeMessage(m.channel_id, m.id);
      }
      break;
    }
    case "event:typing.start": {
      const t = payload as { channel_id: string; user_id: string };
      store.setTyping(t.channel_id, t.user_id, true);
      // Auto-clear after 5s
      setTimeout(() => {
        store.setTyping(t.channel_id, t.user_id, false);
      }, 5000);
      break;
    }
    case "event:typing.stop": {
      const t = payload as { channel_id: string; user_id: string };
      store.setTyping(t.channel_id, t.user_id, false);
      break;
    }
    case "event:reaction.added":
    case "event:reaction.removed": {
      // Refetch messages for simplicity since reaction data is complex
      break;
    }
    default:
      break;
  }
}
