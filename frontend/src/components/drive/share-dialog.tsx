"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/shared";
import {
  useDriveShares,
  useRevokeDriveShare,
  useShareDriveItem,
  useUpdateDriveShare,
} from "@/hooks/use-drive";
import { useOrgPolicies } from "@/hooks/use-policies";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { DriveItem, DriveRole, DriveShare } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  FolderKanban,
  Link2,
  Search,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type GranteeType = DriveShare["grantee_type"];

interface Grantee {
  type: GranteeType;
  id: string;
  name: string;
  avatarUrl?: string;
  hint?: string;
}

const GROUP_LABEL: Record<GranteeType, string> = {
  user: "People",
  team: "Teams",
  project: "Projects",
  org: "Everyone in org",
};

const ROLE_LABEL: Record<DriveRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  manager: "Manager",
};

function GranteeIcon({ g }: { g: Pick<Grantee, "type" | "name" | "avatarUrl"> }) {
  if (g.type === "user") return <Avatar name={g.name} src={g.avatarUrl} size="sm" />;
  const Icon =
    g.type === "team" ? Users : g.type === "project" ? FolderKanban : Building2;
  return (
    <div className="w-8 h-8 rounded-full bg-base-200 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-base-content/60" />
    </div>
  );
}

interface ShareDialogProps {
  item: DriveItem;
  meId?: string;
  onClose: () => void;
}

/** Mount only while open. */
export function ShareDialog({ item, meId, onClose }: ShareDialogProps) {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const orgId = currentOrg?.id || "";
  const policies = useOrgPolicies();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // Opened by the user (click, typing, ArrowDown), not by the autofocus.
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Grantee[]>([]);
  const [role, setRole] = useState<DriveRole>("viewer");

  const shares = useDriveShares(item.id);
  const share = useShareDriveItem();
  const updateShare = useUpdateDriveShare();
  const revoke = useRevokeDriveShare();
  const isManager = item.my_role === "manager";
  const roleOptions: DriveRole[] = isManager
    ? ["viewer", "editor", "manager"]
    : ["viewer", "editor"];

  // Same keys and params as DataPrefetcher, so these are usually cached.
  const { data: members } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => api.members.list(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
  const { data: teams } = useQuery({
    queryKey: ["teams", orgId],
    queryFn: () => api.teams.list(orgId, policies.teamListParams()),
    enabled: !!orgId && !policies.isLoading,
  });
  const { data: projects } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api.projects.list(orgId, policies.projectListParams()),
    enabled: !!orgId && !policies.isLoading,
  });

  const options = useMemo(() => {
    const all: Grantee[] = [
      ...(members?.data ?? [])
        .filter((m) => m.user_id !== meId)
        .map((m) => ({
          type: "user" as const,
          id: m.user_id,
          name: m.display_name || m.email,
          avatarUrl: m.avatar_url,
          hint: m.display_name ? m.email : undefined,
        })),
      ...(teams?.data ?? []).map((t) => ({
        type: "team" as const,
        id: t.id,
        name: t.name,
      })),
      ...(projects?.data ?? []).map((p) => ({
        type: "project" as const,
        id: p.id,
        name: p.name,
      })),
      {
        type: "org" as const,
        id: orgId,
        name: currentOrg?.name || "Organization",
        hint: "Everyone in the organization",
      },
    ];
    const q = query.trim().toLowerCase();
    const taken = new Set([
      ...selected.map((g) => `${g.type}:${g.id}`),
      ...(shares.data ?? [])
        .filter((s) => !s.inherited)
        .map((s) => `${s.grantee_type}:${s.grantee_id}`),
    ]);
    return all
      .filter((g) => !taken.has(`${g.type}:${g.id}`))
      .filter(
        (g) =>
          !q ||
          g.name.toLowerCase().includes(q) ||
          g.hint?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [members, teams, projects, orgId, currentOrg?.name, meId, query, selected, shares.data]);

  const pick = (g: Grantee) => {
    setSelected((s) => [...s, g]);
    setQuery("");
    setActive(0);
  };

  const submit = () =>
    share.mutate(
      {
        id: item.id,
        grantees: selected.map((g) => ({ type: g.type, id: g.id })),
        role,
      },
      {
        onSuccess: () => {
          toast.success(
            `Shared with ${selected.length} ${selected.length === 1 ? "recipient" : "recipients"}`,
          );
          setSelected([]);
        },
      },
    );

  const copyLink = async () => {
    const link = `${window.location.origin}/${currentOrg?.slug}/drive?item=${item.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const canEditShare = (s: DriveShare) =>
    !s.inherited && (isManager || s.created_by === meId);

  const showDropdown = focused && listOpen && options.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Share "${item.name}"`}
      className="max-w-lg"
      actions={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={copyLink}>
            <Link2 className="w-4 h-4" /> Copy link
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      {/* Grantee picker */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-2">
        <div className="relative flex-1 min-w-0">
          <div
            className={cn(
              "input input-bordered w-full h-auto min-h-10 flex flex-wrap items-center gap-1 py-1.5",
              focused && "outline outline-2 outline-offset-2 outline-primary/40",
            )}
          >
            <Search className="w-4 h-4 text-base-content/40 shrink-0" />
            {selected.map((g) => (
              <span
                key={`${g.type}:${g.id}`}
                className="badge badge-sm gap-1 bg-base-200 border-base-300"
              >
                {g.name}
                <button
                  type="button"
                  aria-label={`Remove ${g.name}`}
                  onClick={() =>
                    setSelected((s) => s.filter((x) => x !== g))
                  }
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              autoFocus
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="drive-share-options"
              aria-label="Add people, teams or projects"
              className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm"
              placeholder={selected.length ? "" : "Add people, teams, projects..."}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
                setListOpen(true);
              }}
              onClick={() => setListOpen(true)}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setListOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (!listOpen) setListOpen(true);
                  else setActive((a) => Math.min(a + 1, options.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && options[active]) {
                  e.preventDefault();
                  pick(options[active]);
                } else if (e.key === "Backspace" && !query && selected.length) {
                  setSelected((s) => s.slice(0, -1));
                } else if (e.key === "Escape" && listOpen) {
                  e.preventDefault();
                  setListOpen(false);
                }
              }}
            />
          </div>

          {showDropdown && (
            <ul
              id="drive-share-options"
              role="listbox"
              className="absolute z-20 inset-x-0 top-full mt-1 max-h-64 overflow-y-auto bg-base-100 border border-base-200 rounded-box shadow-lg py-1"
              // Keep input focus while clicking an option.
              onMouseDown={(e) => e.preventDefault()}
            >
              {(["user", "team", "project", "org"] as GranteeType[]).map((type) => {
                const group = options.filter((o) => o.type === type);
                if (group.length === 0) return null;
                return (
                  <li key={type} role="presentation">
                    <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-widest text-base-content/40">
                      {GROUP_LABEL[type]}
                    </div>
                    <ul role="presentation">
                      {group.map((g) => {
                        const idx = options.indexOf(g);
                        const isActive = idx === active;
                        return (
                          <li
                            key={`${g.type}:${g.id}`}
                            role="option"
                            aria-selected={isActive}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors",
                              isActive ? "bg-base-200" : "hover:bg-base-200",
                            )}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => pick(g)}
                          >
                            <GranteeIcon g={g} />
                            <div className="min-w-0">
                              <p className="truncate">{g.name}</p>
                              {g.hint && (
                                <p className="text-xs text-base-content/50 truncate">
                                  {g.hint}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <select
            aria-label="Role"
            className="select select-bordered w-28 shrink-0"
            value={role}
            onChange={(e) => setRole(e.target.value as DriveRole)}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <Button
            onClick={submit}
            disabled={selected.length === 0}
            loading={share.isPending}
          >
            Share
          </Button>
        </div>
      </div>

      {/* Current access */}
      <h4 className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-widest text-base-content/40">
        Who has access
      </h4>
      {shares.isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : (shares.data ?? []).length === 0 ? (
        <p className="text-sm text-base-content/50">
          Not shared with anyone yet.
        </p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {(shares.data ?? []).map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-base-200"
            >
              <GranteeIcon
                g={{
                  type: s.grantee_type,
                  name: s.grantee_name,
                  avatarUrl: s.grantee_avatar_url ?? undefined,
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{s.grantee_name}</p>
                {s.inherited && (
                  <p className="text-xs text-base-content/50 truncate">
                    via {s.source_item_name}
                  </p>
                )}
              </div>
              {canEditShare(s) ? (
                <>
                  <select
                    aria-label={`Role for ${s.grantee_name}`}
                    className="select select-bordered select-sm w-28 shrink-0"
                    value={s.role}
                    disabled={updateShare.isPending}
                    onChange={(e) =>
                      updateShare.mutate(
                        { shareId: s.id, role: e.target.value as DriveRole },
                        { onSuccess: () => toast.success("Access updated") },
                      )
                    }
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square text-error"
                    aria-label={`Remove access for ${s.grantee_name}`}
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(s.id, {
                        onSuccess: () => toast.success("Access removed"),
                      })
                    }
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <span className="badge badge-ghost badge-sm">
                  {ROLE_LABEL[s.role]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
