"use client";

import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";
import { Send, Smile } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const EMOJI_QUICK = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "🙏"];

export function MessageInput() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const ws = useChatStore((s) => s.ws);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSend = useCallback(async () => {
    if (!body.trim() || !activeChannelId) return;
    setSending(true);
    try {
      await api.chat.messages.send(activeChannelId, {
        body: body.trim(),
        body_format: "text",
      });
      setBody("");
      textareaRef.current?.focus();
      // Auto-resize back
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      console.error("[Chat] Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }, [body, activeChannelId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = useCallback(() => {
    if (!ws || !activeChannelId) return;
    // Send typing start
    ws.send(
      JSON.stringify({
        action: "typing:start",
        payload: { channel_id: activeChannelId },
      }),
    );
    // Clear previous timer
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    // After 3s of inactivity, send stop
    typingTimerRef.current = setTimeout(() => {
      ws.send(
        JSON.stringify({
          action: "typing:stop",
          payload: { channel_id: activeChannelId },
        }),
      );
    }, 3000);
  }, [ws, activeChannelId]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    handleTyping();
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const insertEmoji = (emoji: string) => {
    setBody((prev) => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  if (!activeChannelId) return null;

  return (
    <div className="border-t border-base-200 bg-base-100/80 backdrop-blur-sm p-3">
      <div className="relative flex items-end gap-2 bg-base-200/50 rounded-2xl px-3 py-2">
        {/* Emoji picker */}
        <div className="relative">
          <button
            className="btn btn-ghost btn-xs btn-circle"
            onClick={() => setShowEmoji(!showEmoji)}
            title="Add emoji"
          >
            <Smile className="w-4 h-4 text-base-content/50" />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-2 bg-base-100 border border-base-200 rounded-xl shadow-lg p-2 z-20 grid grid-cols-4 gap-1">
              {EMOJI_QUICK.map((e) => (
                <button
                  key={e}
                  onClick={() => insertEmoji(e)}
                  className="btn btn-ghost btn-sm btn-square text-lg hover:scale-110 transition-transform"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-transparent resize-none outline-none text-sm text-base-content placeholder-base-content/40 max-h-40 min-h-[2rem] py-1"
          rows={1}
          disabled={sending}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="btn btn-primary btn-sm btn-circle"
          title="Send message"
        >
          {sending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Hint */}
      <div className="flex items-center justify-between px-2 mt-1">
        <span className="text-xs text-base-content/30">
          Press <kbd className="kbd kbd-xs">Enter</kbd> to send,{" "}
          <kbd className="kbd kbd-xs">Shift+Enter</kbd> for new line
        </span>
      </div>
    </div>
  );
}
