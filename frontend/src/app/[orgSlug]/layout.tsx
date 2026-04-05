"use client";

import { Button } from "@/components/ui/button";
import { Avatar, ConnectionBadge } from "@/components/ui/shared";
import { useRequireAuth } from "@/hooks/use-auth-guard";
import { useOrgSocket } from "@/hooks/use-org-socket";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectTaskStore } from "@/stores/project-task-store";
import { THEMES, useUIStore } from "@/stores/ui-store";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Palette,
  Search,
  Sun,
  UserCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { CommandPalette } from "@/components/command-palette";
import { DataPrefetcher } from "@/components/data-prefetcher";
import { NotificationBell } from "@/components/notification-bell";
import { StickyNotesPanel } from "@/components/sticky-notes/sticky-notes-panel";
import { useOrgPolicies } from "@/hooks/use-policies";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Optional permission check: [resource, action] — item shown only if can(resource, action) */
  permission?: [string, string];
}

function getSidebarItems(orgSlug: string): NavItem[] {
  return [
    {
      href: `/${orgSlug}`,
      label: "Dashboard",
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/my-tasks`,
      label: "My Tasks",
      icon: <ListTodo className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/calendar`,
      label: "Calendar",
      icon: <CalendarDays className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/messages`,
      label: "Messages",
      icon: <MessageSquare className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/projects`,
      label: "Projects",
      icon: <FolderKanban className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/teams`,
      label: "Teams",
      icon: <Users className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/templates`,
      label: "Templates",
      icon: <FileText className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/activity`,
      label: "Activity",
      icon: <Activity className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/performance`,
      label: "Performance",
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/notifications`,
      label: "Notifications",
      icon: <Bell className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/search`,
      label: "Search",
      icon: <Search className="w-5 h-5" />,
    },
  ];
}

function getSettingsItems(orgSlug: string): NavItem[] {
  return [
    {
      href: `/${orgSlug}/settings`,
      label: "Organisation",
      icon: <Building2 className="w-5 h-5" />,
      permission: ["org", "update"],
    },
  ];
}

function Sidebar() {
  const pathname = usePathname();
  const { currentOrg, currentMembership, orgs, setCurrentOrg, user, logout } =
    useAuthStore();
  const {
    sidebarCollapsed,
    toggleSidebar,
    theme,
    setTheme,
    themeLocked,
    colorSchemaLocked,
  } = useUIStore();
  const router = useRouter();

  if (!currentOrg) return null;

  const mainItems = getSidebarItems(currentOrg.slug);
  const settingsItems = getSettingsItems(currentOrg.slug);
  const orgPolicies = useOrgPolicies();

  const handleThemeSwitch = (value: string) => {
    if (themeLocked) return; // fully locked by admin
    setTheme(value as Parameters<typeof setTheme>[0]);
    // Only save theme to DB — don't clear customisation if org color schema is enforced
    const updateData: Record<string, unknown> = { theme: value };
    if (!colorSchemaLocked) {
      updateData.theme_customisation = null;
    }
    api.auth.updateUser({ data: updateData }).catch(() => {
      /* non-critical */
    });
  };

  const filteredSettings = settingsItems.filter(
    (item) =>
      !item.permission ||
      orgPolicies.can(item.permission[0], item.permission[1]),
  );

  const isActive = (href: string) => {
    if (href === `/${currentOrg.slug}`) return pathname === href;
    return pathname.startsWith(href);
  };

  const handleOrgSwitch = async (orgSlug: string) => {
    const org = orgs.find((o) => o.slug === orgSlug);
    if (org) {
      await setCurrentOrg(org);
      router.push(`/${org.slug}`);
    }
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full bg-base-100 border-r border-base-200 z-40 transition-all duration-300 ease-in-out glass-sidebar",
        "hidden lg:flex", // Hide on mobile
        sidebarCollapsed ? "w-[92px]" : "w-64",
      )}
    >
      <div className="flex flex-col h-full w-full">
        {/* Org header */}
        <div
          className={cn(
            "flex items-center border-b border-base-200 transition-all duration-300 ease-in-out",
            sidebarCollapsed
              ? "flex-col justify-center p-3 gap-2"
              : "justify-between p-4",
          )}
        >
          {/* Collapsed: show org logo centered */}
          {sidebarCollapsed && (
            <div className="flex items-center justify-center">
              {currentOrg.logo_url ? (
                <img
                  src={currentOrg.logo_url}
                  alt={currentOrg.name}
                  className="w-10 h-10 rounded-lg object-cover"
                />
              ) : (
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-primary-content font-bold text-base">
                  {(currentOrg.name?.[0] || "?").toUpperCase()}
                </div>
              )}
            </div>
          )}
          {/* Open: show full org picker dropdown */}
          {!sidebarCollapsed && (
            <div className="dropdown dropdown-bottom flex-1 mr-1">
              <label
                tabIndex={0}
                className="flex items-center gap-2 cursor-pointer hover:bg-base-200 rounded-lg p-1 w-full"
              >
                {currentOrg.logo_url ? (
                  <img
                    src={currentOrg.logo_url}
                    alt={currentOrg.name}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-content font-bold text-sm flex-shrink-0">
                    {(currentOrg.name?.[0] || "?").toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {currentOrg.name}
                  </div>
                  <div className="text-xs text-base-content/50">
                    {orgPolicies.role || "member"}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-base-content/50" />
              </label>
              <ul
                tabIndex={0}
                className="dropdown-content org-switcher-dropdown z-50 menu p-2 shadow-lg bg-base-100 rounded-box w-56 border border-base-200"
              >
                {orgs.map((org) => (
                  <li key={org.id}>
                    <button
                      className={cn(org.id === currentOrg.id && "active")}
                      onClick={() => handleOrgSwitch(org.slug)}
                    >
                      {org.logo_url ? (
                        <img
                          src={org.logo_url}
                          alt={org.name}
                          className="w-6 h-6 rounded object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-primary-content font-bold text-xs">
                          {(org.name?.[0] || "?").toUpperCase()}
                        </div>
                      )}
                      {org.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Toggle button */}
          <Button
            variant="ghost"
            size="sm"
            className="btn-square flex-shrink-0"
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3">
          <ul
            className={cn(
              "flex flex-col gap-1",
              sidebarCollapsed ? "items-center px-0" : "px-2",
            )}
          >
            {mainItems.map((item) => (
              <li key={item.href} className="list-none">
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex flex-row items-center rounded-xl transition-all duration-300 ease-in-out",
                    isActive(item.href)
                      ? "bg-primary text-primary-content shadow-sm hover:bg-primary/90 hover:text-primary-content"
                      : "text-base-content hover:bg-base-200 hover:text-base-content",
                    sidebarCollapsed
                      ? "justify-center mx-auto w-14 pt-2 pb-4"
                      : "gap-2 px-3 py-2.5",
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {/* Icon */}
                  <span className="flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </span>
                  {/* Full label — clips horizontally when collapsing (right → gone) */}
                  <span
                    className={cn(
                      "text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out",
                      sidebarCollapsed
                        ? "w-0 max-w-0 opacity-0"
                        : "opacity-100 max-w-full",
                    )}
                  >
                    {item.label}
                  </span>
                  {/* Short label — absolute below icon, fades in when collapsed */}
                  <span
                    className={cn(
                      "absolute left-0 right-0 text-center text-[10px] font-medium leading-tight transition-all duration-300 ease-in-out px-0.5 truncate",
                      sidebarCollapsed
                        ? "bottom-0.5 opacity-100 translate-y-0"
                        : "bottom-0 opacity-0 translate-y-1 pointer-events-none",
                    )}
                  >
                    {item.label.length > 7
                      ? item.label.slice(0, 7) + "…"
                      : item.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {filteredSettings.length > 0 && (
            <>
              {/* Settings section label */}
              <div
                className={cn(
                  "px-4 mt-3 mb-1 overflow-hidden transition-all duration-300 ease-in-out",
                  sidebarCollapsed
                    ? "max-h-0 opacity-0 py-0"
                    : "max-h-8 opacity-100 py-1",
                )}
              >
                <span className="text-xs font-semibold text-base-content/40 uppercase tracking-wider">
                  Organisation
                </span>
              </div>
              <ul
                className={cn(
                  "flex flex-col gap-1",
                  sidebarCollapsed ? "items-center px-0" : "px-2",
                )}
              >
                {filteredSettings.map((item) => (
                  <li key={item.href} className="list-none">
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex flex-row items-center rounded-xl transition-all duration-300 ease-in-out",
                        isActive(item.href)
                          ? "bg-primary text-primary-content shadow-sm hover:bg-primary/90 hover:text-primary-content"
                          : "text-base-content hover:bg-base-200 hover:text-base-content",
                        sidebarCollapsed
                          ? "justify-center mx-auto w-14 pt-2 pb-4"
                          : "gap-2 px-3 py-2.5",
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      {/* Icon */}
                      <span className="flex items-center justify-center flex-shrink-0">
                        {item.icon}
                      </span>
                      {/* Full label — clips when collapsing */}
                      <span
                        className={cn(
                          "text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out",
                          sidebarCollapsed
                            ? "w-0 max-w-0 opacity-0"
                            : "opacity-100 max-w-full",
                        )}
                      >
                        {item.label}
                      </span>
                      {/* Short label — absolute below icon, fades in when collapsed */}
                      <span
                        className={cn(
                          "absolute left-0 right-0 text-center text-[10px] font-medium leading-tight transition-all duration-300 ease-in-out px-0.5 truncate",
                          sidebarCollapsed
                            ? "bottom-0.5 opacity-100 translate-y-0"
                            : "bottom-0 opacity-0 translate-y-1 pointer-events-none",
                        )}
                      >
                        {item.label.length > 7
                          ? item.label.slice(0, 7) + "…"
                          : item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        {/* User footer — dropdown with Profile, Theme, Logout */}
        <div className="border-t border-base-200 transition-all duration-300 ease-in-out p-2">
          {/* Dark mode quick-toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full mb-1 gap-2",
              sidebarCollapsed ? "btn-square mx-auto w-10" : "",
            )}
            onClick={() => {
              const isDark = theme.includes("dark");
              const next = isDark
                ? (theme.replace("dark", "light") as Parameters<
                    typeof setTheme
                  >[0])
                : (theme.replace("light", "dark") as Parameters<
                    typeof setTheme
                  >[0]);
              handleThemeSwitch(next);
            }}
            disabled={themeLocked}
            title={
              theme.includes("dark")
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            {theme.includes("dark") ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            {!sidebarCollapsed && (
              <span className="text-sm">
                {theme.includes("dark") ? "Light mode" : "Dark mode"}
              </span>
            )}
          </Button>
          <div className="dropdown dropdown-top w-full">
            <label
              tabIndex={0}
              className={cn(
                "flex cursor-pointer hover:bg-base-200 rounded-xl transition-all duration-300 ease-in-out items-center w-full",
                sidebarCollapsed ? "justify-center p-2" : "gap-2 px-2 py-1.5",
              )}
            >
              <Avatar
                name={
                  (user?.user_metadata?.name as string) || user?.email || "U"
                }
                src={user?.user_metadata?.avatar_url as string | undefined}
                size="sm"
              />
              <div
                className={cn(
                  "flex-1 min-w-0 overflow-hidden transition-all duration-300 ease-in-out",
                  sidebarCollapsed
                    ? "max-w-0 opacity-0 w-0"
                    : "max-w-full opacity-100",
                )}
              >
                <div className="text-sm font-medium truncate">
                  {(user?.user_metadata?.name as string) || "User"}
                </div>
                <div className="text-xs text-base-content/50 truncate">
                  {user?.email}
                </div>
              </div>
            </label>
            <ul
              tabIndex={0}
              className="dropdown-content user-menu-dropdown z-[999] menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-200 mb-2"
            >
              <li>
                <Link href={`/${currentOrg.slug}/profile`}>
                  <UserCircle className="w-4 h-4" />
                  Profile &amp; Security
                </Link>
              </li>
              <li>
                <details className="theme-selector-dropdown">
                  <summary className="flex items-center gap-1">
                    <Palette className="w-4 h-4" /> Theme
                    {themeLocked && (
                      <Lock className="w-3 h-3 text-warning ml-auto" />
                    )}
                  </summary>
                  <ul className="theme-selector-dropdown-list">
                    {THEMES.map((t) => (
                      <li key={t.value}>
                        <button
                          className={cn(
                            theme === t.value && "theme-option-active",
                            themeLocked && "opacity-50 cursor-not-allowed",
                          )}
                          onClick={() => handleThemeSwitch(t.value)}
                          disabled={themeLocked}
                        >
                          {t.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
              <li className="border-t border-base-200 mt-1 pt-1">
                <button className="user-menu-logout-action" onClick={logout}>
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const {
    sidebarCollapsed,
    breadcrumb,
    setMobileMenuOpen,
    setCommandPaletteOpen,
    commandPaletteQuery,
    setCommandPaletteQuery,
  } = useUIStore();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const connected = useProjectTaskStore((s) => s.connected);
  const router = useRouter();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-14 bg-base-100 border-b border-base-200 flex items-center px-4 gap-4 transition-all duration-300 ease-in-out glass-topbar",
        sidebarCollapsed ? "lg:ml-[92px]" : "lg:ml-64",
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="btn-square lg:hidden"
        onClick={() => setMobileMenuOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      <div className="flex min-w-0 items-center gap-3">
        {breadcrumb ? (
          <div className="flex items-center gap-2 min-w-0">
            {breadcrumb.backHref && (
              <Button
                variant="ghost"
                size="xs"
                className="btn-square flex-shrink-0"
                onClick={() => router.push(breadcrumb.backHref!)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.18em] text-base-content/40">
                {currentOrg?.name || "Workspace"}
              </div>
              <span className="text-sm font-semibold truncate block">
                {breadcrumb.label}
              </span>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-base-content/40">
              Workspace
            </div>
            <span className="text-sm font-semibold truncate block">
              {currentOrg?.name || "Organization"}
            </span>
          </div>
        )}

        <ConnectionBadge
          connected={connected}
          connectedLabel="Live sync"
          disconnectedLabel="Sync reconnecting"
          className="hidden md:inline-flex"
        />
      </div>

      <div className="flex-1" />

      {/* Navbar search input (drives command palette) */}
      <div
        id="topbar-search-anchor"
        className="hidden md:flex items-center gap-2 h-10 w-[22rem] lg:w-[30rem] rounded-xl search-anchor-surface px-3 text-base-content/70"
      >
        <Search className="w-4 h-4 flex-shrink-0 text-base-content/50" />
        <input
          id="topbar-search-input"
          type="text"
          value={commandPaletteQuery}
          onFocus={() => setCommandPaletteOpen(true)}
          onChange={(e) => {
            setCommandPaletteQuery(e.target.value);
            setCommandPaletteOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setCommandPaletteOpen(false);
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              setCommandPaletteOpen(true);
            }
          }}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/45"
          placeholder="Search pages, projects, tasks..."
          autoComplete="off"
        />
        <kbd className="kbd kbd-xs flex-shrink-0 border-base-200/60 bg-base-100/30 text-base-content/60">
          ⌘K
        </kbd>
      </div>

      {/* Sticky Notes & Notifications */}
      <StickyNotesPanel />
      <NotificationBell />
    </header>
  );
}

/* Mobile Sidebar Overlay */
function MobileSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { orgs, currentOrg, setCurrentOrg, user, logout } = useAuthStore();
  const {
    mobileMenuOpen,
    setMobileMenuOpen,
    theme,
    setTheme,
    themeLocked,
    colorSchemaLocked,
  } = useUIStore();
  const currentMembership = useAuthStore((s) => s.currentMembership);
  const orgPolicies = useOrgPolicies();
  const orgSlug = currentOrg?.slug || "";

  const mainItems: NavItem[] = [
    {
      href: `/${orgSlug}`,
      label: "Dashboard",
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/projects`,
      label: "Projects",
      icon: <FolderKanban className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/my-tasks`,
      label: "My Tasks",
      icon: <ListTodo className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/calendar`,
      label: "Calendar",
      icon: <CalendarDays className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/messages`,
      label: "Messages",
      icon: <MessageSquare className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/teams`,
      label: "Teams",
      icon: <Users className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/activity`,
      label: "Activity",
      icon: <Activity className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/templates`,
      label: "Templates",
      icon: <FileText className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/notifications`,
      label: "Notifications",
      icon: <Bell className="w-5 h-5" />,
    },
    {
      href: `/${orgSlug}/search`,
      label: "Search",
      icon: <Search className="w-5 h-5" />,
    },
  ];

  const settingsItems = getSettingsItems(orgSlug);

  const filteredSettings = settingsItems.filter(
    (item) =>
      !item.permission ||
      orgPolicies.can(item.permission[0], item.permission[1]),
  );

  const isActive = (href: string) =>
    pathname === href || (href !== `/${orgSlug}` && pathname.startsWith(href));

  const handleThemeSwitch = (value: string) => {
    if (themeLocked) return;
    setTheme(value as Parameters<typeof setTheme>[0]);
    const updateData: Record<string, unknown> = { theme: value };
    if (!colorSchemaLocked) {
      updateData.theme_customisation = null;
    }
    api.auth.updateUser({ data: updateData }).catch(() => {
      /* non-critical */
    });
  };

  const handleOrgSwitch = async (orgSlug: string) => {
    const org = orgs.find((o) => o.slug === orgSlug);
    if (org) {
      await setCurrentOrg(org);
      router.push(`/${org.slug}`);
      setMobileMenuOpen(false);
    }
  };

  if (!mobileMenuOpen || !currentOrg) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Drawer */}
      <aside className="fixed left-0 top-0 h-full w-72 max-w-[calc(100vw-3rem)] bg-base-100 z-50 lg:hidden shadow-xl glass-sidebar">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-base-200">
            <div className="flex items-center gap-2">
              {currentOrg.logo_url ? (
                <img
                  src={currentOrg.logo_url}
                  alt={currentOrg.name}
                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-content font-bold text-sm flex-shrink-0">
                  {(currentOrg.name?.[0] || "?").toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-semibold text-sm">{currentOrg.name}</div>
                <div className="text-xs text-base-content/50">
                  {orgPolicies.role || "member"}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="btn-square"
              onClick={() => setMobileMenuOpen(false)}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-2">
            <ul className="menu menu-md px-2 gap-1">
              {mainItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(isActive(item.href) && "active")}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>

            {filteredSettings.length > 0 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <span className="text-xs font-semibold text-base-content/40 uppercase tracking-wider">
                    Organisation
                  </span>
                </div>
                <ul className="menu menu-md px-2 gap-1">
                  {filteredSettings.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(isActive(item.href) && "active")}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Org Switcher */}
            {orgs.length > 1 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <span className="text-xs font-semibold text-base-content/40 uppercase tracking-wider">
                    Organizations
                  </span>
                </div>
                <ul className="menu menu-md px-2 gap-1">
                  {orgs.map((org) => (
                    <li key={org.id}>
                      <button
                        className={cn(org.id === currentOrg.id && "active")}
                        onClick={() => handleOrgSwitch(org.slug)}
                      >
                        {org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt={org.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 bg-primary/20 rounded flex items-center justify-center text-primary font-bold text-xs">
                            {(org.name?.[0] || "?").toUpperCase()}
                          </div>
                        )}
                        {org.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </nav>

          {/* User footer — dropdown with Profile, Theme, Logout */}
          <div className="border-t border-base-200 p-2">
            <div className="dropdown dropdown-top w-full">
              <label
                tabIndex={0}
                className="flex cursor-pointer hover:bg-base-200 rounded-xl items-center gap-2 px-2 py-1.5 w-full"
              >
                <Avatar
                  name={
                    (user?.user_metadata?.name as string) || user?.email || "U"
                  }
                  src={user?.user_metadata?.avatar_url as string | undefined}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {(user?.user_metadata?.name as string) || "User"}
                  </div>
                  <div className="text-xs text-base-content/50 truncate">
                    {user?.email}
                  </div>
                </div>
              </label>
              <ul
                tabIndex={0}
                className="dropdown-content user-menu-dropdown z-[999] menu p-2 shadow-lg bg-base-100 rounded-box w-56 border border-base-200 mb-2"
              >
                <li>
                  <Link
                    href={`/${currentOrg.slug}/profile`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <UserCircle className="w-4 h-4" />
                    Profile &amp; Security
                  </Link>
                </li>
                <li>
                  <details className="theme-selector-dropdown">
                    <summary className="flex items-center gap-1">
                      <Palette className="w-4 h-4" /> Theme
                      {themeLocked && (
                        <Lock className="w-3 h-3 text-warning ml-auto" />
                      )}
                    </summary>
                    <ul className="theme-selector-dropdown-list">
                      {THEMES.map((t) => (
                        <li key={t.value}>
                          <button
                            className={cn(
                              theme === t.value && "theme-option-active",
                              themeLocked && "opacity-50 cursor-not-allowed",
                            )}
                            onClick={() => handleThemeSwitch(t.value)}
                            disabled={themeLocked}
                          >
                            {t.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
                <li className="border-t border-base-200 mt-1 pt-1">
                  <button
                    className="user-menu-logout-action"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                  >
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, hasOrgs } = useRequireAuth();
  const {
    sidebarCollapsed,
    setTheme,
    setCustomisation,
    setThemeLocked,
    initializeTheme,
    setOrgThemeConfig,
  } = useUIStore();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const user = useAuthStore((s) => s.user);

  // Load org theme on org entry — this determines colour schema enforcement
  useEffect(() => {
    if (!currentOrg?.id) return;
    api.orgTheme
      .get(currentOrg.id)
      .then((cfg) => {
        const c = cfg?.custom_colors as unknown as
          | {
              profileId: string;
              primaryOverride?: string;
              baseContentOverride?: string;
            }
          | undefined;
        const hasOrgCustomisation = !!c?.profileId;

        // Update org enforcement state
        setOrgThemeConfig({
          locked: cfg?.locked ?? false,
          customisation: hasOrgCustomisation ? c! : null,
        });

        if (cfg?.locked) {
          // Fully locked — apply admin's theme + colour schema
          const baseTheme = cfg.base_theme as
            | "glass-light"
            | "glass-dark"
            | "orbis-light"
            | "orbis-dark";
          if (
            baseTheme &&
            ["glass-light", "glass-dark", "orbis-light", "orbis-dark"].includes(
              baseTheme,
            )
          ) {
            initializeTheme(baseTheme, hasOrgCustomisation ? c! : null);
          }
        } else if (hasOrgCustomisation) {
          // Admin set colours but not locked — enforce colour schema, user keeps their base theme
          const { theme } = useUIStore.getState();
          initializeTheme(theme, c!);
        } else {
          // No org config — load user preference from DB
          const savedTheme = user?.user_metadata?.theme as string | undefined;
          const savedCustomisation = user?.user_metadata
            ?.theme_customisation as
            | {
                profileId: string;
                primaryOverride?: string;
                baseContentOverride?: string;
              }
            | undefined;

          if (
            savedTheme &&
            ["glass-light", "glass-dark", "orbis-light", "orbis-dark"].includes(
              savedTheme,
            )
          ) {
            initializeTheme(
              savedTheme as
                | "glass-light"
                | "glass-dark"
                | "orbis-light"
                | "orbis-dark",
              savedCustomisation?.profileId ? savedCustomisation : null,
            );
          } else if (savedCustomisation?.profileId) {
            setCustomisation(savedCustomisation);
          }
        }
      })
      .catch(() => {
        // Org theme fetch failed — fall back to user preference from DB
        setOrgThemeConfig({ locked: false, customisation: null });
        const savedTheme = user?.user_metadata?.theme as string | undefined;
        const savedCustomisation = user?.user_metadata?.theme_customisation as
          | {
              profileId: string;
              primaryOverride?: string;
              baseContentOverride?: string;
            }
          | undefined;

        if (
          savedTheme &&
          ["glass-light", "glass-dark", "orbis-light", "orbis-dark"].includes(
            savedTheme,
          )
        ) {
          initializeTheme(
            savedTheme as
              | "glass-light"
              | "glass-dark"
              | "orbis-light"
              | "orbis-dark",
            savedCustomisation?.profileId ? savedCustomisation : null,
          );
        }
      });
  }, [currentOrg?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Single org-level WebSocket (replaces SSE + per-project WS)
  useOrgSocket(currentOrg?.id);

  if (isLoading || !hasOrgs) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200/30">
      <DataPrefetcher />
      <CommandPalette />
      <Sidebar />
      <MobileSidebar />
      <TopBar />
      <main
        className={cn(
          "transition-all duration-300 ease-in-out py-3 px-3 md:px-5 lg:px-6",
          "h-[calc(100vh-3.5rem)] overflow-auto",
          sidebarCollapsed ? "lg:ml-[92px]" : "lg:ml-64",
        )}
      >
        {children}
      </main>
    </div>
  );
}
