"use client";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type { ChatMessage } from "@/types/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { Bookmark, MessageSquare, SmilePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const EMOJI_LIST = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀"];
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_TYPING = new Set<string>();

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevMessagesLenRef = useRef(0);

  // Fetch initial messages
  const { isLoading } = useQuery({
    queryKey: ["chat-messages", activeChannelId],
    queryFn: async () => {
      if (!activeChannelId) return [];
      const raw = await api.chat.messages.list(activeChannelId, 50);
      const data = raw ?? [];
      const sorted = [...data].reverse();
      setMessages(activeChannelId, sorted);
      setHasMore(activeChannelId, data.length >= 50);
      return sorted;
    },
    enabled: !!activeChannelId,
  });

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3"
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
              <div key={msg.id}>
                {showDateSep && <DateSeparator date={msg.created_at} />}
                <MessageBubble
                  message={msg}
                  isOwn={msg.user_id === user?.id}
                  isGrouped={!!isGrouped}
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
              ? "Someone is typing..."
              : `${typingUsers.size} people are typing...`}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
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
  onOpenThread,
}: {
  message: ChatMessage;
  isOwn: boolean;
  isGrouped: boolean;
  onOpenThread: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Resolve sender name: use auth store for own messages, message data otherwise
  const senderName =
    message.sender_name ||
    (isOwn ? user?.user_metadata?.name || user?.email || "You" : "Unknown");

  const handleReaction = async (emoji: string) => {
    try {
      await api.chat.reactions.toggle(message.id, emoji);
      qc.invalidateQueries({ queryKey: ["chat-messages", message.channel_id] });
    } catch {
      // ignore
    }
    setShowEmoji(false);
  };

  if (message.is_deleted) {
    return (
      <div className={cn("px-2 py-1", !isGrouped && "mt-3")}>
        <span className="text-xs text-base-content/30 italic">
          This message was deleted
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-2 py-1 rounded-lg transition-colors hover:bg-base-200/40",
        !isGrouped && "mt-3",
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmoji(false);
      }}
    >
      {/* Avatar */}
      {!isGrouped ? (
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
      ) : (
        <div className="w-9 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        {/* Header (name + time) */}
        {!isGrouped && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-base-content">
              {senderName}
            </span>
            <span className="text-xs text-base-content/40">
              {format(new Date(message.created_at), "h:mm a")}
            </span>
            {message.is_edited && (
              <span className="text-xs text-base-content/30">(edited)</span>
            )}
          </div>
        )}

        {/* Message body */}
        <div className="text-sm text-base-content/90 whitespace-pre-wrap break-words">
          {message.body}
        </div>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {groupReactions(message.reactions).map((rg) => (
              <button
                key={rg.emoji}
                onClick={() => handleReaction(rg.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors",
                  rg.userIds.includes(useAuthStore.getState().user?.id || "")
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-base-200 bg-base-100 hover:bg-base-200",
                )}
              >
                <span>{rg.emoji}</span>
                <span>{rg.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread indicator */}
        {message.thread_count > 0 && (
          <button
            onClick={onOpenThread}
            className="flex items-center gap-1.5 mt-1.5 text-primary text-xs hover:underline"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {message.thread_count}{" "}
            {message.thread_count === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {/* Hover actions */}
      {showActions && (
        <div className="absolute -top-3 right-2 flex items-center bg-base-100 border border-base-200 rounded-lg shadow-md p-0.5 z-10">
          <button
            className="btn btn-ghost btn-xs btn-square"
            title="Reply in thread"
            onClick={onOpenThread}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn btn-ghost btn-xs btn-square"
            title="React"
            onClick={() => setShowEmoji(!showEmoji)}
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn btn-ghost btn-xs btn-square"
            title="Bookmark"
            onClick={async () => {
              try {
                await api.chat.bookmarks.add(message.id);
              } catch {
                /* already bookmarked */
              }
            }}
          >
            <Bookmark className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute -top-10 right-2 flex gap-0.5 bg-base-100 border border-base-200 rounded-xl shadow-lg p-1 z-20">
          {EMOJI_LIST.map((e) => (
            <button
              key={e}
              onClick={() => handleReaction(e)}
              className="btn btn-ghost btn-xs btn-square text-base hover:scale-125 transition-transform"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function groupReactions(
  reactions: { emoji: string; user_id: string }[],
): { emoji: string; count: number; userIds: string[] }[] {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const arr = map.get(r.emoji) || [];
    arr.push(r.user_id);
    map.set(r.emoji, arr);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}
