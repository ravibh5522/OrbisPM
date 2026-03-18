"use client";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { ChatChannelMember } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { Hash, Info, MessageCircle, Pin, Search, Users, X } from "lucide-react";

const EMPTY_MEMBERS: ChatChannelMember[] = [];

export function ChannelHeader() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const detailsOpen = useChatStore((s) => s.detailsOpen);
  const toggleDetails = useChatStore((s) => s.toggleDetails);
  const searchOpen = useChatStore((s) => s.searchOpen);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const connected = useChatStore((s) => s.connected);

  const channel = channels.find((c) => c.id === activeChannelId);

  if (!channel) return null;

  const isChannel = channel.type !== "dm";

  return (
    <div className="flex items-center justify-between h-14 px-4 border-b border-base-200 bg-base-100/80 backdrop-blur-sm flex-shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-base-200 flex-shrink-0">
          {isChannel ? (
            <Hash className="w-4 h-4 text-base-content/60" />
          ) : (
            <MessageCircle className="w-4 h-4 text-base-content/60" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold truncate">{channel.name}</h3>
            {/* Connection status */}
            <span
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                connected ? "bg-success" : "bg-error animate-pulse",
              )}
              title={connected ? "Connected" : "Reconnecting..."}
            />
          </div>
          {channel.description && (
            <p className="text-xs text-base-content/50 truncate">
              {channel.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Search in channel */}
        {searchOpen ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="Search messages..."
              className="input input-xs input-bordered w-48"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button
              className="btn btn-ghost btn-xs btn-square"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-sm btn-square"
            onClick={() => setSearchOpen(true)}
            title="Search messages"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        {/* Members / Info */}
        {isChannel && (
          <button
            className="btn btn-ghost btn-sm btn-square"
            title="Members"
            onClick={toggleDetails}
          >
            <Users className="w-4 h-4" />
          </button>
        )}

        <button
          className={cn(
            "btn btn-ghost btn-sm btn-square",
            detailsOpen && "btn-active",
          )}
          title="Channel details"
          onClick={toggleDetails}
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ChannelDetails() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const detailsOpen = useChatStore((s) => s.detailsOpen);
  const setDetailsOpen = useChatStore((s) => s.setDetailsOpen);
  const setChannelMembers = useChatStore((s) => s.setChannelMembers);
  const channelMembers = useChatStore(
    (s) => s.channelMembers.get(activeChannelId || "") ?? EMPTY_MEMBERS,
  );

  const channel = channels.find((c) => c.id === activeChannelId);

  const { isLoading } = useQuery({
    queryKey: ["chat-channel-members", activeChannelId],
    queryFn: async () => {
      if (!activeChannelId) return [];
      const members = await api.chat.members.list(activeChannelId);
      const data = members ?? [];
      setChannelMembers(activeChannelId, data);
      return data;
    },
    enabled: !!activeChannelId && detailsOpen,
  });

  // Pins
  const { data: pins } = useQuery({
    queryKey: ["chat-pins", activeChannelId],
    queryFn: async () => (await api.chat.pins.list(activeChannelId!)) ?? [],
    enabled: !!activeChannelId && detailsOpen,
  });

  if (!detailsOpen || !channel) return null;

  return (
    <div className="w-72 border-l border-base-200 bg-base-100 flex flex-col flex-shrink-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-200">
        <h3 className="text-sm font-bold">Details</h3>
        <button
          className="btn btn-ghost btn-xs btn-square"
          onClick={() => setDetailsOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Channel info */}
        <div className="px-4 py-3 border-b border-base-200">
          <h4 className="text-sm font-semibold mb-1">{channel.name}</h4>
          {channel.description && (
            <p className="text-xs text-base-content/60">
              {channel.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-base-content/50">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {channel.member_count || channelMembers.length} members
            </span>
            {channel.type !== "dm" && (
              <span className="capitalize badge badge-sm badge-ghost">
                {channel.type}
              </span>
            )}
          </div>
        </div>

        {/* Pinned Messages */}
        {pins && pins.length > 0 && (
          <div className="px-4 py-3 border-b border-base-200">
            <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">
              Pinned Messages ({pins.length})
            </h4>
            <div className="flex flex-col gap-1.5">
              {pins.slice(0, 5).map((pin) => (
                <div
                  key={pin.message_id}
                  className="bg-base-200/50 rounded-lg px-2.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <Pin className="w-3 h-3 text-warning" />
                    <span className="font-medium">
                      {pin.message?.sender_name || "Unknown"}
                    </span>
                  </div>
                  <p className="text-base-content/70 line-clamp-2">
                    {pin.message?.body || "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        <div className="px-4 py-3">
          <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">
            Members
          </h4>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-8 w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {channelMembers.map((member) => (
                <MemberItem key={member.user_id} member={member} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberItem({ member }: { member: ChatChannelMember }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/50">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt=""
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          (member.display_name?.[0] || member.email?.[0] || "?").toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">
          {member.display_name || member.email}
        </div>
        {member.role !== "member" && (
          <span className="text-[10px] text-base-content/40 capitalize">
            {member.role}
          </span>
        )}
      </div>
    </div>
  );
}
