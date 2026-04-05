"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type { ChatMessage } from "@/types/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import {
  Bookmark,
  Download,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Search,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const EMOJI_LIST = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀"];
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_TYPING = new Set<string>();

import { API_BASE } from "@/lib/api-base";

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
  const { isLoading } = useQuery({
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
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 bg-base-100"
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
                  isOwn={msg.user_id === user?.internal_id}
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
  const [showMenu, setShowMenu] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const menuRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);

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
    try {
      await api.chat.reactions.toggle(message.id, emoji);
      qc.invalidateQueries({ queryKey: ["chat-messages", message.channel_id] });
    } catch {
      // ignore
    }
    setShowEmoji(false);
  };

  const handleDelete = async () => {
    setShowMenu(false);
    try {
      await api.chat.messages.delete(message.id);
      removeMessage(message.channel_id, message.id);
    } catch {
      // ignore
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
      // ignore
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
          !isOwn && "hover:bg-base-200/40",
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
                <Button size="xs" variant="primary" onClick={handleEdit}>
                  Save
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "inline-block px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
                isOwn
                  ? "bg-primary text-primary-content rounded-tr-sm"
                  : "bg-base-200 text-base-content rounded-tl-sm",
              )}
            >
              {message.body}
            </div>
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
                  className="flex items-center gap-2 px-3 py-2 bg-base-200 rounded-lg text-sm hover:bg-base-300 transition-colors"
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
                const userId = user?.id || "";
                const hasReacted = rg.users?.includes(userId);
                return (
                  <button
                    key={rg.emoji}
                    onClick={() => handleReaction(rg.emoji)}
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
        </div>

        {/* Hover actions — 3-dot menu + quick actions */}
        {showActions && !editing && (
          <div
            className={cn(
              "absolute -top-3 flex items-center bg-base-100 border border-base-200 rounded-lg shadow-md p-0.5 z-10",
              isOwn ? "right-2" : "left-12",
            )}
          >
            <Button
              variant="ghost"
              size="xs"
              className="btn-square"
              title="Reply in thread"
              onClick={onOpenThread}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="btn-square"
              title="React"
              onClick={() => setShowEmoji(!showEmoji)}
            >
              <SmilePlus className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className={cn("btn-square", bookmarked && "text-warning")}
              title={bookmarked ? "Bookmarked!" : "Bookmark"}
              onClick={async () => {
                try {
                  if (bookmarked) {
                    await api.chat.bookmarks.remove(message.id);
                    setBookmarked(false);
                  } else {
                    await api.chat.bookmarks.add(message.id);
                    setBookmarked(true);
                  }
                } catch {
                  // toggle failed silently
                }
              }}
            >
              <Bookmark
                className={cn("w-3.5 h-3.5", bookmarked && "fill-current")}
              />
            </Button>
            {/* 3-dot menu */}
            <div className="relative" ref={menuRef}>
              <Button
                variant="ghost"
                size="xs"
                className="btn-square"
                title="More"
                onClick={() => setShowMenu(!showMenu)}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
              {showMenu && (
                <div
                  className={cn(
                    "absolute top-full mt-1 w-44 bg-base-100 border border-base-200 rounded-lg shadow-lg py-1 z-30",
                    isOwn ? "right-0" : "left-0",
                  )}
                >
                  {isOwn && (
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
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                    onClick={onOpenThread}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Reply in Thread
                  </button>
                  {isOwn && (
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

        {/* Emoji picker */}
        {showEmoji && (
          <div
            className={cn(
              "absolute -top-10 flex gap-0.5 bg-base-100 border border-base-200 rounded-xl shadow-lg p-1 z-20",
              isOwn ? "right-2" : "left-12",
            )}
          >
            {EMOJI_LIST.map((e) => (
              <Button
                key={e}
                onClick={() => handleReaction(e)}
                variant="ghost"
                size="xs"
                className="btn-square text-base hover:scale-125 transition-transform"
              >
                {e}
              </Button>
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
          <Button
            variant="ghost"
            size="sm"
            className="btn-circle text-white absolute top-4 right-4"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5" />
          </Button>
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
