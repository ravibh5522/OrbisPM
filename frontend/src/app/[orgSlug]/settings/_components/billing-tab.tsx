"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, LoadingPage } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/permission-gate";
import { CreditCard, Check } from "lucide-react";
import type { BillingPlan } from "@/types/domain";

export default function BillingTab() {
  const currentOrg = useAuthStore((s) => s.currentOrg);

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["billing-plans", currentOrg?.id],
    queryFn: () => api.billing.plans(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", currentOrg?.id],
    queryFn: () => api.billing.subscription(currentOrg!.id),
    enabled: !!currentOrg,
    retry: false,
  });

  const subscribeMutation = useMutation({
    mutationFn: (plan: BillingPlan) =>
      api.billing.checkout(currentOrg!.id, { price_id: plan.stripe_price_id! }),
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.billing.portal(currentOrg!.id),
    onSuccess: (data) => {
      window.location.href = data.portal_url;
    },
  });

  if (plansLoading || subLoading) return <LoadingPage />;

  const planList = plans?.data || [];
  const currentPlanId = subscription?.plan_id;

  return (
    <div>
      {subscription && (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Current Subscription</h3>
              <p className="text-sm text-base-content/60">Status: {subscription.status}</p>
            </div>
            <PermissionGate resource="billing" action="manage">
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                loading={cancelMutation.isPending}
              >
                Manage Subscription
              </Button>
            </PermissionGate>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {planList.map((plan: BillingPlan) => (
          <Card key={plan.id} className={currentPlanId === plan.id ? "ring-2 ring-primary" : ""}>
            <div className="text-center">
              <CreditCard className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <div className="my-4">
                {plan.limits && (
                  <ul className="text-sm space-y-1 text-base-content/70">
                    {Object.entries(plan.limits).map(([key, val]) => (
                      <li key={key} className="flex items-center gap-1 justify-center">
                        <Check className="w-3 h-3 text-success" />
                        {key}: {String(val)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {currentPlanId === plan.id ? (
                <span className="badge badge-primary">Current Plan</span>
              ) : (
                <PermissionGate resource="billing" action="manage">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => subscribeMutation.mutate(plan)}
                    disabled={!plan.stripe_price_id}
                    loading={subscribeMutation.isPending}
                  >
                    {plan.stripe_price_id ? "Select Plan" : "Contact Us"}
                  </Button>
                </PermissionGate>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
