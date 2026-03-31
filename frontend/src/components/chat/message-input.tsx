"use client";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { OrgMemberInfo } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { Paperclip, Send, Smile, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const EMOJI_QUICK = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "🙏"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

interface FilePreview {
  file: File;
  preview?: string;
  uploading: boolean;
  progress: number;
  error?: string;
}

export function MessageInput() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const ws = useChatStore((s) => s.ws);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0); // cursor position of the "@"
  const [mentionIndex, setMentionIndex] = useState(0); // highlighted option

  const [debouncedMentionQuery, setDebouncedMentionQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedMentionQuery(mentionQuery ?? ""),
      200,
    );
    return () => clearTimeout(timer);
  }, [mentionQuery]);

  const { data: mentionResults } = useQuery<OrgMemberInfo[]>({
    queryKey: ["mention-users", debouncedMentionQuery],
    queryFn: async () => {
      if (!debouncedMentionQuery) return [];
      return (await api.chat.users.search(debouncedMentionQuery, 6)) ?? [];
    },
    enabled: mentionQuery !== null && !!debouncedMentionQuery,
  });

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    }
    if (!ALLOWED_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
      return "File type not supported";
    }
    return null;
  };

  const addFiles = (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const previews: FilePreview[] = fileArray.map((file) => {
      const error = validateFile(file);
      return {
        file,
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
        uploading: false,
        progress: 0,
        error: error ?? undefined,
      };
    });
    setFiles((prev) => [...prev, ...previews]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const uploadFile = async (
    filePreview: FilePreview,
    index: number,
  ): Promise<string | null> => {
    if (filePreview.error) return null;

    setFiles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], uploading: true };
      return next;
    });

    try {
      const attachment = await api.chat.upload.file(
        activeChannelId!,
        filePreview.file,
        body,
      );
      setFiles((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], uploading: false, progress: 100 };
        return next;
      });
      return attachment?.id ?? null;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setFiles((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], uploading: false, error: errorMessage };
        return next;
      });
      return null;
    }
  };

  const handleSend = useCallback(async () => {
    if ((!body.trim() && files.length === 0) || !activeChannelId) return;
    setSending(true);

    try {
      // Upload files first if any
      if (files.length > 0) {
        const validFiles = files.filter((f) => !f.error);
        for (let i = 0; i < validFiles.length; i++) {
          const idx = files.findIndex((f) => f === validFiles[i]);
          await uploadFile(validFiles[i], idx);
        }
        // Clear files after upload
        files.forEach((f) => {
          if (f.preview) URL.revokeObjectURL(f.preview);
        });
        setFiles([]);
      }

      // Send text message if any (files already include body in upload)
      if (body.trim() && files.length === 0) {
        await api.chat.messages.send(activeChannelId, {
          body: body.trim(),
          body_format: "text",
        });
      }

      setBody("");
      textareaRef.current?.focus();
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      console.error("[Chat] Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }, [body, activeChannelId, files]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle @mention navigation
    if (mentionQuery !== null && mentionResults && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionResults.length) % mentionResults.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = useCallback(() => {
    if (!ws || !activeChannelId) return;
    ws.send(
      JSON.stringify({
        action: "typing:start",
        payload: { channel_id: activeChannelId },
      }),
    );
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
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
    const val = e.target.value;
    setBody(val);
    handleTyping();
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";

    // Detect @mention trigger
    const cursorPos = el.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setMentionStart(cursorPos - atMatch[0].length);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (user: OrgMemberInfo) => {
    const name = user.display_name || user.email;
    const before = body.slice(0, mentionStart);
    const after = body.slice(mentionStart + (mentionQuery?.length ?? 0) + 1); // +1 for @
    const newBody = `${before}@${name} ${after}`;
    setBody(newBody);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const insertEmoji = (emoji: string) => {
    setBody((prev) => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  if (!activeChannelId) return null;

  return (
    <div
      className={cn(
        "border-t border-base-300 bg-base-200 p-3 transition-colors",
        isDragging && "border-primary bg-primary/5",
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 bg-base-200 rounded-lg">
          {files.map((fp, i) => (
            <div key={i} className="relative group">
              {fp.preview ? (
                <img
                  src={fp.preview}
                  alt={fp.file.name}
                  className={cn(
                    "w-16 h-16 object-cover rounded-lg border-2",
                    fp.error ? "border-error" : "border-base-300",
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "w-16 h-16 flex flex-col items-center justify-center rounded-lg border-2 bg-base-200 text-xs",
                    fp.error ? "border-error" : "border-base-300",
                  )}
                >
                  <span className="text-xl">📄</span>
                  <span className="truncate max-w-[56px] text-[10px] mt-0.5">
                    {fp.file.name.split(".").pop()?.toUpperCase()}
                  </span>
                </div>
              )}
              {fp.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-base-100/70 rounded-lg">
                  <span className="loading loading-spinner loading-xs" />
                </div>
              )}
              {fp.error && (
                <div className="absolute bottom-0 left-0 right-0 bg-error text-error-content text-[8px] text-center py-0.5 rounded-b-lg">
                  {fp.error}
                </div>
              )}
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 btn btn-error btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg z-10 pointer-events-none">
          <span className="text-primary font-medium">Drop files here</span>
        </div>
      )}

      <div className="relative flex items-end gap-2 bg-base-200 rounded-2xl px-3 py-2">
        {/* @mention dropdown */}
        {mentionQuery !== null &&
          mentionResults &&
          mentionResults.length > 0 && (
            <div
              ref={mentionDropdownRef}
              className="absolute bottom-full left-0 right-0 mb-1 bg-base-100 border border-base-200 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto"
            >
              <div className="px-2 py-1.5 text-[11px] font-semibold text-base-content/40 uppercase tracking-wider">
                Members matching &quot;{mentionQuery}&quot;
              </div>
              {mentionResults.map((u, i) => (
                <button
                  key={u.user_id}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-base-200/60 transition-colors",
                    i === mentionIndex && "bg-base-200/60",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent blur
                    insertMention(u);
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] flex-shrink-0">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      (u.display_name?.[0] || u.email?.[0] || "?").toUpperCase()
                    )}
                  </div>
                  <span className="truncate">{u.display_name || u.email}</span>
                  {u.display_name && (
                    <span className="text-xs text-base-content/40 ml-auto truncate">
                      {u.email}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        {/* File upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          className="btn btn-ghost btn-xs btn-circle"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <Paperclip className="w-4 h-4 text-base-content/50" />
        </button>

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
          disabled={
            (!body.trim() && files.filter((f) => !f.error).length === 0) ||
            sending
          }
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
    </div>
  );
}
