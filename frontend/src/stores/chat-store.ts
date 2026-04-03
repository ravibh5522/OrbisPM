import type {
  ChatChannel,
  ChatChannelMember,
  ChatMessage,
} from "@/types/domain";
import { create } from "zustand";

interface ChatState {
  // Channels
  channels: ChatChannel[];
  activeChannelId: string | null;
  channelMembers: Map<string, ChatChannelMember[]>;

  // Messages
  messages: Map<string, ChatMessage[]>;
  hasMore: Map<string, boolean>;

  // Thread
  threadParentId: string | null;
  threadMessages: ChatMessage[];

  // Typing
  typingUsers: Map<string, Set<string>>; // channelId -> set of userIds

  // UI
  detailsOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;

  // Presence — userId → { online, last_seen }
  presenceMap: Map<string, { online: boolean; last_seen?: string }>;

  // WebSocket
  connected: boolean;
  ws: WebSocket | null;

  // Actions – presence
  setPresenceMap: (
    map: Map<string, { online: boolean; last_seen?: string }>,
  ) => void;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string, lastSeen: string) => void;

  // Actions – channels
  setChannels: (channels: ChatChannel[]) => void;
  addChannel: (channel: ChatChannel) => void;
  updateChannel: (channel: ChatChannel) => void;
  removeChannel: (channelId: string) => void;
  setActiveChannel: (channelId: string | null) => void;
  setChannelMembers: (channelId: string, members: ChatChannelMember[]) => void;
  initFromStorage: () => void;
  decrementUnread: (channelId: string) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;

  // Actions – messages
  setMessages: (channelId: string, messages: ChatMessage[]) => void;
  prependMessages: (channelId: string, messages: ChatMessage[]) => void;
  appendMessage: (channelId: string, message: ChatMessage) => void;
  updateMessage: (channelId: string, message: ChatMessage) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  setHasMore: (channelId: string, has: boolean) => void;

  // Actions – thread
  openThread: (parentId: string) => void;
  closeThread: () => void;
  setThreadMessages: (messages: ChatMessage[]) => void;
  appendThreadMessage: (message: ChatMessage) => void;

  // Actions – typing
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;

  // Actions – UI
  toggleDetails: () => void;
  setDetailsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;

  // Actions – WebSocket
  setConnected: (connected: boolean) => void;
  setWs: (ws: WebSocket | null) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  channels: [],
  activeChannelId: null,
  channelMembers: new Map<string, ChatChannelMember[]>(),
  messages: new Map<string, ChatMessage[]>(),
  hasMore: new Map<string, boolean>(),
  threadParentId: null,
  threadMessages: [],
  typingUsers: new Map<string, Set<string>>(),
  presenceMap: new Map<string, { online: boolean; last_seen?: string }>(),
  detailsOpen: false,
  searchOpen: false,
  searchQuery: "",
  connected: false,
  ws: null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  // ── Channels ──────────────────────────────────
  setChannels: (channels) => set({ channels }),

  addChannel: (channel) => set((s) => ({ channels: [channel, ...s.channels] })),

  updateChannel: (channel) =>
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channel.id ? { ...c, ...channel } : c,
      ),
    })),

  removeChannel: (channelId) =>
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== channelId),
      activeChannelId:
        s.activeChannelId === channelId ? null : s.activeChannelId,
    })),

  setActiveChannel: (channelId) => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        if (channelId)
          window.localStorage.setItem("chat:activeChannelId", channelId);
        else window.localStorage.removeItem("chat:activeChannelId");
      }
    } catch {}
    set({ activeChannelId: channelId });
  },

  initFromStorage: () => {
    try {
      const id =
        typeof window !== "undefined"
          ? window.localStorage.getItem("chat:activeChannelId")
          : null;
      if (id) set({ activeChannelId: id });
    } catch {}
  },

  setChannelMembers: (channelId, members) =>
    set((s) => {
      const next = new Map(s.channelMembers);
      next.set(channelId, members);
      return { channelMembers: next };
    }),

  decrementUnread: (channelId) =>
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId
          ? { ...c, unread_count: Math.max(0, (c.unread_count || 0) - 1) }
          : c,
      ),
    })),

  incrementUnread: (channelId) =>
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId
          ? { ...c, unread_count: (c.unread_count || 0) + 1 }
          : c,
      ),
    })),

  clearUnread: (channelId) =>
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId ? { ...c, unread_count: 0 } : c,
      ),
    })),

  // ── Messages ──────────────────────────────────
  setMessages: (channelId, messages) =>
    set((s) => {
      const next = new Map(s.messages);
      next.set(channelId, messages);
      return { messages: next };
    }),

  prependMessages: (channelId, messages) =>
    set((s) => {
      const next = new Map(s.messages);
      const current = next.get(channelId) || [];
      next.set(channelId, [...messages, ...current]);
      return { messages: next };
    }),

  appendMessage: (channelId, message) =>
    set((s) => {
      const next = new Map(s.messages);
      const current = next.get(channelId) || [];
      // Dedupe
      if (current.some((m) => m.id === message.id)) return s;
      next.set(channelId, [...current, message]);
      return { messages: next };
    }),

  updateMessage: (channelId, message) =>
    set((s) => {
      const next = new Map(s.messages);
      const current = next.get(channelId) || [];
      next.set(
        channelId,
        current.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
      );
      return { messages: next };
    }),

  removeMessage: (channelId, messageId) =>
    set((s) => {
      const next = new Map(s.messages);
      const current = next.get(channelId) || [];
      next.set(
        channelId,
        current.map((m) =>
          m.id === messageId ? { ...m, is_deleted: true, body: "" } : m,
        ),
      );
      return { messages: next };
    }),

  setHasMore: (channelId, has) =>
    set((s) => {
      const next = new Map(s.hasMore);
      next.set(channelId, has);
      return { hasMore: next };
    }),

  // ── Thread ────────────────────────────────────
  openThread: (parentId) =>
    set({ threadParentId: parentId, threadMessages: [] }),

  closeThread: () => set({ threadParentId: null, threadMessages: [] }),

  setThreadMessages: (messages) => set({ threadMessages: messages }),

  appendThreadMessage: (message) =>
    set((s) => {
      if (s.threadMessages.some((m) => m.id === message.id)) return s;
      return { threadMessages: [...s.threadMessages, message] };
    }),

  // ── Typing ────────────────────────────────────
  setTyping: (channelId, userId, isTyping) =>
    set((s) => {
      const next = new Map(s.typingUsers);
      const users = new Set(next.get(channelId) || []);
      if (isTyping) {
        users.add(userId);
      } else {
        users.delete(userId);
      }
      next.set(channelId, users);
      return { typingUsers: next };
    }),

  // ── Presence ─────────────────────────────────
  setPresenceMap: (map) => set({ presenceMap: map }),

  setUserOnline: (userId) =>
    set((s) => {
      const next = new Map(s.presenceMap);
      const existing = next.get(userId);
      next.set(userId, {
        online: true,
        last_seen: existing?.last_seen ?? new Date().toISOString(),
      });
      return { presenceMap: next };
    }),

  setUserOffline: (userId, lastSeen) =>
    set((s) => {
      const next = new Map(s.presenceMap);
      next.set(userId, { online: false, last_seen: lastSeen });
      return { presenceMap: next };
    }),

  // ── UI ────────────────────────────────────────
  toggleDetails: () => set((s) => ({ detailsOpen: !s.detailsOpen })),
  setDetailsOpen: (open) => set({ detailsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  // ── WebSocket ─────────────────────────────────
  setConnected: (connected) => set({ connected }),
  setWs: (ws) => set({ ws }),

  // ── Reset ─────────────────────────────────────
  reset: () => {
    // Preserve activeChannelId for faster reload on navigation back
    const saved = get().activeChannelId;
    set({ ...initialState, activeChannelId: saved });
  },
}));
