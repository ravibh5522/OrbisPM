"use client";

import { useChannelPermissions } from "@/hooks/use-channel-permissions";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { ForwardModal } from "@/components/chat/forward-modal";
import { getChatBackground } from "@/components/chat/chat-backgrounds";
import { toast } from "sonner";
import { useChatStore } from "@/stores/chat-store";
import type {
  ChatChannelMember,
  ChatMessage,
  ChatPinnedMessage,
  ChatReaction,
} from "@/types/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import {
  ArrowDown,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  Download,
  Forward,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Search,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_TYPING = new Set<string>();
const EMPTY_MEMBERS: ChatChannelMember[] = [];
const EMOJI_LIST = [
  "👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀",
  "🙏", "✅", "💯", "🚀", "👏", "😍", "🤔", "😅",
];

// First http(s) URL in a string, trimmed of trailing punctuation.
function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/);
  return m ? m[0].replace(/[).,!?;:]+$/, "") : null;
}

// Rich Open Graph preview card for a link (Teams/Slack-style).
function LinkPreview({ url }: { url: string }) {
  const { data } = useQuery({
    queryKey: ["chat-unfurl", url],
    queryFn: () => api.chat.unfurl(url),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const [imgOk, setImgOk] = useState(true);
  if (!data || (!data.title && !data.description && !data.image)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex max-w-sm overflow-hidden rounded-lg border border-base-200 bg-base-100 hover:bg-base-200/60 transition-colors"
    >
      {data.image && imgOk && (
        <img
          src={data.image}
          alt=""
          className="w-20 h-20 object-cover flex-shrink-0"
          onError={() => setImgOk(false)}
        />
      )}
      <div className="p-2.5 min-w-0">
        {data.site && (
          <div className="text-[10px] uppercase tracking-wide text-base-content/40 truncate">
            {data.site}
          </div>
        )}
        {data.title && (
          <div className="text-xs font-semibold text-base-content line-clamp-1">
            {data.title}
          </div>
        )}
        {data.description && (
          <div className="text-xs text-base-content/60 line-clamp-2 mt-0.5">
            {data.description}
          </div>
        )}
      </div>
    </a>
  );
}

// Render message text with clickable links. Splits on whitespace (kept as
// separate tokens) so exact spacing is preserved under whitespace-pre-wrap.
function linkify(text: string) {
  return text.split(/(\s+)/).map((tok, i) =>
    /^https?:\/\/\S+$/.test(tok) ? (
      <a
        key={i}
        href={tok}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all hover:opacity-80"
      >
        {tok}
      </a>
    ) : (
      tok
    ),
  );
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Fetches an attachment image via the authenticated /file streaming endpoint and renders it as a blob URL. */
function ChatAttachmentImage({
  attachmentId,
  fileName,
  onClick,
}: {
  attachmentId: string;
  fileName: string;
  onClick: (url: string) => void;
}) {
  const {
    data: blobUrl,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["chat-attachment-blob", attachmentId],
    queryFn: async () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("access_token")
          : null;
      const orgId =
        typeof window !== "undefined"
          ? localStorage.getItem("current_org_id")
          : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (orgId) headers["X-Org-ID"] = orgId;

      const res = await fetch(
        `${API_BASE}/api/v1/chat/attachments/${attachmentId}/file`,
        { headers },
      );
      if (!res.ok) throw new Error("Failed to fetch attachment");
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="w-40 h-24 rounded-lg bg-base-300 animate-pulse flex items-center justify-center">
        <span className="loading loading-spinner loading-sm" />
      </div>
    );
  }
  if (isError || !blobUrl) {
    return (
      <div className="w-40 h-24 rounded-lg bg-base-300 flex items-center justify-center text-xs text-base-content/40">
        Preview unavailable
      </div>
    );
  }
  return (
    <button
      onClick={() => onClick(blobUrl)}
      className="block rounded-lg overflow-hidden border border-base-200 hover:border-primary/50 transition-colors cursor-pointer"
      style={{ maxWidth: 240 }}
    >
      <img
        src={blobUrl}
        alt={fileName}
        className="max-w-full max-h-[200px] w-auto h-auto object-cover"
        loading="lazy"
      />
    </button>
  );
}

/** Downloads a chat attachment via the authenticated /file streaming endpoint. */
async function downloadAttachment(attachmentId: string, fileName: string) {
  try {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    const orgId =
      typeof window !== "undefined"
        ? localStorage.getItem("current_org_id")
        : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (orgId) headers["X-Org-ID"] = orgId;

    const res = await fetch(
      `${API_BASE}/api/v1/chat/attachments/${attachmentId}/file`,
      { headers },
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // silently fail
  }
}

export function MessageList() {
  const user = useAuthStore((s) => s.user);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const messages = useChatStore(
    (s) => s.messages.get(activeChannelId || "") ?? EMPTY_MESSAGES,
  );
  const hasMore = useChatStore(
    (s) => s.hasMore.get(activeChannelId || "") ?? true,
  );
  const setMessages = useChatStore((s) => s.setMessages);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const setHasMore = useChatStore((s) => s.setHasMore);
  const openThread = useChatStore((s) => s.openThread);
  const typingUsers = useChatStore(
    (s) => s.typingUsers.get(activeChannelId || "") ?? EMPTY_TYPING,
  );
  const channelMembers = useChatStore(
    (s) => s.channelMembers.get(activeChannelId || "") ?? EMPTY_MEMBERS,
  );
  const typingNames = useMemo(() => {
    const byId = new Map(
      channelMembers.map((m) => [m.user_id, m.display_name || "Someone"]),
    );
    return Array.from(typingUsers, (id) => byId.get(id) || "Someone");
  }, [typingUsers, channelMembers]);
  const chatBackground = useChatStore((s) => s.chatBackground);
  const bg = getChatBackground(chatBackground);
  const searchQuery = useChatStore((s) => s.searchQuery);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevMessagesLenRef = useRef(0);

  // Debounce search query
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search messages query
  const { data: searchResults, isLoading: isSearchLoading } = useQuery({
    queryKey: ["chat-search", activeChannelId, debouncedSearch],
    queryFn: async () => {
      if (!activeChannelId || !debouncedSearch.trim()) return [];
      const res = await api.chat.messages.search(
        activeChannelId,
        debouncedSearch.trim(),
      );
      return res.data ?? [];
    },
    enabled: !!activeChannelId && !!debouncedSearch.trim(),
  });

  const isSearching = !!debouncedSearch.trim();

  // Fetch initial messages
  const { isLoading, isFetching } = useQuery({
    queryKey: ["chat-messages", activeChannelId],
    queryFn: async () => {
      if (!activeChannelId) return [];
      const raw = await api.chat.messages.list(activeChannelId, 30);
      const data = raw ?? [];
      const sorted = [...data].reverse();
      setMessages(activeChannelId, sorted);
      setHasMore(activeChannelId, data.length >= 30);
      return sorted;
    },
    enabled: !!activeChannelId,
    staleTime: 30_000,
    // The UI renders from the store (populated by queryFn), so always re-run on
    // mount — otherwise a persisted "fresh" cache skips queryFn and the channel
    // renders blank after a refresh.
    refetchOnMount: "always",
  });

  const { data: pinnedMessages } = useQuery({
    queryKey: ["chat-pins", activeChannelId],
    queryFn: async () => (await api.chat.pins.list(activeChannelId!)) ?? [],
    enabled: !!activeChannelId,
  });
  const pinnedIds = useMemo(
    () => new Set((pinnedMessages ?? []).map((p) => p.message_id)),
    [pinnedMessages],
  );

  const { data: bookmarks } = useQuery({
    queryKey: ["chat-bookmarks"],
    queryFn: async () => (await api.chat.bookmarks.list(100, 0)).data ?? [],
  });
  const bookmarkedIds = useMemo(
    () => new Set((bookmarks ?? []).map((b) => b.message_id)),
    [bookmarks],
  );

  const qc = useQueryClient();
  const channelPerms = useChannelPermissions(activeChannelId || undefined);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      toast.error("Message isn't loaded yet — scroll up to find it.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2000);
  };

  const handleUnpin = async (messageId: string) => {
    if (!activeChannelId) return;
    try {
      await api.chat.pins.unpin(activeChannelId, messageId);
      qc.invalidateQueries({ queryKey: ["chat-pins", activeChannelId] });
    } catch {
      toast.error("Couldn't unpin the message. Please try again.");
    }
  };

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll && messages.length > prevMessagesLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages.length, autoScroll]);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);

    // Load more when scrolling to top
    if (el.scrollTop < 100 && hasMore && !isLoadingMore && activeChannelId) {
      setIsLoadingMore(true);
      const oldestMessage = messages[0];
      if (oldestMessage) {
        const prevHeight = el.scrollHeight;
        api.chat.messages
          .list(activeChannelId, 50, oldestMessage.id)
          .then((raw) => {
            const data = raw ?? [];
            if (data.length < 50) {
              setHasMore(activeChannelId, false);
            }
            const sorted = [...data].reverse();
            prependMessages(activeChannelId, sorted);
            // Maintain scroll position
            requestAnimationFrame(() => {
              el.scrollTop = el.scrollHeight - prevHeight;
            });
          })
          .finally(() => setIsLoadingMore(false));
      }
    }
  }, [
    hasMore,
    isLoadingMore,
    activeChannelId,
    messages,
    prependMessages,
    setHasMore,
  ]);

  // Mark channel as read on view
  useEffect(() => {
    if (activeChannelId) {
      api.chat.channels.markRead(activeChannelId).catch(() => {});
      useChatStore.getState().clearUnread(activeChannelId);
    }
  }, [activeChannelId]);

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center text-base-content/40">
        <div className="text-center">
          <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Select a conversation</p>
          <p className="text-sm mt-1">
            Choose a channel from the left to start chatting
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || (isFetching && messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  // ─── Search Results Mode ────────────────────
  if (isSearching) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3">
          <span className="text-xs font-semibold text-base-content/40 uppercase tracking-wider">
            Search Results{searchResults ? ` (${searchResults.length})` : ""}
          </span>
        </div>
        {isSearchLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        ) : !searchResults || searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-base-content/40">
            <Search className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm font-medium">No messages found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {searchResults.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.user_id === user?.internal_id}
                isGrouped={false}
                isPinned={pinnedIds.has(msg.id)}
                isBookmarked={bookmarkedIds.has(msg.id)}
                onOpenThread={() => openThread(msg.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Normal Message List ────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {(pinnedMessages?.length ?? 0) > 0 && (
        <PinnedBar
          pins={pinnedMessages ?? []}
          canUnpin={channelPerms.can("message", "pin")}
          onJump={scrollToMessage}
          onUnpin={handleUnpin}
        />
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={
          bg.image
            ? { backgroundImage: bg.image, backgroundSize: bg.size }
            : undefined
        }
      >
        {isLoadingMore && (
        <div className="flex justify-center py-2">
          <span className="loading loading-spinner loading-sm text-primary" />
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-base-content/40">
          <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No messages yet</p>
          <p className="text-xs mt-1">Be the first to send a message!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {messages.map((msg, idx) => {
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showDateSep =
              !prevMsg ||
              !isSameDay(
                new Date(msg.created_at),
                new Date(prevMsg.created_at),
              );
            const isGrouped =
              prevMsg &&
              prevMsg.user_id === msg.user_id &&
              !showDateSep &&
              new Date(msg.created_at).getTime() -
                new Date(prevMsg.created_at).getTime() <
                5 * 60 * 1000;

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={cn(
                  "rounded-lg transition-colors",
                  highlightId === msg.id && "ring-2 ring-primary/60 bg-primary/5",
                )}
              >
                {showDateSep && <DateSeparator date={msg.created_at} />}
                <MessageBubble
                  message={msg}
                  isOwn={msg.user_id === user?.internal_id}
                  isGrouped={!!isGrouped}
                  isPinned={pinnedIds.has(msg.id)}
                  isBookmarked={bookmarkedIds.has(msg.id)}
                  onOpenThread={() => openThread(msg.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Typing indicator */}
      {typingUsers.size > 0 && (
        <div className="px-2 py-1.5">
          <span className="text-xs text-base-content/50 italic">
            {typingUsers.size === 1
              ? `${typingNames[0]} is typing...`
              : typingUsers.size === 2
                ? `${typingNames[0]} and ${typingNames[1]} are typing...`
                : "Several people are typing..."}
          </span>
        </div>
      )}

      {!autoScroll && messages.length > 0 && (
        <div className="sticky bottom-2 flex justify-end pointer-events-none pr-1">
          <button
            className="btn btn-circle btn-sm shadow-lg bg-base-100 border border-base-200 pointer-events-auto z-20"
            title="Jump to latest"
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function PinnedBar({
  pins,
  canUnpin,
  onJump,
  onUnpin,
}: {
  pins: ChatPinnedMessage[];
  canUnpin: boolean;
  onJump: (id: string) => void;
  onUnpin: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const latest = pins[0];
  return (
    <div className="border-b border-base-200 bg-base-200/40 flex-shrink-0">
      <button
        className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-base-200/70 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <Pin className="w-3.5 h-3.5 text-warning flex-shrink-0" />
        <span className="text-xs font-semibold flex-shrink-0">
          {pins.length} pinned
        </span>
        <span className="text-xs text-base-content/50 truncate flex-1">
          {latest?.message?.body?.trim() || "(attachment)"}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-base-content/40 transition-transform flex-shrink-0",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto px-2 pb-2 flex flex-col gap-1">
          {pins.map((p) => (
            <div
              key={p.message_id}
              className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-base-100"
            >
              <Pin className="w-3 h-3 text-warning mt-1 flex-shrink-0" />
              <button
                className="flex-1 text-left min-w-0"
                onClick={() => {
                  onJump(p.message_id);
                  setOpen(false);
                }}
              >
                <span className="text-xs font-medium">
                  {p.message?.sender_name || "Unknown"}
                </span>
                <p className="text-xs text-base-content/60 line-clamp-2">
                  {p.message?.body?.trim() || "(attachment)"}
                </p>
              </button>
              {canUnpin && (
                <button
                  className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error opacity-0 group-hover:opacity-100"
                  title="Unpin"
                  onClick={() => onUnpin(p.message_id)}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  let label: string;
  if (isToday(d)) label = "Today";
  else if (isYesterday(d)) label = "Yesterday";
  else label = format(d, "MMMM d, yyyy");

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 border-t border-base-200" />
      <span className="text-xs font-medium text-base-content/40">{label}</span>
      <div className="flex-1 border-t border-base-200" />
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
  isGrouped,
  isPinned,
  isBookmarked,
  onOpenThread,
}: {
  message: ChatMessage;
  isOwn: boolean;
  isGrouped: boolean;
  isPinned: boolean;
  isBookmarked: boolean;
  onOpenThread: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const menuRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const bubbleMembers = useChatStore(
    (s) => s.channelMembers.get(message.channel_id) ?? EMPTY_MEMBERS,
  );

  const { can } = useChannelPermissions(message.channel_id);
  const canReact = can("message", "react");
  const canEditOwn = isOwn && can("message", "edit_own");
  const canDeleteOwn = isOwn && can("message", "delete_own");
  const canDeleteAny = can("message", "delete_any");
  const canBookmark = can("message", "bookmark");
  const canPin = can("message", "pin");
  const canForward = can("message", "forward");

  const myReactedEmojis = useMemo(
    () =>
      new Set(
        (message.reactions ?? [])
          .filter((r) => r.users?.includes(user?.internal_id || ""))
          .map((r) => r.emoji),
      ),
    [message.reactions, user?.internal_id],
  );

  // Read status / Seen-by — computed from other members' last_read_at.
  const myId = user?.internal_id || "";
  const [showSeen, setShowSeen] = useState(false);
  const seenRef = useRef<HTMLDivElement>(null);
  const otherMembers = useMemo(
    () => bubbleMembers.filter((m) => m.user_id !== myId),
    [bubbleMembers, myId],
  );
  const readers = useMemo(
    () =>
      otherMembers.filter(
        (m) =>
          m.last_read_at &&
          new Date(m.last_read_at).getTime() >=
            new Date(message.created_at).getTime(),
      ),
    [otherMembers, message.created_at],
  );
  useEffect(() => {
    if (!showSeen) return;
    const handler = (e: MouseEvent) => {
      if (seenRef.current && !seenRef.current.contains(e.target as Node)) {
        setShowSeen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSeen]);

  // Sync bookmark state when the saved-messages list resolves.
  useEffect(() => {
    setBookmarked(isBookmarked);
  }, [isBookmarked]);

  // Resolve sender name
  const senderName =
    message.sender_name ||
    (isOwn ? user?.user_metadata?.name || user?.email || "You" : "Unknown");

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleReaction = async (emoji: string) => {
    setShowEmoji(false);
    const uid = user?.internal_id || "";
    // Optimistically toggle the reaction so the UI responds immediately.
    const current = message.reactions ?? [];
    const existing = current.find((r) => r.emoji === emoji);
    let next: ChatReaction[];
    if (existing && existing.users?.includes(uid)) {
      const users = existing.users.filter((u) => u !== uid);
      next =
        users.length > 0
          ? current.map((r) =>
              r.emoji === emoji ? { ...r, users, count: users.length } : r,
            )
          : current.filter((r) => r.emoji !== emoji);
    } else if (existing) {
      const users = [...(existing.users ?? []), uid];
      next = current.map((r) =>
        r.emoji === emoji ? { ...r, users, count: users.length } : r,
      );
    } else {
      next = [...current, { emoji, count: 1, users: [uid] }];
    }
    updateMessage(message.channel_id, { ...message, reactions: next });
    try {
      // Optimistic update above + the WebSocket reaction echo keep everyone in
      // sync. Do NOT invalidate/refetch here — a refetch can overwrite the
      // optimistic reaction before the server reflects it, so the actor would
      // lose their own reaction while others (who only get the echo) keep it.
      await api.chat.reactions.toggle(message.id, emoji);
    } catch {
      updateMessage(message.channel_id, message); // revert on failure
      toast.error("Couldn't update reaction. Please try again.");
    }
  };

  const handleTogglePin = async () => {
    setShowMenu(false);
    try {
      if (isPinned) {
        await api.chat.pins.unpin(message.channel_id, message.id);
      } else {
        await api.chat.pins.pin(message.channel_id, message.id);
      }
      qc.invalidateQueries({ queryKey: ["chat-pins", message.channel_id] });
    } catch {
      toast.error("Couldn't update pin. Please try again.");
    }
  };

  const handleBookmark = async () => {
    setShowMenu(false);
    try {
      if (bookmarked) {
        await api.chat.bookmarks.remove(message.id);
        setBookmarked(false);
      } else {
        await api.chat.bookmarks.add(message.id);
        setBookmarked(true);
      }
      qc.invalidateQueries({ queryKey: ["chat-bookmarks"] });
    } catch {
      toast.error("Couldn't update saved message. Please try again.");
    }
  };

  const handleDelete = async () => {
    setShowMenu(false);
    try {
      await api.chat.messages.delete(message.id);
      removeMessage(message.channel_id, message.id);
    } catch {
      toast.error("Couldn't delete message. Please try again.");
    }
  };

  const handleEdit = async () => {
    if (!editBody.trim() || editBody === message.body) {
      setEditing(false);
      return;
    }
    try {
      const updated = await api.chat.messages.edit(message.id, {
        body: editBody.trim(),
      });
      updateMessage(message.channel_id, updated);
      setEditing(false);
    } catch {
      toast.error("Couldn't save edit. Please try again.");
    }
  };

  if (message.is_deleted) {
    return (
      <div
        className={cn("px-2 py-1", !isGrouped && "mt-3", isOwn && "text-right")}
      >
        <span className="text-xs text-base-content/30 italic">
          This message was deleted
        </span>
      </div>
    );
  }

  // Separate image and other attachments
  const imageAttachments =
    message.attachments?.filter((a) => a.content_type?.startsWith("image/")) ||
    [];
  const otherAttachments =
    message.attachments?.filter((a) => !a.content_type?.startsWith("image/")) ||
    [];

  return (
    <>
      <div
        className={cn(
          "group relative flex gap-3 px-2 py-1 rounded-lg transition-colors",
          !isGrouped && "mt-3",
          isOwn ? "flex-row-reverse" : "flex-row",
        )}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => {
          setShowActions(false);
          if (!showMenu) setShowEmoji(false);
        }}
      >
        {/* Avatar */}
        {!isOwn && !isGrouped ? (
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0 mt-0.5">
            {message.sender_avatar ? (
              <img
                src={message.sender_avatar}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              (senderName?.[0] || "?").toUpperCase()
            )}
          </div>
        ) : !isOwn ? (
          <div className="w-9 flex-shrink-0" />
        ) : null}

        <div
          className={cn(
            "flex-1 min-w-0 max-w-[75%]",
            isOwn && "flex flex-col items-end",
          )}
        >
          {/* Header */}
          {!isGrouped && (
            <div
              className={cn(
                "flex items-center gap-2 mb-0.5",
                isOwn && "flex-row-reverse",
              )}
            >
              <span className="text-sm font-semibold text-base-content">
                {isOwn ? "You" : senderName}
              </span>
              <span className="text-xs text-base-content/40">
                {format(new Date(message.created_at), "h:mm a")}
              </span>
              {message.is_edited && (
                <span className="text-xs text-base-content/30">(edited)</span>
              )}
            </div>
          )}

          {isPinned && (
            <div
              className={cn(
                "flex items-center gap-1 mb-0.5 text-xs text-warning/80",
                isOwn && "flex-row-reverse",
              )}
            >
              <Pin className="w-3 h-3" />
              <span>Pinned</span>
            </div>
          )}

          {message.forwarded_from_id && (
            <div
              className={cn(
                "flex items-center gap-1 mb-0.5 text-xs text-base-content/40 italic",
                isOwn && "flex-row-reverse",
              )}
            >
              <Forward className="w-3 h-3" />
              <span>Forwarded</span>
            </div>
          )}

          {/* Message bubble or edit mode */}
          {editing ? (
            <div className="w-full">
              <textarea
                className="textarea textarea-bordered textarea-sm w-full"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleEdit();
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                autoFocus
                rows={2}
              />
              <div className="flex gap-1 mt-1">
                <button className="btn btn-xs btn-primary" onClick={handleEdit}>
                  Save
                </button>
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "inline-block text-sm whitespace-pre-wrap break-words",
                isOwn
                  ? "px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-primary-content"
                  : "py-0.5 text-base-content",
              )}
            >
              {linkify(message.body)}
            </div>
          )}

          {!message.is_deleted && !editing && firstUrl(message.body) && (
            <LinkPreview url={firstUrl(message.body)!} />
          )}

          {/* Image attachments — thumbnail grid with lightbox */}
          {imageAttachments.length > 0 && (
            <div
              className={cn(
                "flex flex-wrap gap-2 mt-2",
                isOwn && "justify-end",
              )}
            >
              {imageAttachments.map((att) => (
                <ChatAttachmentImage
                  key={att.id}
                  attachmentId={att.id}
                  fileName={att.file_name}
                  onClick={(url) => setLightboxUrl(url)}
                />
              ))}
            </div>
          )}

          {/* Other attachments */}
          {otherAttachments.length > 0 && (
            <div
              className={cn("flex flex-col gap-1 mt-2", isOwn && "items-end")}
            >
              {otherAttachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => downloadAttachment(att.id, att.file_name)}
                  className="flex items-center gap-2 px-3 py-2 bg-base-100/50 border border-base-200/60 rounded-lg text-sm hover:bg-base-200 transition-colors"
                >
                  <span className="text-base">📎</span>
                  <span className="truncate max-w-[150px]">
                    {att.file_name}
                  </span>
                  <span className="text-xs text-base-content/50">
                    {(att.file_size / 1024).toFixed(0)} KB
                  </span>
                  <Download className="w-3.5 h-3.5 text-base-content/40 ml-auto" />
                </button>
              ))}
            </div>
          )}

          {/* Reactions — fixed spacing to prevent overlap */}
          {message.reactions && message.reactions.length > 0 && (
            <div
              className={cn(
                "flex flex-wrap gap-1.5 mt-2 relative z-0",
                isOwn && "justify-end",
              )}
            >
              {message.reactions.map((rg) => {
                const userId = user?.internal_id || "";
                const hasReacted = rg.users?.includes(userId);
                const reactorNames = (rg.users ?? [])
                  .map(
                    (id) =>
                      bubbleMembers.find((m) => m.user_id === id)
                        ?.display_name ||
                      (id === userId ? "You" : "Someone"),
                  )
                  .join(", ");
                return (
                  <button
                    key={rg.emoji}
                    onClick={() => handleReaction(rg.emoji)}
                    title={
                      hasReacted
                        ? `You reacted — click to remove${reactorNames ? ` · ${reactorNames}` : ""}`
                        : reactorNames
                    }
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors leading-none",
                      hasReacted
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-base-200 bg-base-100 hover:bg-base-200",
                    )}
                  >
                    <span className="text-sm leading-none">{rg.emoji}</span>
                    <span className="leading-none">{rg.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Thread indicator */}
          {message.thread_count > 0 && (
            <button
              onClick={onOpenThread}
              className={cn(
                "flex items-center gap-1.5 mt-1.5 text-primary text-xs hover:underline",
                isOwn && "justify-end",
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {message.thread_count}{" "}
              {message.thread_count === 1 ? "reply" : "replies"}
            </button>
          )}

          {/* Read status / Seen-by (own messages) */}
          {isOwn && !message.is_deleted && otherMembers.length > 0 && (
            <div className="relative flex justify-end mt-0.5" ref={seenRef}>
              <button
                className="flex items-center gap-1 text-[10px] text-base-content/40 hover:text-base-content/70 transition-colors"
                onClick={() => setShowSeen((s) => !s)}
                title={
                  readers.length > 0
                    ? `Seen by ${readers.map((m) => m.display_name || "member").join(", ")}`
                    : "Sent"
                }
              >
                {readers.length > 0 ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 text-success" />
                    {otherMembers.length > 1 && (
                      <span>Seen by {readers.length}</span>
                    )}
                  </>
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
              </button>
              {showSeen && (
                <div className="absolute bottom-full right-0 mb-1 w-52 bg-base-100 border border-base-200 rounded-lg shadow-lg py-1 z-30 text-left max-h-64 overflow-y-auto">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-base-content/40">
                    Seen by {readers.length > 0 && `(${readers.length})`}
                  </div>
                  {readers.length === 0 ? (
                    <div className="px-3 py-1 text-xs text-base-content/50">
                      No one yet
                    </div>
                  ) : (
                    readers.map((m) => (
                      <div
                        key={m.user_id}
                        className="px-3 py-1 text-xs flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {m.display_name || "Member"}
                        </span>
                        {m.last_read_at && (
                          <span className="text-base-content/40 flex-shrink-0">
                            {format(new Date(m.last_read_at), "HH:mm")}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                  {otherMembers.length - readers.length > 0 && (
                    <>
                      <div className="px-3 py-1 mt-1 text-[10px] uppercase tracking-wide text-base-content/40 border-t border-base-200">
                        Not seen yet
                      </div>
                      {otherMembers
                        .filter((m) => !readers.includes(m))
                        .slice(0, 10)
                        .map((m) => (
                          <div
                            key={m.user_id}
                            className="px-3 py-1 text-xs text-base-content/50 truncate"
                          >
                            {m.display_name || "Member"}
                          </div>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hover actions — 3-dot menu + quick actions */}
        {showActions && !editing && (
          <div
            className={cn(
              "absolute -top-3 flex items-center bg-base-100 border border-base-200 rounded-lg shadow-md p-0.5 z-10",
              isOwn ? "right-2" : "left-12",
            )}
          >
            <button
              className="btn btn-ghost btn-xs btn-square"
              title="Reply in thread"
              onClick={onOpenThread}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            {canReact && (
              <button
                className="btn btn-ghost btn-xs btn-square"
                title="React"
                onClick={() => setShowEmoji(!showEmoji)}
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
            )}
            {canBookmark && (
              <button
                className={cn(
                  "btn btn-ghost btn-xs btn-square",
                  bookmarked && "text-warning",
                )}
                title={bookmarked ? "Saved — click to remove" : "Save message"}
                onClick={handleBookmark}
              >
                <Bookmark
                  className={cn("w-3.5 h-3.5", bookmarked && "fill-current")}
                />
              </button>
            )}
            {/* 3-dot menu */}
            <div className="relative" ref={menuRef}>
              <button
                className="btn btn-ghost btn-xs btn-square"
                title="More"
                onClick={() => setShowMenu(!showMenu)}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {showMenu && (
                <div
                  className={cn(
                    "absolute top-full mt-1 w-44 bg-base-100 border border-base-200 rounded-lg shadow-lg py-1 z-30",
                    isOwn ? "right-0" : "left-0",
                  )}
                >
                  {canEditOwn && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                      onClick={() => {
                        setShowMenu(false);
                        setEditing(true);
                        setEditBody(message.body);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit Message
                    </button>
                  )}
                  {/* Download all attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <>
                      {message.attachments.map((att) => (
                        <button
                          key={att.id}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                          onClick={() => {
                            setShowMenu(false);
                            downloadAttachment(att.id, att.file_name);
                          }}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="truncate">
                            Download {att.file_name}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {canReact && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                      onClick={() => {
                        setShowMenu(false);
                        setShowEmoji(true);
                      }}
                    >
                      <SmilePlus className="w-3.5 h-3.5" />
                      Add Reaction
                    </button>
                  )}
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                    onClick={onOpenThread}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Reply in Thread
                  </button>
                  {canForward && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                      onClick={() => {
                        setShowMenu(false);
                        setShowForward(true);
                      }}
                    >
                      <Forward className="w-3.5 h-3.5" />
                      Forward
                    </button>
                  )}
                  {message.body?.trim() && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                      onClick={async () => {
                        setShowMenu(false);
                        try {
                          await navigator.clipboard.writeText(message.body);
                          toast.success("Message copied");
                        } catch {
                          toast.error("Couldn't copy the message.");
                        }
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Text
                    </button>
                  )}
                  {canBookmark && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                      onClick={handleBookmark}
                    >
                      <Bookmark
                        className={cn(
                          "w-3.5 h-3.5",
                          bookmarked && "fill-current text-warning",
                        )}
                      />
                      {bookmarked ? "Remove from Saved" : "Save Message"}
                    </button>
                  )}
                  {canPin && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                      onClick={handleTogglePin}
                    >
                      {isPinned ? (
                        <PinOff className="w-3.5 h-3.5" />
                      ) : (
                        <Pin className="w-3.5 h-3.5" />
                      )}
                      {isPinned ? "Unpin Message" : "Pin Message"}
                    </button>
                  )}
                  {(canDeleteOwn || canDeleteAny) && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                      onClick={handleDelete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Message
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showForward && (
          <ForwardModal
            open={showForward}
            onClose={() => setShowForward(false)}
            message={message}
          />
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <div
            className={cn(
              "absolute -top-10 flex gap-0.5 bg-base-100 border border-base-200 rounded-xl shadow-lg p-1 z-20",
              isOwn ? "right-2" : "left-12",
            )}
          >
            {EMOJI_LIST.map((e) => (
              <button
                key={e}
                onClick={() => handleReaction(e)}
                title={myReactedEmojis.has(e) ? "Remove reaction" : "React"}
                className={cn(
                  "btn btn-ghost btn-xs btn-square text-base hover:scale-125 transition-transform",
                  myReactedEmojis.has(e) && "bg-primary/15 ring-1 ring-primary/40",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox for image preview */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 btn btn-ghost btn-sm btn-circle text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={lightboxUrl}
            download
            className="absolute bottom-4 right-4 btn btn-sm btn-primary gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      )}
    </>
  );
}
