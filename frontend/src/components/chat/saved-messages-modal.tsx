"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bookmark, X } from "lucide-react";
import { toast } from "sonner";

interface SavedMessagesModalProps {
  open: boolean;
  onClose: () => void;
}

export function SavedMessagesModal({ open, onClose }: SavedMessagesModalProps) {
  const qc = useQueryClient();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  const { data: bookmarks, isLoading } = useQuery({
    queryKey: ["chat-bookmarks"],
    queryFn: async () => (await api.chat.bookmarks.list(100, 0)).data ?? [],
    enabled: open,
  });

  const handleRemove = async (messageId: string) => {
    try {
      await api.chat.bookmarks.remove(messageId);
      qc.invalidateQueries({ queryKey: ["chat-bookmarks"] });
    } catch {
      toast.error("Couldn't remove the saved message. Please try again.");
    }
  };

  const handleOpen = (channelId?: string) => {
    if (channelId) {
      setActiveChannel(channelId);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-base-100 rounded-2xl shadow-2xl border border-base-200 p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-bold">Saved Messages</h3>
          </div>
          <Button variant="ghost" size="sm" className="btn-square" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto -mx-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <span className="loading loading-spinner loading-md text-primary" />
            </div>
          ) : !bookmarks || bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-base-content/40">
              <Bookmark className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm font-medium">No saved messages yet</p>
              <p className="text-xs mt-1">
                Bookmark a message to find it here later.
              </p>
            </div>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.message_id}
                className="group flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors"
              >
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => handleOpen(bm.message?.channel_id)}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold truncate">
                      {bm.message?.sender_name || "Unknown"}
                    </span>
                    {bm.message?.created_at && (
                      <span className="text-xs text-base-content/40 flex-shrink-0">
                        {format(new Date(bm.message.created_at), "MMM d, HH:mm")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-base-content/70 line-clamp-2">
                    {bm.message?.body?.trim() || "(attachment)"}
                  </p>
                </button>
                <button
                  className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                  onClick={() => handleRemove(bm.message_id)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
