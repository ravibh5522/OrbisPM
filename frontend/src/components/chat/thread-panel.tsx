"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type { ChatMessage } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { MessageSquare, Send, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function ThreadPanel() {
  const user = useAuthStore((s) => s.user);
  const threadParentId = useChatStore((s) => s.threadParentId);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const threadMessages = useChatStore((s) => s.threadMessages);
  const setThreadMessages = useChatStore((s) => s.setThreadMessages);
  const appendThreadMessage = useChatStore((s) => s.appendThreadMessage);
  const closeThread = useChatStore((s) => s.closeThread);
  const messages = useChatStore(
    (s) => s.messages.get(activeChannelId || "") ?? EMPTY_MESSAGES,
  );

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const parentMessage = messages.find((m) => m.id === threadParentId);

  const { isLoading } = useQuery({
    queryKey: ["chat-thread", threadParentId],
    queryFn: async () => {
      if (!threadParentId) return [];
      const res = await api.chat.messages.thread(threadParentId, 100, 0);
      const data = res.data ?? [];
      setThreadMessages(data);
      return data;
    },
    enabled: !!threadParentId,
  });

  const handleSend = useCallback(async () => {
    if (!body.trim() || !activeChannelId || !threadParentId) return;
    setSending(true);
    try {
      const msg = await api.chat.messages.send(activeChannelId, {
        body: body.trim(),
        body_format: "text",
        parent_message_id: threadParentId,
      });
      appendThreadMessage(msg);
      setBody("");
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch (err) {
      console.error("[Chat] Failed to send thread reply:", err);
    } finally {
      setSending(false);
    }
  }, [body, activeChannelId, threadParentId, appendThreadMessage]);

  if (!threadParentId) return null;

  return (
    <div className="w-80 border-l border-base-200 bg-base-100 flex flex-col flex-shrink-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Thread</h3>
        </div>
        <button
          className="btn btn-ghost btn-xs btn-square"
          onClick={closeThread}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message */}
      {parentMessage && (
        <div className="px-4 py-3 border-b border-base-200 bg-base-200/20">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
              {(parentMessage.sender_name?.[0] || "?").toUpperCase()}
            </div>
            <span className="text-xs font-semibold">
              {parentMessage.sender_name || "Unknown"}
            </span>
            <span className="text-xs text-base-content/40">
              {format(new Date(parentMessage.created_at), "h:mm a")}
            </span>
          </div>
          <p className="text-sm text-base-content/80 line-clamp-3">
            {parentMessage.body}
          </p>
          <div className="text-xs text-base-content/40 mt-1">
            {threadMessages.length}{" "}
            {threadMessages.length === 1 ? "reply" : "replies"}
          </div>
        </div>
      )}

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-sm text-primary" />
          </div>
        ) : threadMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-base-content/40 text-sm">
            No replies yet
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {threadMessages.map((msg) => (
              <ThreadMessage
                key={msg.id}
                message={msg}
                isOwn={msg.user_id === user?.id}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Reply input */}
      <div className="border-t border-base-200 p-3 flex-shrink-0">
        <div className="flex items-center gap-2 bg-base-200/50 rounded-xl px-3 py-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Reply in thread..."
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder-base-content/40 min-h-[1.5rem] max-h-20"
            rows={1}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending}
            className="btn btn-primary btn-xs btn-circle"
          >
            {sending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadMessage({
  message,
  isOwn,
}: {
  message: ChatMessage;
  isOwn: boolean;
}) {
  if (message.is_deleted) {
    return (
      <div className="text-xs text-base-content/30 italic py-1">
        Message deleted
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0 mt-0.5">
        {message.sender_avatar ? (
          <img
            src={message.sender_avatar}
            alt=""
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          (message.sender_name?.[0] || "?").toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold">
            {message.sender_name || "Unknown"}
          </span>
          <span className="text-[10px] text-base-content/40">
            {format(new Date(message.created_at), "h:mm a")}
          </span>
        </div>
        <p className="text-sm text-base-content/90 whitespace-pre-wrap break-words">
          {message.body}
        </p>
      </div>
    </div>
  );
}
