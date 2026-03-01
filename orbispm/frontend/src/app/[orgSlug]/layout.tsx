"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore, THEMES } from "@/stores/ui-store";
import { useRequireAuth } from "@/hooks/use-auth-guard";
import { Avatar } from "@/components/ui/shared";
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  Users,
  Settings,
  CreditCard,
  Webhook,
  KeyRound,
  Shield,
  Bell,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Menu,
  LogOut,
  Building2,
  Palette,
  Activity,
  ChevronDown,
} from "lucide-react";
import type { OrgRole } from "@/types/domain";
import { cn } from "@/lib/utils";
import { WebSocketProvider } from "@/hooks/use-websocket";

import { NotificationBell } from "@/components/notification-bell";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: OrgRole[];
}

function getSidebarItems(orgSlug: string): NavItem[] {
  return [
    { href: `/${orgSlug}`, label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { href: `/${orgSlug}/my-tasks`, label: "My Tasks", icon: <ListTodo className="w-5 h-5" /> },
    { href: `/${orgSlug}/projects`, label: "Projects", icon: <FolderKanban className="w-5 h-5" /> },
    { href: `/${orgSlug}/teams`, label: "Teams", icon: <Users className="w-5 h-5" /> },
    { href: `/${orgSlug}/templates`, label: "Templates", icon: <FileText className="w-5 h-5" /> },
    { href: `/${orgSlug}/activity`, label: "Activity", icon: <Activity className="w-5 h-5" /> },
    { href: `/${orgSlug}/notifications`, label: "Notifications", icon: <Bell className="w-5 h-5" /> },
    { href: `/${orgSlug}/search`, label: "Search", icon: <Search className="w-5 h-5" /> },
  ];
}

function getSettingsItems(orgSlug: string): NavItem[] {
  return [
    { href: `/${orgSlug}/settings`, label: "General", icon: <Settings className="w-5 h-5" />, roles: ["owner", "admin"] },
    { href: `/${orgSlug}/settings/members`, label: "Members", icon: <Users className="w-5 h-5" />, roles: ["owner", "admin"] },
    { href: `/${orgSlug}/settings/billing`, label: "Billing", icon: <CreditCard className="w-5 h-5" />, roles: ["owner", "billing_admin"] },
    { href: `/${orgSlug}/settings/webhooks`, label: "Webhooks", icon: <Webhook className="w-5 h-5" />, roles: ["owner", "admin"] },
    { href: `/${orgSlug}/settings/api-keys`, label: "API Keys", icon: <KeyRound className="w-5 h-5" />, roles: ["owner", "admin"] },
    { href: `/${orgSlug}/settings/roles`, label: "Roles", icon: <Shield className="w-5 h-5" />, roles: ["owner", "admin"] },
    { href: `/${orgSlug}/settings/notifications`, label: "Notifications", icon: <Bell className="w-5 h-5" /> },
  ];
}

function Sidebar() {
  const pathname = usePathname();
  const { currentOrg, currentMembership, orgs, setCurrentOrg, user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const router = useRouter();

  if (!currentOrg) return null;

  const mainItems = getSidebarItems(currentOrg.slug);
  const settingsItems = getSettingsItems(currentOrg.slug);
  const userRole = currentMembership?.role as OrgRole | undefined;

  const filteredSettings = settingsItems.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
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
        "fixed left-0 top-0 h-full bg-base-100 border-r border-base-200 z-40 transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-col h-full">
        {/* Org header */}
        <div className="flex items-center justify-between p-4 border-b border-base-200">
          {!sidebarCollapsed && (
            <div className="dropdown dropdown-bottom w-full">
              <label tabIndex={0} className="flex items-center gap-2 cursor-pointer hover:bg-base-200 rounded-lg p-1 w-full">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-content font-bold text-sm">
                  {currentOrg.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{currentOrg.name}</div>
                  <div className="text-xs text-base-content/50">{userRole || "member"}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-base-content/50" />
              </label>
              <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-56 border border-base-200">
                {orgs.map((org) => (
                  <li key={org.id}>
                    <button
                      className={cn(org.id === currentOrg.id && "active")}
                      onClick={() => handleOrgSwitch(org.slug)}
                    >
                      <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-primary-content font-bold text-xs">
                        {org.name[0].toUpperCase()}
                      </div>
                      {org.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn btn-ghost btn-sm btn-square" onClick={toggleSidebar}>
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="menu menu-sm px-2 gap-1">
            {mainItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(isActive(item.href) && "active")}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              </li>
            ))}
          </ul>

          {filteredSettings.length > 0 && (
            <>
              {!sidebarCollapsed && (
                <div className="px-4 py-2 mt-2">
                  <span className="text-xs font-semibold text-base-content/40 uppercase tracking-wider">
                    Settings
                  </span>
                </div>
              )}
              <ul className="menu menu-sm px-2 gap-1">
                {filteredSettings.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(isActive(item.href) && "active")}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      {item.icon}
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        {/* User footer */}
        {!sidebarCollapsed && (
          <div className="border-t border-base-200 p-3">
            <div className="flex items-center gap-2">
              <Avatar name={user?.user_metadata?.name as string || user?.email || "U"} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user?.user_metadata?.name as string || "User"}</div>
                <div className="text-xs text-base-content/50 truncate">{user?.email}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function TopBar() {
  const { sidebarCollapsed } = useUIStore();
  const { setMobileMenuOpen } = useUIStore();
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme } = useUIStore();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-14 bg-base-100 border-b border-base-200 flex items-center px-4 gap-4 transition-all duration-200",
        sidebarCollapsed ? "ml-16" : "ml-64"
      )}
    >
      <button className="btn btn-ghost btn-sm btn-square lg:hidden" onClick={() => setMobileMenuOpen(true)}>
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1" />

      {/* Notifications */}
      <NotificationBell />

      {/* Theme picker */}
      <div className="dropdown dropdown-end">
        <label tabIndex={0} className="btn btn-ghost btn-sm btn-square">
          <Palette className="w-5 h-5" />
        </label>
        <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-40 border border-base-200">
          {THEMES.map((t) => (
            <li key={t.value}>
              <button className={cn(theme === t.value && "active")} onClick={() => setTheme(t.value)}>
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Logout */}
      <button className="btn btn-ghost btn-sm btn-square" onClick={logout} title="Logout">
        <LogOut className="w-5 h-5" />
      </button>
    </header>
  );
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, hasOrgs } = useRequireAuth();
  const { sidebarCollapsed } = useUIStore();

  if (isLoading || !hasOrgs) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <WebSocketProvider>
      <div className="min-h-screen">
        <Sidebar />
        <TopBar />
        <main className={cn("transition-all duration-200 p-6", sidebarCollapsed ? "ml-16" : "ml-64")}>
          {children}
        </main>
      </div>
    </WebSocketProvider>
  );
}
