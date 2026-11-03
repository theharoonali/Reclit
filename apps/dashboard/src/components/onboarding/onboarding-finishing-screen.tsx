"use client";

import { Button } from "@reclit/ui/button";
import { Spinner } from "@reclit/ui/spinner";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDashboardLiveRows } from "@/components/dashboard/use-dashboard-live-rows";
import { ONBOARDING_RUN_ROW_LIMIT } from "@/config/onboarding";
import { generationDetail } from "@/lib/dashboard/generation";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

/**
 * The last screen, watched rather than filled in: the title and what is
 * happening — the AI cells still being filled, the worker's current detail
 * line — then the controls for the moment: Cancel while the dashboard is
 * being generated, Try again when the run could not start, Go to dashboard
 * once the generation has ended (a completed one leaves on its own). The
 * checklist itself lives in the right column, beside the orb.
 */
export function OnboardingFinishingScreen({
  finishing,
}: {
  finishing: OnboardingWizardApi["finishing"];
}) {
  const t = useTranslations("onboarding");
  const tDashboard = useTranslations("dashboard");
  const live = useDashboardLiveRows(finishing.spreadsheetId);
  const detail = finishing.isActive
    ? generationDetail(finishing.generation)
    : null;
  const errorMessage = finishing.errorKey
    ? t(finishing.errorKey)
    : finishing.hasGenerationFailed
      ? t("errorGenerate")
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-title">{t("finishing.title")}</h1>
        <p className="text-subtitle text-muted-foreground">
          {t("finishing.subtitle", { count: ONBOARDING_RUN_ROW_LIMIT })}
        </p>
      </div>

      <div aria-live="polite" className="space-y-2">
        {live.pendingCount > 0 && (
          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <Spinner size="sm" />
            {tDashboard("filling", { count: live.pendingCount })}
          </p>
        )}
        {detail && (
          <p className="text-caption text-muted-foreground">{detail}</p>
        )}
        {errorMessage && (
          <p className="text-caption text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {finishing.errorKey && (
          <Button
            disabled={finishing.isRunning}
            onClick={finishing.retry}
            type="button"
            variant="default"
          >
            {finishing.isRunning ? t("continuing") : t("finishing.retry")}
            {finishing.isRunning && <Spinner size="sm" />}
          </Button>
        )}
        {finishing.isActive && (
          <Button onClick={finishing.cancel} type="button" variant="ghost">
            {t("finishing.cancel")}
          </Button>
        )}
        {finishing.canLeave && (
          <Button
            onClick={finishing.goToDashboard}
            type="button"
            variant="default"
          >
            {t("finishing.goToDashboard")}
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}
