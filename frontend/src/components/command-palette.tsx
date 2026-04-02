"use client";

import { api, type ListResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { Project, Task } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Search,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NAV_ITEMS = (orgSlug: string) => [
  {
    label: "Dashboard",
    href: `/${orgSlug}`,
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    label: "My Tasks",
    href: `/${orgSlug}/my-tasks`,
    icon: <ListTodo className="w-4 h-4" />,
  },
  {
    label: "Projects",
    href: `/${orgSlug}/projects`,
    icon: <FolderKanban className="w-4 h-4" />,
  },
  {
    label: "Calendar",
    href: `/${orgSlug}/calendar`,
    icon: <CalendarDays className="w-4 h-4" />,
  },
  {
    label: "Teams",
    href: `/${orgSlug}/teams`,
    icon: <Users className="w-4 h-4" />,
  },
  {
    label: "Messages",
    href: `/${orgSlug}/messages`,
    icon: <MessageSquare className="w-4 h-4" />,
  },
  {
    label: "Activity",
    href: `/${orgSlug}/activity`,
    icon: <Activity className="w-4 h-4" />,
  },
  {
    label: "Performance",
    href: `/${orgSlug}/performance`,
    icon: <BarChart3 className="w-4 h-4" />,
  },
  {
    label: "Templates",
    href: `/${orgSlug}/templates`,
    icon: <FileText className="w-4 h-4" />,
  },
  {
    label: "Notifications",
    href: `/${orgSlug}/notifications`,
    icon: <Bell className="w-4 h-4" />,
  },
  {
    label: "Search",
    href: `/${orgSlug}/search`,
    icon: <Search className="w-4 h-4" />,
  },
];

interface ResultItem {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ReactNode;
  group: string;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const orgSlug = currentOrg?.slug ?? "";
  const orgId = currentOrg?.id ?? "";

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced query for API calls (only when query length >= 2)
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    if (query.length < 2) {
      setDebouncedQuery("");
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: taskRes } = useQuery<ListResponse<Task>>({
    queryKey: ["cmd-palette-tasks", orgId, debouncedQuery],
    queryFn: () => api.search.tasks(orgId, debouncedQuery, 8),
    enabled: !!orgId && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  const { data: projectRes } = useQuery<ListResponse<Project>>({
    queryKey: ["cmd-palette-projects", orgId, debouncedQuery],
    queryFn: () => api.search.projects(orgId, debouncedQuery, 5),
    enabled: !!orgId && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  const taskResults = taskRes?.data;
  const projectResults = projectRes?.data;

  const navItems = useMemo(() => NAV_ITEMS(orgSlug), [orgSlug]);

  const results = useMemo<ResultItem[]>(() => {
    if (!query.trim()) {
      // Show all nav items when no query
      return navItems.map((n) => ({
        id: n.href,
        label: n.label,
        href: n.href,
        icon: n.icon,
        group: "Navigation",
      }));
    }

    const q = query.toLowerCase();
    const items: ResultItem[] = [];

    // Matching nav items
    navItems
      .filter((n) => n.label.toLowerCase().includes(q))
      .forEach((n) =>
        items.push({
          id: n.href,
          label: n.label,
          href: n.href,
          icon: n.icon,
          group: "Navigation",
        }),
      );

    // Project results
    (projectResults ?? []).forEach((p) =>
      items.push({
        id: `project-${p.id}`,
        label: p.name,
        sublabel: p.status,
        href: `/${orgSlug}/projects/${p.id}`,
        icon: <FolderKanban className="w-4 h-4" />,
        group: "Projects",
      }),
    );

    // Task results
    (taskResults ?? []).forEach((t) =>
      items.push({
        id: `task-${t.id}`,
        label: t.title,
        sublabel: t.status.replace("_", " "),
        href: `/${orgSlug}/projects/${t.project_id}?task=${t.id}`,
        icon: <ListTodo className="w-4 h-4" />,
        group: "Tasks",
      }),
    );

    return items;
  }, [query, navItems, projectResults, taskResults, orgSlug]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [results]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
    },
    [router, setOpen],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = results[activeIdx];
      if (item) navigate(item.href);
    }
  };

  if (!open) return null;

  // Group results for display
  const grouped = results.reduce<Record<string, ResultItem[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  let flatIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[200] backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 top-20 z-[201] flex justify-center px-4">
        <div className="w-full max-w-xl bg-base-100 rounded-xl shadow-2xl border border-base-200 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-base-200">
            <Search className="w-5 h-5 text-base-content/40 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
              placeholder="Search pages, projects, tasks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <kbd className="kbd kbd-sm">Esc</kbd>
              <button
                className="btn btn-ghost btn-xs btn-square"
                onClick={() => setOpen(false)}
                aria-label="Close command palette"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Results */}
          <ul
            ref={listRef}
            className="max-h-80 overflow-y-auto py-2"
            role="listbox"
          >
            {results.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-base-content/40">
                No results found
              </li>
            )}
            {Object.entries(grouped).map(([group, items]) => (
              <li key={group}>
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40">
                    {group}
                  </span>
                </div>
                <ul>
                  {items.map((item) => {
                    const idx = flatIdx++;
                    return (
                      <li
                        key={item.id}
                        role="option"
                        aria-selected={idx === activeIdx}
                      >
                        <button
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                            idx === activeIdx
                              ? "bg-primary text-primary-content"
                              : "hover:bg-base-200"
                          }`}
                          onClick={() => navigate(item.href)}
                          onMouseEnter={() => setActiveIdx(idx)}
                        >
                          <span className="flex-shrink-0 opacity-70">
                            {item.icon}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block truncate font-medium">
                              {item.label}
                            </span>
                            {item.sublabel && (
                              <span className="block truncate text-xs opacity-60 capitalize">
                                {item.sublabel}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {/* Footer hint */}
          <div className="border-t border-base-200 px-4 py-2 flex items-center gap-3 text-xs text-base-content/40">
            <span>
              <kbd className="kbd kbd-xs">↑</kbd>
              <kbd className="kbd kbd-xs ml-0.5">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="kbd kbd-xs">↵</kbd> Open
            </span>
            <span>
              <kbd className="kbd kbd-xs">Esc</kbd> Close
            </span>
            <span className="ml-auto">
              <kbd className="kbd kbd-xs">⌘</kbd>
              <kbd className="kbd kbd-xs ml-0.5">K</kbd> Toggle
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
