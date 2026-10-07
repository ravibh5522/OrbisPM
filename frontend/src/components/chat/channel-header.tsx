"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type { ChatChannelMember, OrgMemberInfo } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bookmark,
  Hash,
  Info,
  MessageCircle,
  Pencil,
  Pin,
  Search,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useChannelPermissions } from "@/hooks/use-channel-permissions";
import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import { SavedMessagesModal } from "@/components/chat/saved-messages-modal";
import { CHAT_BACKGROUNDS } from "@/components/chat/chat-backgrounds";

const EMPTY_MEMBERS: ChatChannelMember[] = [];

export function ChannelHeader() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const detailsOpen = useChatStore((s) => s.detailsOpen);
  const toggleDetails = useChatStore((s) => s.toggleDetails);
  const chatBackground = useChatStore((s) => s.chatBackground);
  const setChatBackground = useChatStore((s) => s.setChatBackground);
  const [savedOpen, setSavedOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const bgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bgOpen) return;
    const handler = (e: MouseEvent) => {
      if (bgRef.current && !bgRef.current.contains(e.target as Node))
        setBgOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bgOpen]);
  const searchOpen = useChatStore((s) => s.searchOpen);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const connected = useChatStore((s) => s.connected);

  const storeChannel = channels.find((c) => c.id === activeChannelId);

  // Fetch channel info independently so the header doesn't wait for the full sidebar
  const { data: fetchedChannel } = useQuery({
    queryKey: ["chat-channel", activeChannelId],
    queryFn: () => api.chat.channels.get(activeChannelId!),
    enabled: !!activeChannelId && !storeChannel,
    staleTime: 60_000,
  });

  const channel = storeChannel ?? fetchedChannel ?? null;

  // Show skeleton only while both store and fetch are unavailable
  if (!channel) {
    if (!activeChannelId) return null;
    return (
      <div className="flex items-center h-14 px-4 border-b border-base-300 flex-shrink-0">
        <div className="skeleton h-5 w-48 rounded-lg" />
      </div>
    );
  }

  const isChannel = channel.type !== "dm";
  const displayName =
    channel.type === "dm"
      ? channel.name || channel.description || "Direct Message"
      : channel.name || "Unnamed Channel";

  return (
    <div className="flex items-center justify-between h-14 px-4 border-b border-base-300 flex-shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 flex-shrink-0">
          {isChannel ? (
            <Hash className="w-4 h-4 text-base-content/60" />
          ) : (
            <MessageCircle className="w-4 h-4 text-base-content/60" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold truncate">{displayName}</h3>
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
            <Input
              type="text"
              placeholder="Search messages..."
              className="input-xs w-48"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <Button
              variant="ghost"
              size="xs"
              className="btn-square"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="btn-square"
            onClick={() => setSearchOpen(true)}
            title="Search messages"
          >
            <Search className="w-4 h-4" />
          </Button>
        )}

        {/* Chat background theme */}
        <div className="relative" ref={bgRef}>
          <Button
            variant="ghost"
            size="sm"
            className="btn-square"
            title="Chat background"
            onClick={() => setBgOpen((o) => !o)}
          >
            <Palette className="w-4 h-4" />
          </Button>
          {bgOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-base-100 border border-base-200 rounded-xl shadow-lg p-2 z-30">
              <div className="px-1 pb-1.5 text-[10px] uppercase tracking-wide text-base-content/40">
                Chat background
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CHAT_BACKGROUNDS.map((b) => (
                  <button
                    key={b.id}
                    className={cn(
                      "h-12 rounded-lg border-2 bg-base-200 flex items-end justify-center pb-0.5 text-[9px] text-base-content/60 transition-colors",
                      chatBackground === b.id
                        ? "border-primary"
                        : "border-base-200 hover:border-base-content/30",
                    )}
                    style={
                      b.image
                        ? { backgroundImage: b.image, backgroundSize: b.size }
                        : undefined
                    }
                    title={b.label}
                    onClick={() => {
                      setChatBackground(b.id);
                      setBgOpen(false);
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Saved messages */}
        <Button
          variant="ghost"
          size="sm"
          className="btn-square"
          title="Saved messages"
          onClick={() => setSavedOpen(true)}
        >
          <Bookmark className="w-4 h-4" />
        </Button>

        {/* Members / Info */}
        {isChannel && (
          <Button
            variant="ghost"
            size="sm"
            className="btn-square"
            title="Members"
            onClick={toggleDetails}
          >
            <Users className="w-4 h-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className={cn("btn-square", detailsOpen && "btn-active")}
          title="Channel details"
          onClick={toggleDetails}
        >
          <Info className="w-4 h-4" />
        </Button>
      </div>

      <SavedMessagesModal open={savedOpen} onClose={() => setSavedOpen(false)} />
    </div>
  );
}

export function ChannelDetails() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const detailsOpen = useChatStore((s) => s.detailsOpen);
  const setDetailsOpen = useChatStore((s) => s.setDetailsOpen);
  const setChannelMembers = useChatStore((s) => s.setChannelMembers);
  const updateChannelInStore = useChatStore((s) => s.updateChannel);
  const removeChannelFromStore = useChatStore((s) => s.removeChannel);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const channelMembers = useChatStore(
    (s) => s.channelMembers.get(activeChannelId || "") ?? EMPTY_MEMBERS,
  );
  const [showAddMember, setShowAddMember] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const channel = channels.find((c) => c.id === activeChannelId);
  const qc = useQueryClient();
  const { can } = useChannelPermissions(activeChannelId || undefined);

  const refreshChannelViews = () =>
    qc.invalidateQueries({ queryKey: ["chat-sidebar"] });

  const toggleMute = async () => {
    if (!channel) return;
    const nextMuted = !channel.is_muted;
    setBusy(true);
    try {
      await api.chat.channels.updateSettings(channel.id, { is_muted: nextMuted });
      updateChannelInStore({ ...channel, is_muted: nextMuted });
      toast.success(nextMuted ? "Channel muted" : "Channel unmuted");
    } catch {
      toast.error("Couldn't update channel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const togglePinChannel = async () => {
    if (!channel) return;
    const nextPinned = !channel.is_pinned;
    setBusy(true);
    try {
      await api.chat.channels.updateSettings(channel.id, {
        is_pinned: nextPinned,
      });
      updateChannelInStore({ ...channel, is_pinned: nextPinned });
      refreshChannelViews();
      toast.success(nextPinned ? "Pinned to top" : "Unpinned");
    } catch {
      toast.error("Couldn't update channel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!channel || !nameValue.trim() || nameValue.trim() === channel.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      const updated = await api.chat.channels.update(channel.id, {
        name: nameValue.trim(),
      });
      updateChannelInStore(updated);
      refreshChannelViews();
      setRenaming(false);
      toast.success("Channel renamed");
    } catch {
      toast.error("Couldn't rename the channel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!channel) return;
    setBusy(true);
    try {
      await api.chat.channels.archive(channel.id);
      removeChannelFromStore(channel.id);
      setActiveChannel(null);
      setDetailsOpen(false);
      refreshChannelViews();
      toast.success("Channel archived");
    } catch {
      toast.error("Couldn't archive the channel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!channel) return;
    if (
      !window.confirm(
        `Delete "${channel.name}"? This removes the channel and its messages for everyone.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.chat.channels.delete(channel.id);
      removeChannelFromStore(channel.id);
      setActiveChannel(null);
      setDetailsOpen(false);
      refreshChannelViews();
      toast.success("Channel deleted");
    } catch {
      toast.error("Couldn't delete the channel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

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

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!activeChannelId) return;
      await api.chat.members.remove(activeChannelId, userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["chat-channel-members", activeChannelId],
      });
      toast.success("Member removed");
    },
  });

  if (!detailsOpen || !channel) return null;

  const isChannel = channel.type !== "dm";

  return (
    <div className="w-72 border-l border-base-200 flex flex-col flex-shrink-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-200">
        <h3 className="text-sm font-bold">Details</h3>
        <Button
          variant="ghost"
          size="xs"
          className="btn-square"
          onClick={() => setDetailsOpen(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Channel info */}
        <div className="px-4 py-3 border-b border-base-200">
          <h4 className="text-sm font-semibold mb-1">
            {channel.type === "dm"
              ? channel.name || channel.description || "Direct Message"
              : channel.name}
          </h4>
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

        {/* Channel settings & management */}
        {isChannel && (
          <div className="px-3 py-2 border-b border-base-200 flex flex-col gap-0.5">
            {renaming && (
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRename()}
                  className="flex-1"
                  autoFocus
                />
                <Button size="xs" onClick={handleRename} loading={busy}>
                  {!busy && "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setRenaming(false)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm hover:bg-base-200 transition-colors disabled:opacity-50"
              onClick={toggleMute}
              disabled={busy}
            >
              {channel.is_muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              {channel.is_muted ? "Unmute channel" : "Mute channel"}
            </button>
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm hover:bg-base-200 transition-colors disabled:opacity-50"
              onClick={togglePinChannel}
              disabled={busy}
            >
              <Pin className="w-4 h-4" />
              {channel.is_pinned ? "Unpin from top" : "Pin to top"}
            </button>
            {can("channel", "update") && !renaming && (
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm hover:bg-base-200 transition-colors disabled:opacity-50"
                onClick={() => {
                  setNameValue(channel.name);
                  setRenaming(true);
                }}
                disabled={busy}
              >
                <Pencil className="w-4 h-4" />
                Rename channel
              </button>
            )}
            {can("channel", "archive") && (
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm hover:bg-base-200 transition-colors disabled:opacity-50"
                onClick={handleArchive}
                disabled={busy}
              >
                <Archive className="w-4 h-4" />
                Archive channel
              </button>
            )}
            {can("channel", "delete") && (
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                onClick={handleDelete}
                disabled={busy}
              >
                <Trash2 className="w-4 h-4" />
                Delete channel
              </button>
            )}
          </div>
        )}

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
                  className="bg-base-100/50 border border-base-200/60 rounded-lg px-2.5 py-2 text-xs"
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
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
              Members
            </h4>
            {isChannel && (
              <Button
                variant="ghost"
                size="xs"
                className="btn-square"
                title="Add member"
                onClick={() => setShowAddMember((p) => !p)}
              >
                <UserPlus className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {showAddMember && activeChannelId && (
            <DetailsAddMemberSearch
              channelId={activeChannelId}
              existingMembers={channelMembers}
              onClose={() => setShowAddMember(false)}
            />
          )}

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-8 w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {channelMembers.map((member) => (
                <MemberItem
                  key={member.user_id}
                  member={member}
                  channelId={activeChannelId!}
                  onRemove={() => removeMember.mutate(member.user_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberItem({
  member,
  channelId,
  onRemove,
}: {
  member: ChatChannelMember;
  channelId: string;
  onRemove: () => void;
}) {
  const currentUser = useAuthStore((s) => s.user);
  const isCurrentUser = currentUser?.internal_id === member.user_id;
  const qc = useQueryClient();

  const updateRole = useMutation({
    mutationFn: async (newRole: string) => {
      await api.chat.members.updateRole(channelId, member.user_id, newRole);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["chat-channel-members", channelId],
      });
      toast.success("Role updated");
    },
  });

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/50 group/member">
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
      {!isCurrentUser && (
        <div className="opacity-0 group-hover/member:opacity-100 flex items-center gap-0.5 transition-opacity">
          {member.role === "member" && (
            <Button
              variant="ghost"
              size="xs"
              className="btn-square"
              title="Make admin"
              onClick={() => updateRole.mutate("admin")}
            >
              <Shield className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="btn-square text-error"
            title="Remove member"
            onClick={onRemove}
          >
            <UserMinus className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function DetailsAddMemberSearch({
  channelId,
  existingMembers,
  onClose,
}: {
  channelId: string;
  existingMembers: ChatChannelMember[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    inputRef.current?.focus();
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading } = useQuery<OrgMemberInfo[]>({
    queryKey: ["chat-user-search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      return (await api.chat.users.search(debouncedQuery.trim(), 10)) ?? [];
    },
    enabled: !!debouncedQuery.trim(),
  });

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      await api.chat.members.add(channelId, userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["chat-channel-members", channelId],
      });
      toast.success("Member added");
    },
  });

  const existingIds = new Set(existingMembers.map((m) => m.user_id));
  const filteredResults = results?.filter((u) => !existingIds.has(u.user_id));

  return (
    <div className="mb-2 border border-base-200/60 rounded-lg bg-base-100/50 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300/50">
        <UserPlus className="w-3.5 h-3.5 text-base-content/40" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search users..."
          className="flex-1 bg-transparent text-xs outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <Button
          variant="ghost"
          size="xs"
          className="btn-square"
          onClick={onClose}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="max-h-36 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-2">
            <span className="loading loading-spinner loading-xs" />
          </div>
        )}
        {!isLoading &&
          debouncedQuery &&
          (!filteredResults || filteredResults.length === 0) && (
            <p className="text-[10px] text-center text-base-content/40 py-2">
              No users found
            </p>
          )}
        {!debouncedQuery && (
          <p className="text-[10px] text-center text-base-content/40 py-2">
            Type to search
          </p>
        )}
        {filteredResults?.map((u) => (
          <button
            key={u.user_id}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-base-200 transition-colors text-left"
            onClick={() => addMember.mutate(u.user_id)}
            disabled={addMember.isPending}
          >
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[9px]">
              {(u.display_name?.[0] || u.email?.[0] || "?").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium truncate block">
                {u.display_name || u.email}
              </span>
            </div>
            <UserPlus className="w-3 h-3 text-success" />
          </button>
        ))}
      </div>
    </div>
  );
}
