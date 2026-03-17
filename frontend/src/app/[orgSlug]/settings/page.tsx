"use client";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { OrgRole } from "@/types/domain";
import {
  Building2,
  CreditCard,
  KeyRound,
  Mail,
  Shield,
  Users,
  Webhook,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import ApiKeysTab from "./_components/api-keys-tab";
import BillingTab from "./_components/billing-tab";
import EmailTemplatesTab from "./_components/email-templates-tab";
import MembersTab from "./_components/members-tab";
import OrganisationTab from "./_components/organisation-tab";
import PermissionsTab from "./_components/permissions-tab";
import WebhooksTab from "./_components/webhooks-tab";

interface TabDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  roles: OrgRole[];
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  {
    key: "organisation",
    label: "Organisation",
    icon: <Building2 className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: OrganisationTab,
  },
  {
    key: "members",
    label: "Members",
    icon: <Users className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: MembersTab,
  },
  {
    key: "billing",
    label: "Billing",
    icon: <CreditCard className="w-4 h-4" />,
    roles: ["owner", "billing_admin"],
    component: BillingTab,
  },
  {
    key: "permissions",
    label: "Roles & Permissions",
    icon: <Shield className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: PermissionsTab,
  },
  {
    key: "webhooks",
    label: "Webhooks",
    icon: <Webhook className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: WebhooksTab,
  },
  {
    key: "api-keys",
    label: "API Keys",
    icon: <KeyRound className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: ApiKeysTab,
  },
  {
    key: "email-templates",
    label: "Email Templates",
    icon: <Mail className="w-4 h-4" />,
    roles: ["owner", "admin"],
    component: EmailTemplatesTab,
  },
];

export default function SettingsPage() {
  const { currentMembership } = useAuthStore();
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

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-base-200 mb-6">
        <div className="flex gap-1 overflow-x-auto pb-px -mb-px">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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
