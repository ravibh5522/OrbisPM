"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { PageHeader, Card, LoadingPage } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { CreditCard, Check } from "lucide-react";
import type { BillingPlan } from "@/types/domain";

export default function BillingPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => api.billing.plans(),
  });

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", currentOrg?.id],
    queryFn: () => api.billing.subscription(currentOrg!.id),
    enabled: !!currentOrg,
    retry: false,
  });

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) => api.billing.subscribe(currentOrg!.id, { plan_id: planId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.billing.cancel(currentOrg!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  });

  if (plansLoading || subLoading) return <LoadingPage />;

  const planList = plans?.data || [];
  const currentPlanId = subscription?.plan_id;

  return (
    <div>
      <PageHeader title="Billing" description="Manage your subscription plan" />

      {subscription && (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Current Subscription</h3>
              <p className="text-sm text-base-content/60">Status: {subscription.status}</p>
            </div>
            <Button
              variant="error"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              loading={cancelMutation.isPending}
            >
              Cancel Subscription
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {planList.map((plan: BillingPlan) => (
          <Card
            key={plan.id}
            className={currentPlanId === plan.id ? "ring-2 ring-primary" : ""}
          >
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => subscribeMutation.mutate(plan.id)}
                  loading={subscribeMutation.isPending}
                >
                  Select Plan
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
