"use client";

import { useChatStore } from "@/stores/chat-store";
import type { ChatChannel, ChatMessage } from "@/types/domain";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { API_BASE } from "@/lib/api-base";

// Shared so the module-level handleMessage() can invalidate react-query caches
// (pins, sidebar, members) for live propagation of events from other users.
let sharedQueryClient: QueryClient | null = null;

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
  const connGenRef = useRef(0);
  const store = useChatStore;
  sharedQueryClient = useQueryClient();

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

    // Track connection generation to prevent stale onclose handlers
    const gen = ++connGenRef.current;

    const wsUrl = `${API_BASE.replace(/^http/, "ws")}/ws/chat?token=${encodeURIComponent(token)}&org_id=${orgId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (connGenRef.current !== gen) {
        ws.close();
        return;
      }
      retryRef.current = 0;
      store.getState().setConnected(true);
      store.getState().setWs(ws);
    };

    ws.onmessage = (event) => {
      if (connGenRef.current !== gen) return;
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg, pendingRef.current);
      } catch {
        // ignore non-JSON
      }
    };

    ws.onclose = () => {
      // Ignore stale connection close events
      if (connGenRef.current !== gen) return;
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
        if (m.parent_message_id) {
          // Thread reply — belongs in the thread, NOT the main channel list.
          if (m.parent_message_id === store.threadParentId) {
            store.appendThreadMessage(m);
          }
          // Bump the parent's reply count in the main list.
          const msgs = store.messages.get(m.channel_id);
          const parent = msgs?.find((x) => x.id === m.parent_message_id);
          if (parent) {
            store.updateMessage(m.channel_id, {
              ...parent,
              thread_count: (parent.thread_count || 0) + 1,
            });
          }
        } else {
          store.appendMessage(m.channel_id, m);
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
          // The sidebar renders unread/last-message/order from the sidebar query,
          // not the store — refresh it so the unread badge/preview update live.
          sharedQueryClient?.invalidateQueries({ queryKey: ["chat-sidebar"] });
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
    case "event:reaction.added": {
      const r = payload as {
        channel_id?: string;
        entity_id?: string;
        emoji?: string;
        user_id?: string;
      };
      if (r.channel_id && r.entity_id && r.emoji && r.user_id) {
        const messages = store.messages.get(r.channel_id);
        const target = messages?.find((m) => m.id === r.entity_id);
        if (target) {
          const reactions = [...(target.reactions ?? [])];
          const existing = reactions.find((rx) => rx.emoji === r.emoji);
          if (existing) {
            if (!existing.users.includes(r.user_id)) {
              existing.users = [...existing.users, r.user_id];
              existing.count += 1;
            }
          } else {
            reactions.push({ emoji: r.emoji, count: 1, users: [r.user_id] });
          }
          store.updateMessage(r.channel_id, { ...target, reactions });
        }
      }
      break;
    }
    case "event:reaction.removed": {
      const r = payload as {
        channel_id?: string;
        entity_id?: string;
        emoji?: string;
        user_id?: string;
      };
      if (r.channel_id && r.entity_id && r.emoji && r.user_id) {
        const messages = store.messages.get(r.channel_id);
        const target = messages?.find((m) => m.id === r.entity_id);
        if (target) {
          let reactions = [...(target.reactions ?? [])];
          const existing = reactions.find((rx) => rx.emoji === r.emoji);
          if (existing) {
            existing.users = existing.users.filter((u) => u !== r.user_id);
            existing.count = Math.max(0, existing.count - 1);
            reactions = reactions.filter((rx) => rx.count > 0);
          }
          store.updateMessage(r.channel_id, { ...target, reactions });
        }
      }
      break;
    }
    case "presence:online": {
      const p = payload as { user_id: string };
      if (p.user_id) {
        store.setUserOnline(p.user_id);
      }
      break;
    }
    case "presence:offline": {
      const p = payload as { user_id: string; last_seen?: string };
      if (p.user_id) {
        store.setUserOffline(
          p.user_id,
          p.last_seen || new Date().toISOString(),
        );
      }
      break;
    }
    // ── Live propagation: another user pinned / unpinned a message ──
    case "event:message.pinned":
    case "event:message.unpinned": {
      const p = payload as { channel_id?: string };
      if (p.channel_id) {
        sharedQueryClient?.invalidateQueries({
          queryKey: ["chat-pins", p.channel_id],
        });
      }
      break;
    }
    // ── Live propagation: channel created / renamed ──
    case "event:channel.created":
    case "event:channel.updated": {
      const ch = payload as unknown as ChatChannel;
      if (ch.id) {
        if (
          msg.action === "event:channel.created" &&
          !store.channels.some((c) => c.id === ch.id)
        ) {
          store.addChannel(ch);
        } else if (msg.action === "event:channel.updated") {
          store.updateChannel(ch);
        }
      }
      sharedQueryClient?.invalidateQueries({ queryKey: ["chat-sidebar"] });
      break;
    }
    // ── Live propagation: channel archived / deleted ──
    case "event:channel.archived":
    case "event:channel.deleted": {
      const p = payload as { channel_id?: string; entity_id?: string };
      const cid = p.channel_id || p.entity_id;
      if (cid) {
        store.removeChannel(cid);
        if (store.activeChannelId === cid) store.setActiveChannel(null);
      }
      sharedQueryClient?.invalidateQueries({ queryKey: ["chat-sidebar"] });
      break;
    }
    // ── Read receipts: mark a member's read position (drives seen-by) ──
    case "event:read_receipt.updated": {
      const p = payload as { channel_id?: string; user_id?: string };
      if (p.channel_id && p.user_id) {
        const members = store.channelMembers.get(p.channel_id);
        if (members) {
          const now = new Date().toISOString();
          store.setChannelMembers(
            p.channel_id,
            members.map((m) =>
              m.user_id === p.user_id ? { ...m, last_read_at: now } : m,
            ),
          );
        }
        sharedQueryClient?.invalidateQueries({
          queryKey: ["chat-channel-members", p.channel_id],
        });
      }
      break;
    }
    default:
      break;
  }
}
