"use client";

import {
  canManageRole,
  getAssignableRoles,
  useChannelPermissions,
} from "@/hooks/use-channel-permissions";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type {
  ChatChannel,
  ChatChannelMember,
  ChatMemberRole,
  OrgMemberInfo,
  SidebarData,
  SidebarTeam,
} from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FolderKanban,
  Hash,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────── */

/** Unified entry in the left panel: team, group, DM, or project */
interface ConversationItem {
  id: string;
  name: string;
  kind: "team" | "group" | "dm" | "project";
  lastActivity: string | null;
  team?: SidebarTeam;
  channel?: ChatChannel;
  unreadCount: number;
}

interface ChannelListProps {
  onCreateChannel: (ctx?: { teamId?: string; groupChannelId?: string }) => void;
}

/* ─── Main ChannelList ──────────────────────────────── */

export function ChannelList({ onCreateChannel }: ChannelListProps) {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const user = useAuthStore((s) => s.user);
  const { setChannels, activeChannelId, setActiveChannel } = useChatStore();
  const [selectedItem, setSelectedItem] = useState<ConversationItem | null>(
    null,
  );
  const [filter, setFilter] = useState("");

  // ─── Pre-load last active channel from localStorage ─
  // This runs before sidebar loads so MessageList starts fetching immediately
  useEffect(() => {
    useChatStore.getState().initFromStorage();
  }, []);

  // ─── Sidebar data ──────────────────────────────────
  const { data: sidebarData, isLoading } = useQuery<SidebarData>({
    queryKey: ["chat-sidebar"],
    queryFn: async () => {
      const data = await api.chat.sidebar.get();
      const allChannels = [
        ...(data?.teams?.flatMap((t: SidebarTeam) => t.channels) ?? []),
        ...(data?.project_channels ?? []),
        ...(data?.dm_channels ?? []),
        ...(data?.group_channels ?? []),
      ];
      setChannels(allChannels);
      return (
        data ?? {
          categories: [],
          teams: [],
          project_channels: [],
          dm_channels: [],
          group_channels: [],
        }
      );
    },
    enabled: !!currentOrg,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // ─── Build conversation list sorted by latest activity ─
  const conversations = useMemo(() => {
    if (!sidebarData) return [];
    const items: ConversationItem[] = [];

    for (const team of sidebarData.teams ?? []) {
      const latestChannel = team.channels.reduce(
        (best, ch) => {
          const t = ch.last_activity || ch.updated_at || ch.created_at;
          return !best || (t && t > best) ? t : best;
        },
        null as string | null,
      );
      items.push({
        id: `team:${team.id}`,
        name: team.name,
        kind: "team",
        lastActivity: latestChannel,
        team,
        unreadCount: team.channels.reduce(
          (sum, ch) => sum + (ch.unread_count ?? 0),
          0,
        ),
      });
    }

    for (const ch of sidebarData.group_channels ?? []) {
      items.push({
        id: `group:${ch.id}`,
        name: ch.name || "Unnamed Group",
        kind: "group",
        lastActivity: ch.last_activity || ch.updated_at || ch.created_at,
        channel: ch,
        unreadCount: ch.unread_count ?? 0,
      });
    }

    for (const ch of sidebarData.dm_channels ?? []) {
      items.push({
        id: `dm:${ch.id}`,
        name: ch.name || ch.description || "Direct Message",
        kind: "dm",
        lastActivity: ch.last_activity || ch.updated_at || ch.created_at,
        channel: ch,
        unreadCount: ch.unread_count ?? 0,
      });
    }

    for (const ch of sidebarData.project_channels ?? []) {
      items.push({
        id: `project:${ch.id}`,
        name: ch.name || "Project",
        kind: "project",
        lastActivity: ch.last_activity || ch.updated_at || ch.created_at,
        channel: ch,
        unreadCount: ch.unread_count ?? 0,
      });
    }

    items.sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return b.lastActivity.localeCompare(a.lastActivity);
    });

    return items;
  }, [sidebarData]);

  // ─── Presence ──────────────────────────────────────
  const setPresenceMap = useChatStore((s) => s.setPresenceMap);
  const presenceMap = useChatStore((s) => s.presenceMap);

  const { data: onlineUsers } = useQuery<Set<string>>({
    queryKey: ["chat-presence"],
    queryFn: async () => {
      const res = await api.chat.presence.get();
      // Populate enriched presence data in store
      if (res.users) {
        const map = new Map<string, { online: boolean; last_seen?: string }>();
        for (const [uid, info] of Object.entries(res.users)) {
          map.set(uid, { online: info.online, last_seen: info.last_seen });
        }
        setPresenceMap(map);
      }
      return new Set(res.online_users ?? []);
    },
    enabled: !!currentOrg,
    refetchInterval: 15_000,
  });

  // Auto-select first conversation on initial load
  useEffect(() => {
    if (!conversations.length || activeChannelId) return;
    const first = conversations[0];
    if (
      first.kind === "dm" ||
      first.kind === "project" ||
      first.kind === "group"
    ) {
      setActiveChannel(first.channel!.id);
    } else if (first.kind === "team" && first.team?.channels.length) {
      setSelectedItem(first);
      setActiveChannel(first.team.channels[0].id);
    }
  }, [conversations, activeChannelId, setActiveChannel]);

  // Handle conversation click
  const handleItemClick = useCallback(
    (item: ConversationItem) => {
      setSelectedItem(item);
      if (item.kind === "dm" || item.kind === "project") {
        setActiveChannel(item.channel!.id);
      } else if (item.kind === "group") {
        setActiveChannel(item.channel!.id);
      } else if (item.kind === "team") {
        const team = item.team!;
        if (team.channels.length) {
          setActiveChannel(team.channels[0].id);
        }
      }
    },
    [setActiveChannel],
  );

  // Filter
  const filteredConversations = useMemo(() => {
    if (!filter) return conversations;
    const q = filter.toLowerCase();
    return conversations.filter((c) => c.name.toLowerCase().includes(q));
  }, [conversations, filter]);

  // Which item is active based on activeChannelId
  const activeItemId = useMemo(() => {
    if (!activeChannelId) return null;
    const direct = conversations.find((c) => c.channel?.id === activeChannelId);
    if (direct) return direct.id;
    const team = conversations.find(
      (c) =>
        c.kind === "team" &&
        c.team?.channels.some((ch) => ch.id === activeChannelId),
    );
    if (team) return team.id;
    return selectedItem?.id ?? null;
  }, [activeChannelId, conversations, selectedItem]);

  // Keep selectedItem in sync with fresh sidebar data so Panel 2 updates
  // after channel creation, member changes, etc.
  useEffect(() => {
    if (!selectedItem) return;
    const fresh = conversations.find((c) => c.id === selectedItem.id);
    if (fresh && fresh !== selectedItem) {
      setSelectedItem(fresh);
    }
  }, [conversations, selectedItem]);

  // Show channel panel for teams
  const showTeamPanel = selectedItem?.kind === "team" && selectedItem.team;
  const showGroupPanel = selectedItem?.kind === "group" && selectedItem.channel;

  if (isLoading) {
    return (
      <div className="flex h-full px-3 py-3">
        <div className="w-full">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-12 w-full rounded-lg mb-2" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* ─── Panel 1: Unified Conversation List ──── */}
      <div
        className={cn(
          "flex flex-col min-w-0",
          showTeamPanel || showGroupPanel
            ? "w-[200px] flex-shrink-0 border-r border-base-300"
            : "flex-1",
        )}
      >
        <ConversationPanel
          items={filteredConversations}
          activeItemId={activeItemId}
          onItemClick={handleItemClick}
          onlineUsers={onlineUsers}
          presenceMap={presenceMap}
          currentUserId={user?.internal_id ?? ""}
          filter={filter}
          setFilter={setFilter}
        />
      </div>

      {/* ─── Panel 2: Channels + Members (teams) ─── */}
      {showTeamPanel && selectedItem.team && (
        <div className="flex-1 flex flex-col min-w-0">
          <TeamChannelPanel
            team={selectedItem.team}
            activeChannelId={activeChannelId}
            onSelectChannel={setActiveChannel}
            onCreateChannel={() =>
              onCreateChannel({ teamId: selectedItem.team!.id })
            }
          />
        </div>
      )}

      {/* ─── Panel 2: Channels + Members (groups) ── */}
      {showGroupPanel && selectedItem.channel && (
        <div className="flex-1 flex flex-col min-w-0">
          <GroupMemberPanel
            channel={selectedItem.channel}
            activeChannelId={activeChannelId}
            onSelectChannel={setActiveChannel}
            onCreateChannel={() =>
              onCreateChannel({ groupChannelId: selectedItem.channel!.id })
            }
          />
        </div>
      )}
    </div>
  );
}

/* ─── Conversation Panel (Panel 1) ──────────────────── */

function ConversationPanel({
  items,
  activeItemId,
  onItemClick,
  onlineUsers,
  presenceMap,
  currentUserId,
  filter,
  setFilter,
}: {
  items: ConversationItem[];
  activeItemId: string | null;
  onItemClick: (item: ConversationItem) => void;
  onlineUsers?: Set<string>;
  presenceMap: Map<string, { online: boolean; last_seen?: string }>;
  currentUserId: string;
  filter: string;
  setFilter: (v: string) => void;
}) {
  const [showCreateOverlay, setShowCreateOverlay] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when filter changes or items are refreshed
  useEffect(() => {
    setVisibleCount(10);
  }, [filter]);

  // IntersectionObserver: load 10 more when sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((n) => Math.min(n + 10, items.length));
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  if (showCreateOverlay) {
    return (
      <CreateConversationOverlay onClose={() => setShowCreateOverlay(false)} />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-base-content">Messages</h2>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => setShowCreateOverlay(true)}
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/30" />
          <input
            type="text"
            placeholder="Search..."
            className="input input-xs input-bordered w-full pl-8 h-8 text-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {items.length === 0 && (
          <p className="text-xs text-center text-base-content/40 py-8">
            No conversations yet
          </p>
        )}
        {visibleItems.map((item) => (
          <ConversationRow
            key={item.id}
            item={item}
            isActive={activeItemId === item.id}
            onClick={() => onItemClick(item)}
            onlineUsers={onlineUsers}
            presenceMap={presenceMap}
            currentUserId={currentUserId}
          />
        ))}
        {/* Sentinel: triggers loading the next batch when scrolled into view */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-2">
            <span className="loading loading-spinner loading-xs text-base-content/30" />
          </div>
        )}
        {!hasMore && items.length > 10 && (
          <div ref={sentinelRef} className="h-1" />
        )}
      </div>
    </div>
  );
}

/* ─── Helpers: format relative time and status color ── */

function formatLastSeen(lastSeen?: string): string {
  if (!lastSeen) return "";
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Returns a status color class based on last activity.
 * green: online or active <=2 min, yellow: <3 hr, red: >=3 hr */
function statusDotColor(presence?: {
  online: boolean;
  last_seen?: string;
}): string {
  if (!presence) return "bg-base-content/20"; // unknown
  if (presence.online) return "bg-success"; // green — online now
  if (!presence.last_seen) return "bg-error"; // red — no data
  const mins = (Date.now() - new Date(presence.last_seen).getTime()) / 60_000;
  if (mins <= 2) return "bg-success"; // green — within 2 min
  if (mins < 180) return "bg-warning"; // yellow — less than 3 hr
  return "bg-error"; // red — 3+ hr
}

/* ─── Conversation Row ──────────────────────────────── */

function ConversationRow({
  item,
  isActive,
  onClick,
  onlineUsers,
  presenceMap,
  currentUserId,
}: {
  item: ConversationItem;
  isActive: boolean;
  onClick: () => void;
  onlineUsers?: Set<string>;
  presenceMap: Map<string, { online: boolean; last_seen?: string }>;
  currentUserId: string;
}) {
  // For DMs, resolve the other user's presence
  const dmPresence = useMemo(() => {
    if (item.kind !== "dm") return null;
    const ch = item.channel!;
    const otherUserId = ch.dm_pair
      ?.split(":")
      .find((id) => id !== currentUserId);
    if (!otherUserId) return null;
    const p = presenceMap.get(otherUserId);
    return {
      otherUserId,
      isOnline: !!onlineUsers?.has(otherUserId),
      presence: p,
    };
  }, [item, onlineUsers, presenceMap, currentUserId]);

  const icon = useMemo(() => {
    switch (item.kind) {
      case "team":
        return (
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
            {item.name.charAt(0).toUpperCase()}
          </div>
        );
      case "group":
        return (
          <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
            <Hash className="w-4 h-4 text-info" />
          </div>
        );
      case "project":
        return (
          <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
            <FolderKanban className="w-4 h-4 text-warning" />
          </div>
        );
      case "dm": {
        const initial = item.name[0]?.toUpperCase() || "?";
        const dotColor = dmPresence?.presence
          ? statusDotColor(dmPresence.presence)
          : dmPresence?.isOnline
            ? "bg-success"
            : "bg-base-content/20";
        return (
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success font-bold text-xs">
              {initial}
            </div>
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-base-200",
                dotColor,
              )}
            />
          </div>
        );
      }
    }
  }, [item, dmPresence]);

  const kindBadge = useMemo(() => {
    switch (item.kind) {
      case "team":
        return (
          <span className="badge badge-xs bg-primary/10 text-primary border-0">
            Team
          </span>
        );
      case "group":
        return (
          <span className="badge badge-xs bg-info/10 text-info border-0">
            Group
          </span>
        );
      case "project":
        return (
          <span className="badge badge-xs bg-warning/10 text-warning border-0">
            Project
          </span>
        );
      default:
        return null;
    }
  }, [item.kind]);

  // Last seen subtitle for DMs
  const dmSubtitle = useMemo(() => {
    if (!dmPresence) return null;
    if (dmPresence.isOnline || dmPresence.presence?.online) return "Online";
    if (dmPresence.presence?.last_seen) {
      return `Last seen ${formatLastSeen(dmPresence.presence.last_seen)}`;
    }
    return null;
  }, [dmPresence]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-left mb-0.5",
        isActive
          ? "bg-primary/10 text-base-content"
          : "text-base-content/70 hover:text-base-content hover:bg-base-300",
      )}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              "text-sm truncate",
              isActive ? "font-semibold" : "font-medium",
            )}
          >
            {item.name}
          </span>
          {kindBadge}
        </div>
        {dmSubtitle && (
          <span
            className={cn(
              "text-[10px] truncate block",
              dmPresence?.isOnline ? "text-success" : "text-base-content/40",
            )}
          >
            {dmSubtitle}
          </span>
        )}
      </div>
      {item.unreadCount > 0 && !isActive && (
        <span className="badge badge-primary badge-xs min-w-[18px]">
          {item.unreadCount}
        </span>
      )}
    </button>
  );
}

/* ─── Team Channel Panel (Panel 2 for teams) ────────── */

function TeamChannelPanel({
  team,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
}: {
  team: SidebarTeam;
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
}) {
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const projectChannels = team.channels.filter((c) => c.type === "project");
  const teamChannels = team.channels.filter((c) => c.type !== "project");

  const primaryChannelId = team.channels[0]?.id;
  const qc = useQueryClient();
  const { can: canTeamChannel } = useChannelPermissions(primaryChannelId ?? "");

  const { data: members, isLoading: membersLoading } = useQuery<
    ChatChannelMember[]
  >({
    queryKey: ["channel-members", primaryChannelId],
    queryFn: async () => {
      if (!primaryChannelId) return [];
      return (await api.chat.members.list(primaryChannelId)) ?? [];
    },
    enabled: !!primaryChannelId && membersExpanded,
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!primaryChannelId) return;
      await api.chat.members.remove(primaryChannelId, userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["channel-members", primaryChannelId],
      });
      toast.success("Member removed");
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b border-base-300">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-bold text-base-content truncate flex-1">
            {team.name}
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {/* Channels */}
        <SectionHeader
          title="Channels"
          count={teamChannels.length}
          expanded={channelsExpanded}
          onToggle={() => setChannelsExpanded((p) => !p)}
          onAdd={onCreateChannel}
        />
        {channelsExpanded &&
          teamChannels.map((ch) => (
            <ChannelRow
              key={ch.id}
              name={ch.name}
              isActive={activeChannelId === ch.id}
              onClick={() => onSelectChannel(ch.id)}
              icon={<Hash className="w-3.5 h-3.5" />}
              unread={ch.unread_count ?? 0}
            />
          ))}

        {/* Project channels */}
        {projectChannels.length > 0 && (
          <>
            <SectionHeader
              title="Projects"
              count={projectChannels.length}
              expanded={projectsExpanded}
              onToggle={() => setProjectsExpanded((p) => !p)}
            />
            {projectsExpanded &&
              projectChannels.map((ch) => (
                <ChannelRow
                  key={ch.id}
                  name={ch.name}
                  isActive={activeChannelId === ch.id}
                  onClick={() => onSelectChannel(ch.id)}
                  icon={<FolderKanban className="w-3.5 h-3.5" />}
                  unread={ch.unread_count ?? 0}
                />
              ))}
          </>
        )}

        {/* Members */}
        <SectionHeader
          title="Members"
          count={members?.length}
          expanded={membersExpanded}
          onToggle={() => setMembersExpanded((p) => !p)}
          onAdd={
            canTeamChannel("member", "add")
              ? () => setShowAddMember(true)
              : undefined
          }
        />
        {membersExpanded && (
          <>
            {membersLoading ? (
              <div className="flex justify-center py-2">
                <span className="loading loading-spinner loading-xs" />
              </div>
            ) : (
              <div className="space-y-0.5">
                {members?.map((m) => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    onRemove={() => removeMember.mutate(m.user_id)}
                    channelId={primaryChannelId!}
                  />
                ))}
              </div>
            )}
            {showAddMember && primaryChannelId && (
              <AddMemberSearch
                channelId={primaryChannelId}
                existingMembers={members ?? []}
                onClose={() => setShowAddMember(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Group Panel (Panel 2 for groups) — channels + members */

function GroupMemberPanel({
  channel,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
}: {
  channel: ChatChannel;
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
}) {
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [membersExpanded, setMembersExpanded] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const qc = useQueryClient();
  const { can: canGroupChannel } = useChannelPermissions(channel.id);

  const { data: members, isLoading } = useQuery<ChatChannelMember[]>({
    queryKey: ["channel-members", channel.id],
    queryFn: async () => (await api.chat.members.list(channel.id)) ?? [],
    enabled: !!channel.id,
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      await api.chat.members.remove(channel.id, userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-members", channel.id] });
      toast.success("Member removed");
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b border-base-300">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-info" />
          <h2 className="text-sm font-bold text-base-content truncate flex-1">
            {channel.name}
          </h2>
        </div>
        {channel.description && (
          <p className="text-xs text-base-content/40 mt-1 truncate">
            {channel.description}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {/* Channels section — the group's main channel is listed here */}
        <SectionHeader
          title="Channels"
          count={1}
          expanded={channelsExpanded}
          onToggle={() => setChannelsExpanded((p) => !p)}
          onAdd={onCreateChannel}
        />
        {channelsExpanded && (
          <ChannelRow
            name={channel.name || "general"}
            isActive={activeChannelId === channel.id}
            onClick={() => onSelectChannel(channel.id)}
            icon={<Hash className="w-3.5 h-3.5" />}
            unread={channel.unread_count ?? 0}
          />
        )}

        {/* Members section */}
        <SectionHeader
          title="Members"
          count={members?.length}
          expanded={membersExpanded}
          onToggle={() => setMembersExpanded((p) => !p)}
          onAdd={
            canGroupChannel("member", "add")
              ? () => setShowAddMember(true)
              : undefined
          }
        />
        {membersExpanded && (
          <>
            {isLoading ? (
              <div className="flex justify-center py-2">
                <span className="loading loading-spinner loading-xs" />
              </div>
            ) : (
              <div className="space-y-0.5">
                {members?.map((m) => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    onRemove={() => removeMember.mutate(m.user_id)}
                    channelId={channel.id}
                  />
                ))}
              </div>
            )}
            {showAddMember && (
              <AddMemberSearch
                channelId={channel.id}
                existingMembers={members ?? []}
                onClose={() => setShowAddMember(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Member Row with actions ───────────────────────── */

function MemberRow({
  member,
  onRemove,
  channelId,
}: {
  member: ChatChannelMember;
  onRemove: () => void;
  channelId: string;
}) {
  const currentUser = useAuthStore((s) => s.user);
  const isCurrentUser = currentUser?.internal_id === member.user_id;
  const presenceMap = useChatStore((s) => s.presenceMap);
  const qc = useQueryClient();
  const { can, role: myRole } = useChannelPermissions(channelId);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const presence = presenceMap.get(member.user_id);
  const dotColor = statusDotColor(presence);

  const canUpdateRoles = can("member", "update_role");
  const canRemoveMembers = can("member", "remove");
  const canManageTarget = myRole ? canManageRole(myRole, member.role) : false;
  const assignableRoles = myRole ? getAssignableRoles(myRole) : [];

  const updateRole = useMutation({
    mutationFn: async (newRole: string) => {
      await api.chat.members.updateRole(channelId, member.user_id, newRole);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-members", channelId] });
      qc.invalidateQueries({ queryKey: ["channel-permissions", channelId] });
      setShowRoleMenu(false);
      toast.success("Role updated");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update role");
    },
  });

  const roleBadgeColor: Record<string, string> = {
    owner: "badge-primary",
    admin: "badge-secondary",
    moderator: "badge-accent",
    viewer: "badge-warning",
  };

  const roleIcon = (role: ChatMemberRole) => {
    switch (role) {
      case "owner":
        return <ShieldAlert className="w-2.5 h-2.5" />;
      case "admin":
        return <ShieldCheck className="w-2.5 h-2.5" />;
      case "moderator":
        return <Shield className="w-2.5 h-2.5" />;
      case "viewer":
        return <Eye className="w-2.5 h-2.5" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-base-300 group/member relative">
      <div className="relative flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            (member.display_name?.[0] || member.email?.[0] || "?").toUpperCase()
          )}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-base-200",
            dotColor,
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium truncate block">
          {member.display_name || member.email}
        </span>
        {!presence?.online && presence?.last_seen && (
          <span className="text-[9px] text-base-content/35 truncate block">
            {formatLastSeen(presence.last_seen)}
          </span>
        )}
      </div>
      {member.role !== "member" && (
        <span
          className={cn(
            "badge badge-xs gap-1 capitalize",
            roleBadgeColor[member.role] || "badge-ghost",
          )}
        >
          {roleIcon(member.role as ChatMemberRole)}
          {member.role}
        </span>
      )}
      {!isCurrentUser && canManageTarget && (
        <div className="opacity-0 group-hover/member:opacity-100 flex items-center gap-0.5 transition-opacity">
          {canUpdateRoles && assignableRoles.length > 0 && (
            <div className="relative">
              <button
                className="btn btn-ghost btn-xs btn-square"
                title="Change role"
                onClick={() => setShowRoleMenu(!showRoleMenu)}
              >
                <Shield className="w-3 h-3" />
              </button>
              {showRoleMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 border border-base-200/60 rounded-lg shadow-lg py-1 min-w-[120px]">
                  {assignableRoles.map((r) => (
                    <button
                      key={r}
                      className={cn(
                        "w-full text-left px-3 py-1 text-xs hover:bg-base-300 flex items-center gap-2 capitalize",
                        member.role === r && "font-bold text-primary",
                      )}
                      onClick={() => updateRole.mutate(r)}
                      disabled={updateRole.isPending || member.role === r}
                    >
                      {roleIcon(r)}
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canRemoveMembers && (
            <button
              className="btn btn-ghost btn-xs btn-square text-error"
              title="Remove member"
              onClick={onRemove}
            >
              <UserMinus className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Add Member Search ─────────────────────────────── */

function AddMemberSearch({
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
      qc.invalidateQueries({ queryKey: ["channel-members", channelId] });
      toast.success("Member added");
    },
  });

  const existingIds = new Set(existingMembers.map((m) => m.user_id));
  const filteredResults = results?.filter((u) => !existingIds.has(u.user_id));

  return (
    <div className="mt-1 border border-base-300 rounded-lg bg-base-100 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-base-300">
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
        <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}>
          <X className="w-3 h-3" />
        </button>
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

/* ─── Create Conversation Overlay (DM / Group / Team) ── */

type CreateMode = "dm" | "group" | "team";

function CreateConversationOverlay({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<CreateMode>("dm");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<OrgMemberInfo[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const addChannel = useChatStore((s) => s.addChannel);
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();

  useEffect(() => {
    inputRef.current?.focus();
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset selections when mode changes
  useEffect(() => {
    setSelectedUsers([]);
    setName("");
    setQuery("");
  }, [mode]);

  const { data: results, isLoading } = useQuery<OrgMemberInfo[]>({
    queryKey: ["chat-user-search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      return (await api.chat.users.search(debouncedQuery.trim(), 10)) ?? [];
    },
    enabled: !!debouncedQuery.trim(),
  });

  const filteredResults = results?.filter(
    (u) => !selectedUsers.some((s) => s.user_id === u.user_id),
  );

  const toggleUser = (user: OrgMemberInfo) => {
    if (mode === "dm") {
      // DM mode: single user only, auto-start
      handleCreateDM(user);
      return;
    }
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.user_id === user.user_id);
      if (exists) return prev.filter((u) => u.user_id !== user.user_id);
      return [...prev, user];
    });
    setQuery("");
    inputRef.current?.focus();
  };

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.user_id !== userId));
    inputRef.current?.focus();
  };

  const handleCreateDM = async (user: OrgMemberInfo) => {
    try {
      const channel = await api.chat.channels.getOrCreateDM(user.user_id);
      setActiveChannel(channel.id);
      qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
      onClose();
    } catch {
      toast.error("Failed to create conversation");
    }
  };

  const handleCreateGroup = async () => {
    if (selectedUsers.length < 1) return;
    setCreating(true);
    try {
      const groupName =
        name.trim() ||
        selectedUsers.map((u) => u.display_name || u.email).join(", ");
      const channel = await api.chat.channels.create({
        name: groupName,
        type: "group",
      });
      for (const u of selectedUsers) {
        try {
          await api.chat.members.add(channel.id, u.user_id);
        } catch {
          // user may already be a member
        }
      }
      addChannel(channel);
      setActiveChannel(channel.id);
      qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
      onClose();
    } catch {
      toast.error("Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!name.trim() || !currentOrg) return;
    setCreating(true);
    try {
      // 1. Create team in main backend
      const team = await api.teams.create(currentOrg.id, {
        name: name.trim(),
      });

      // 2. Create default channels within the team
      const defaultChannels = ["general", "random"];
      let firstChannel: ChatChannel | null = null;
      for (const chName of defaultChannels) {
        try {
          const ch = await api.chat.channels.create({
            name: chName,
            type: "team",
            team_id: team.id,
          });
          if (!firstChannel) firstChannel = ch;
          // Add selected members to each channel
          for (const u of selectedUsers) {
            try {
              await api.chat.members.add(ch.id, u.user_id);
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore individual channel creation failures
        }
      }

      if (firstChannel) {
        addChannel(firstChannel);
        setActiveChannel(firstChannel.id);
      }
      qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
      onClose();
    } catch {
      toast.error("Failed to create team");
    } finally {
      setCreating(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "group") handleCreateGroup();
    else if (mode === "team") handleCreateTeam();
  };

  const canSubmit =
    mode === "dm"
      ? false // DMs are created on user click
      : mode === "group"
        ? selectedUsers.length >= 1
        : name.trim().length > 0; // Team just needs a name

  const submitLabel =
    mode === "group"
      ? `Create Group${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ""}`
      : "Create Team";

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-base-300">
        <span className="text-sm font-semibold">New Conversation</span>
        <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode selector */}
      <div className="flex gap-1 px-3 py-2 border-b border-base-300">
        {(
          [
            { value: "dm" as const, label: "DM" },
            { value: "group" as const, label: "Group" },
            { value: "team" as const, label: "Team" },
          ] as const
        ).map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "btn btn-xs flex-1",
              mode === m.value
                ? "btn-primary"
                : "btn-ghost border border-base-200",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Name input for Group / Team */}
      {(mode === "group" || mode === "team") && (
        <div className="px-3 py-2 border-b border-base-300">
          <input
            type="text"
            placeholder={
              mode === "team" ? "Team name *" : "Group name (optional)"
            }
            className="w-full bg-transparent text-sm outline-none text-base-content placeholder:text-base-content/40 border-b border-base-300 pb-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}

      {/* User search & selection */}
      <div className="px-3 py-2 border-b border-base-300">
        <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
          <span className="text-xs font-medium text-base-content/50">
            {mode === "dm" ? "To:" : "Members:"}
          </span>
          {selectedUsers.map((u) => (
            <span
              key={u.user_id}
              className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full"
            >
              {u.display_name || u.email}
              <button
                onClick={() => removeUser(u.user_id)}
                className="hover:text-error transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            placeholder="Search people..."
            className="flex-1 min-w-[100px] bg-transparent text-sm outline-none text-base-content placeholder:text-base-content/30"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !query && selectedUsers.length > 0) {
                removeUser(selectedUsers[selectedUsers.length - 1].user_id);
              }
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
      </div>

      {/* Search results */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-sm" />
          </div>
        )}
        {!isLoading &&
          debouncedQuery &&
          (!filteredResults || filteredResults.length === 0) && (
            <p className="text-xs text-center text-base-content/40 py-4">
              No users found
            </p>
          )}
        {!debouncedQuery && selectedUsers.length === 0 && (
          <p className="text-xs text-center text-base-content/40 py-4">
            {mode === "dm"
              ? "Type a name or email to search"
              : mode === "team"
                ? "Add members (optional)"
                : "Search people to add to the group"}
          </p>
        )}
        {filteredResults?.map((u) => (
          <button
            key={u.user_id}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-base-300 transition-colors text-left"
            onClick={() => toggleUser(u)}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
              {u.avatar_url ? (
                <img
                  src={u.avatar_url}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                (u.display_name?.[0] || u.email?.[0] || "?").toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {u.display_name || u.email}
              </div>
              {u.display_name && (
                <div className="text-xs text-base-content/40 truncate">
                  {u.email}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Action button (not for DM mode — DMs create on user click) */}
      {mode !== "dm" && (
        <div className="px-3 py-2 border-t border-base-300">
          <button
            className="btn btn-primary btn-sm w-full"
            disabled={!canSubmit || creating}
            onClick={handleSubmit}
          >
            {creating ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              submitLabel
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Shared Components ─────────────────────────────── */

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
  onAdd,
}: {
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between group">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-1 py-1 text-[11px] font-semibold text-base-content/40 uppercase tracking-wider hover:text-base-content/60 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {title}
        {count !== undefined && (
          <span className="text-[10px] font-normal ml-0.5">({count})</span>
        )}
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs btn-square transition-opacity"
          title={`Add ${title.toLowerCase()}`}
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function ChannelRow({
  name,
  isActive,
  onClick,
  icon,
  unread,
}: {
  name: string;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  unread: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-all text-left",
        isActive
          ? "bg-primary/10 text-base-content font-medium"
          : "text-base-content/60 hover:text-base-content hover:bg-base-300",
      )}
    >
      <span
        className={cn(
          "flex-shrink-0",
          isActive ? "text-primary" : "text-base-content/40",
        )}
      >
        {icon}
      </span>
      <span className="truncate text-sm">{name}</span>
      {unread > 0 && !isActive && (
        <span className="ml-auto badge badge-primary badge-xs min-w-[18px]">
          {unread}
        </span>
      )}
    </button>
  );
}
