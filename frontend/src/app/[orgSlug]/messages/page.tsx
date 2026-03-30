"use client";

import {
  ChannelDetails,
  ChannelHeader,
} from "@/components/chat/channel-header";
import { ChannelList } from "@/components/chat/channel-list";
import { CreateChannelModal } from "@/components/chat/create-channel-modal";
import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { ThreadPanel } from "@/components/chat/thread-panel";
import { useChatSocket } from "@/hooks/use-chat-socket";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { useEffect, useState } from "react";

export default function MessagesPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const detailsOpen = useChatStore((s) => s.detailsOpen);
  const threadParentId = useChatStore((s) => s.threadParentId);
  const ws = useChatStore((s) => s.ws);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createChannelContext, setCreateChannelContext] = useState<{
    teamId?: string;
    groupChannelId?: string;
  }>({});

  // Connect chat WebSocket
  const { send } = useChatSocket(currentOrg?.id);

  // Join active channel room via WS
  useEffect(() => {
    if (!ws || !activeChannelId || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        action: "channel:join",
        payload: { channel_id: activeChannelId },
      }),
    );
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            id: crypto.randomUUID(),
            action: "channel:leave",
            payload: { channel_id: activeChannelId },
          }),
        );
      }
    };
  }, [ws, activeChannelId]);

  // Reset chat store on unmount
  useEffect(() => {
    return () => {
      useChatStore.getState().reset();
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-5rem)] bg-base-100 rounded-2xl border border-base-200 shadow-sm overflow-hidden">
      {/* Left: Conversation List + Channel Panel */}
      <div
        className={cn(
          "border-r border-base-300/50 overflow-hidden",
          activeChannelId
            ? "hidden md:flex md:w-80 lg:w-96 flex-shrink-0"
            : "flex-1",
        )}
      >
        <ChannelList
          onCreateChannel={(ctx) => {
            setCreateChannelContext(ctx ?? {});
            setCreateModalOpen(true);
          }}
        />
      </div>

      {/* Center: Chat Area */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0",
          !activeChannelId && "hidden",
        )}
      >
        <ChannelHeader />
        <MessageList />
        <MessageInput />
      </div>

      {/* Right: Details / Thread Panel */}
      {threadParentId && <ThreadPanel />}
      {detailsOpen && !threadParentId && <ChannelDetails />}

      {/* Create Channel Modal */}
      <CreateChannelModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        teamId={createChannelContext.teamId}
        groupChannelId={createChannelContext.groupChannelId}
      />
    </div>
  );
}
