"use client";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type { ChatChannel } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { Hash, MessageCircle, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

interface ChannelListProps {
  onCreateChannel: () => void;
}

export function ChannelList({ onCreateChannel }: ChannelListProps) {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const user = useAuthStore((s) => s.user);
  const { channels, setChannels, activeChannelId, setActiveChannel } =
    useChatStore();
  const [filter, setFilter] = useState("");

  const { isLoading } = useQuery({
    queryKey: ["chat-channels"],
    queryFn: async () => {
      const res = await api.chat.channels.list(100, 0);
      const data = res.data ?? [];
      setChannels(data);
      return data;
    },
    enabled: !!currentOrg,
    refetchInterval: 30_000,
  });

  const filteredChannels = useMemo(() => {
    if (!filter) return channels ?? [];
    const q = filter.toLowerCase();
    return (channels ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [channels, filter]);

  const pinnedChannels = useMemo(
    () => filteredChannels.filter((c) => c.type === "dm"),
    [filteredChannels],
  );
  const groupChannels = useMemo(
    () => filteredChannels.filter((c) => c.type !== "dm"),
    [filteredChannels],
  );

  const getChannelDisplayName = (channel: ChatChannel) => {
    if (channel.type === "dm" && channel.name === "DM") {
      // For DMs, the backend stores both user IDs in dm_pair
      return channel.description || "Direct Message";
    }
    return channel.name;
  };

  const getChannelIcon = (channel: ChatChannel) => {
    switch (channel.type) {
      case "dm":
        return <MessageCircle className="w-4 h-4 flex-shrink-0" />;
      case "team":
        return <Users className="w-4 h-4 flex-shrink-0" />;
      default:
        return <Hash className="w-4 h-4 flex-shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-base-content">Messages</h2>
          <button
            className="btn btn-ghost btn-sm btn-square"
            onClick={onCreateChannel}
            title="New channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search conversations..."
            className="input input-sm input-bordered w-full pl-9 bg-base-200/50"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-base-content/50">
            <MessageCircle className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="text-xs mt-1">Start a new channel to chat</p>
            <button
              className="btn btn-primary btn-sm mt-3"
              onClick={onCreateChannel}
            >
              <Plus className="w-4 h-4" /> New Channel
            </button>
          </div>
        ) : (
          <>
            {/* Direct Messages */}
            {pinnedChannels.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1.5">
                  <span className="text-xs font-semibold text-base-content/40 uppercase tracking-wider">
                    Direct Messages
                  </span>
                </div>
                {pinnedChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    displayName={getChannelDisplayName(channel)}
                    icon={getChannelIcon(channel)}
                    onClick={() => setActiveChannel(channel.id)}
                  />
                ))}
              </div>
            )}

            {/* Channels */}
            {groupChannels.length > 0 && (
              <div>
                <div className="px-2 py-1.5">
                  <span className="text-xs font-semibold text-base-content/40 uppercase tracking-wider">
                    Channels
                  </span>
                </div>
                {groupChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    displayName={getChannelDisplayName(channel)}
                    icon={getChannelIcon(channel)}
                    onClick={() => setActiveChannel(channel.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChannelItem({
  channel,
  isActive,
  displayName,
  icon,
  onClick,
}: {
  channel: ChatChannel;
  isActive: boolean;
  displayName: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 text-left group",
        isActive
          ? "bg-primary text-primary-content shadow-sm"
          : "hover:bg-base-200/70 text-base-content",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0",
          isActive ? "bg-primary-content/15" : "bg-base-200",
        )}
      >
        {channel.avatar_url ? (
          <img
            src={channel.avatar_url}
            alt={displayName}
            className="w-8 h-8 rounded-lg object-cover"
          />
        ) : (
          icon
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium truncate">{displayName}</span>
          {(channel.unread_count ?? 0) > 0 && !isActive && (
            <span className="badge badge-primary badge-xs ml-1">
              {channel.unread_count}
            </span>
          )}
        </div>
        {channel.last_message && (
          <p
            className={cn(
              "text-xs truncate mt-0.5",
              isActive ? "text-primary-content/70" : "text-base-content/50",
            )}
          >
            {channel.last_message}
          </p>
        )}
      </div>
    </button>
  );
}
