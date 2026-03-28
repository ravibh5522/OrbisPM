"use client";

import { PageHeader } from "@/components/ui/shared";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { OrgRole } from "@/types/domain";
import {
  Building2,
  CreditCard,
  KeyRound,
  Mail,
  Paintbrush,
  Shield,
  Users,
  Webhook,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import dynamic from "next/dynamic";

import ApiKeysTab from "./_components/api-keys-tab";
import BillingTab from "./_components/billing-tab";
import MembersTab from "./_components/members-tab";
import OrganisationTab from "./_components/organisation-tab";
import PermissionsTab from "./_components/permissions-tab";
import ThemeTab from "./_components/theme-tab";
import WebhooksTab from "./_components/webhooks-tab";

const EmailTemplatesTab = dynamic(
  () => import("./_components/email-templates-tab"),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse bg-base-200 rounded-lg" />
    ),
  },
);

interface TabDef {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  roles: OrgRole[];
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  {
    key: "organisation",
    label: "Organisation",
    description: "Brand, profile, billing identity, and workspace details.",
    icon: <Building2 className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: OrganisationTab,
  },
  {
    key: "members",
    label: "Members",
    description: "Manage who can access the workspace and what they can do.",
    icon: <Users className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: MembersTab,
  },
  {
    key: "billing",
    label: "Billing",
    description: "Review plan details, limits, and commercial controls.",
    icon: <CreditCard className="w-4 h-4" />,
    roles: ["owner", "billing_admin"],
    component: BillingTab,
  },
  {
    key: "permissions",
    label: "Roles & Permissions",
    description:
      "Define access models across organisation, team, and project scopes.",
    icon: <Shield className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: PermissionsTab,
  },
  {
    key: "webhooks",
    label: "Webhooks",
    description: "Connect OrbisPM events to your downstream systems.",
    icon: <Webhook className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: WebhooksTab,
  },
  {
    key: "api-keys",
    label: "API Keys",
    description:
      "Create and rotate machine access without exposing raw secrets again.",
    icon: <KeyRound className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: ApiKeysTab,
  },
  {
    key: "email-templates",
    label: "Email Templates",
    description:
      "Customize outbound transactional messaging and notifications.",
    icon: <Mail className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: EmailTemplatesTab,
  },
  {
    key: "theme",
    label: "Theme",
    description:
      "Set an org-wide theme with custom colours and optionally lock it for all members.",
    icon: <Paintbrush className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: ThemeTab,
  },
];

export default function SettingsPage() {
  const { currentMembership } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userRole = currentMembership?.role as OrgRole | undefined;

  const visibleTabs = TABS.filter(
    (tab) => userRole && tab.roles.includes(userRole),
  );

  const tabParam = searchParams.get("tab");
  const initialTab =
    visibleTabs.find((t) => t.key === tabParam)?.key ||
    visibleTabs[0]?.key ||
    "organisation";
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const nextTab =
      visibleTabs.find((t) => t.key === tabParam)?.key || visibleTabs[0]?.key;
    if (nextTab && nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, tabParam, visibleTabs]);

  const currentTab =
    visibleTabs.find((t) => t.key === activeTab) || visibleTabs[0];

  if (!visibleTabs.length) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="text-base-content/60">
            You don&apos;t have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  if (!currentTab) return null;

  const TabContent = currentTab.component;

  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tabKey);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description={currentTab.description}
        actions={
          <span className="badge badge-outline badge-sm">
            {currentTab.label}
          </span>
        }
      />

      {/* Tab bar */}
      <div className="sticky top-0 z-10 mb-6 border-b border-base-200 bg-base-100/85 backdrop-blur-sm">
        <div className="flex gap-1 overflow-x-auto pb-px -mb-px">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <TabContent />
    </div>
  );
}
