"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { useTranslations } from "next-intl";
import { addons, currentPlanId, plans } from "@/config/subscription";

/**
 * The subscription cards and one-time credit add-ons. Pure presentation over
 * the stubbed `config/subscription.ts` — there is no billing backend, so the
 * buttons carry no handlers. Pro keeps the plain card surface; Premium is the
 * primary-tinted (orange) one.
 */
export function SubscriptionSettings() {
  const t = useTranslations("settings.subscription");

  return (
    <>
      <section className="space-y-4">
        <h2 className="text-heading">{t("title")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const premium = plan.id === "premium";
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col gap-4 rounded-sm p-6",
                  premium
                    ? "border border-primary bg-primary/10"
                    : "border border-border bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-caption font-medium",
                      premium
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/15 text-primary",
                    )}
                  >
                    {t(`plans.${plan.id}`)}
                  </span>
                  {isCurrent && (
                    <span className="text-caption text-muted-foreground">
                      {t("currentPlan")}
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-title">
                    {t("price", { price: plan.price })}
                    <span className="text-body text-muted-foreground">
                      {t("perMonth")}
                    </span>
                  </p>
                  <p
                    className={cn(
                      "text-body",
                      premium ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {t("credits", { credits: plan.credits })}
                  </p>
                </div>

                <div className="mt-auto">
                  {isCurrent ? (
                    <Button disabled type="button" variant="outline">
                      {t("currentPlan")}
                    </Button>
                  ) : (
                    <Button type="button" variant="default">
                      {t("upgrade")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading">{t("addons.title")}</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {addons.map((addon) => (
            <div
              key={addon.id}
              className="flex flex-col gap-3 rounded-sm border border-border bg-card p-4"
            >
              <p className="text-subheading">
                {t("addons.credits", { credits: addon.credits })}
              </p>
              <p className="text-body text-muted-foreground">
                {t("addons.price", { price: addon.price })}
              </p>
              <div className="mt-auto">
                <Button type="button" variant="outline">
                  {t("addons.buy")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
