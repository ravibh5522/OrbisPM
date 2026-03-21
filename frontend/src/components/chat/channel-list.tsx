"use client";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import type {
  ChatChannel,
  ChatChannelMember,
  OrgMemberInfo,
  SidebarData,
  SidebarTeam,
} from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Hash,
  Plus,
  Search,
  Shield,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  onCreateChannel: () => void;
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
  const { data: onlineUsers } = useQuery<Set<string>>({
    queryKey: ["chat-presence"],
    queryFn: async () => {
      const res = await api.chat.presence.get();
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

  // Show channel panel for teams
  const showTeamPanel = selectedItem?.kind === "team" && selectedItem.team;
  const showGroupPanel = selectedItem?.kind === "group" && selectedItem.channel;

  if (isLoading) {
    return (
      <div className="flex h-full bg-base-200 px-3 py-3">
        <div className="w-full">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-12 w-full rounded-lg mb-2" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ─── Panel 1: Unified Conversation List ──── */}
      <div
        className={cn(
          "bg-base-200 flex flex-col min-w-0",
          showTeamPanel || showGroupPanel
            ? "w-[200px] flex-shrink-0 border-r border-base-300/30"
            : "flex-1",
        )}
      >
        <ConversationPanel
          items={filteredConversations}
          activeItemId={activeItemId}
          onItemClick={handleItemClick}
          onlineUsers={onlineUsers}
          currentUserId={user?.internal_id ?? ""}
          filter={filter}
          setFilter={setFilter}
        />
      </div>

      {/* ─── Panel 2: Channels + Members (teams) ─── */}
      {showTeamPanel && selectedItem.team && (
        <div className="flex-1 bg-base-200/50 flex flex-col min-w-0">
          <TeamChannelPanel
            team={selectedItem.team}
            activeChannelId={activeChannelId}
            onSelectChannel={setActiveChannel}
            onCreateChannel={onCreateChannel}
          />
        </div>
      )}

      {/* ─── Panel 2: Members (groups) ───────────── */}
      {showGroupPanel && selectedItem.channel && (
        <div className="flex-1 bg-base-200/50 flex flex-col min-w-0">
          <GroupMemberPanel channel={selectedItem.channel} />
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
  currentUserId,
  filter,
  setFilter,
}: {
  items: ConversationItem[];
  activeItemId: string | null;
  onItemClick: (item: ConversationItem) => void;
  onlineUsers?: Set<string>;
  currentUserId: string;
  filter: string;
  setFilter: (v: string) => void;
}) {
  const [showUserSearch, setShowUserSearch] = useState(false);

  if (showUserSearch) {
    return <UserSearchOverlay onClose={() => setShowUserSearch(false)} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-base-content">Messages</h2>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => setShowUserSearch(true)}
            title="New direct message"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/30" />
          <input
            type="text"
            placeholder="Search..."
            className="input input-xs input-bordered w-full pl-8 bg-base-300/50 h-8 text-xs"
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
        {items.map((item) => (
          <ConversationRow
            key={item.id}
            item={item}
            isActive={activeItemId === item.id}
            onClick={() => onItemClick(item)}
            onlineUsers={onlineUsers}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Conversation Row ──────────────────────────────── */

function ConversationRow({
  item,
  isActive,
  onClick,
  onlineUsers,
  currentUserId,
}: {
  item: ConversationItem;
  isActive: boolean;
  onClick: () => void;
  onlineUsers?: Set<string>;
  currentUserId: string;
}) {
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
        const ch = item.channel!;
        const otherUserId = ch.dm_pair
          ?.split(":")
          .find((id) => id !== currentUserId);
        const isOnline = !!otherUserId && !!onlineUsers?.has(otherUserId);
        const initial = item.name[0]?.toUpperCase() || "?";
        return (
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success font-bold text-xs">
              {initial}
            </div>
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-base-200" />
            )}
          </div>
        );
      }
    }
  }, [item, onlineUsers, currentUserId]);

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

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-left mb-0.5",
        isActive
          ? "bg-primary/10 text-base-content"
          : "text-base-content/70 hover:text-base-content hover:bg-base-300/40",
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
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b border-base-300/30">
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
          onAdd={() => setShowAddMember(true)}
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

/* ─── Group Member Panel (Panel 2 for groups) ────────── */

function GroupMemberPanel({ channel }: { channel: ChatChannel }) {
  const [membersExpanded, setMembersExpanded] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const qc = useQueryClient();

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
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b border-base-300/30">
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

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <SectionHeader
          title="Members"
          count={members?.length}
          expanded={membersExpanded}
          onToggle={() => setMembersExpanded((p) => !p)}
          onAdd={() => setShowAddMember(true)}
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
  const qc = useQueryClient();

  const updateRole = useMutation({
    mutationFn: async (newRole: string) => {
      await api.chat.members.updateRole(channelId, member.user_id, newRole);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-members", channelId] });
    },
  });

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-base-300/30 group/member">
      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] flex-shrink-0">
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
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium truncate block">
          {member.display_name || member.email}
        </span>
      </div>
      {member.role !== "member" && (
        <span className="badge badge-xs badge-ghost capitalize">
          {member.role}
        </span>
      )}
      {!isCurrentUser && (
        <div className="opacity-0 group-hover/member:opacity-100 flex items-center gap-0.5 transition-opacity">
          {member.role === "member" && (
            <button
              className="btn btn-ghost btn-xs btn-square"
              title="Make admin"
              onClick={() => updateRole.mutate("admin")}
            >
              <Shield className="w-3 h-3" />
            </button>
          )}
          <button
            className="btn btn-ghost btn-xs btn-square text-error"
            title="Remove member"
            onClick={onRemove}
          >
            <UserMinus className="w-3 h-3" />
          </button>
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
    },
  });

  const existingIds = new Set(existingMembers.map((m) => m.user_id));
  const filteredResults = results?.filter((u) => !existingIds.has(u.user_id));

  return (
    <div className="mt-1 border border-base-300 rounded-lg bg-base-100 overflow-hidden">
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

/* ─── User Search Overlay (for starting DMs) ────────── */

function UserSearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
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

  const handleSelect = async (userId: string) => {
    try {
      const channel = await api.chat.channels.getOrCreateDM(userId);
      setActiveChannel(channel.id);
      qc.invalidateQueries({ queryKey: ["chat-sidebar"] });
      onClose();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full bg-base-100">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-base-300">
        <Search className="w-4 h-4 text-base-content/40" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Find or start a conversation..."
          className="flex-1 bg-transparent text-sm outline-none text-base-content placeholder:text-base-content/30"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-sm" />
          </div>
        )}
        {!isLoading && debouncedQuery && (!results || results.length === 0) && (
          <p className="text-xs text-center text-base-content/40 py-4">
            No users found
          </p>
        )}
        {!debouncedQuery && (
          <p className="text-xs text-center text-base-content/40 py-4">
            Type a name or email to search
          </p>
        )}
        {results?.map((u) => (
          <button
            key={u.user_id}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-base-300/60 transition-colors text-left"
            onClick={() => handleSelect(u.user_id)}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
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
            <div className="min-w-0">
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
          : "text-base-content/60 hover:text-base-content hover:bg-base-300/40",
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
