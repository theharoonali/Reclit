"use client";

import { Button } from "@reclit/ui/button";
import { Card, CardContent } from "@reclit/ui/card";
import { useTranslations } from "next-intl";
import { AssistantOrb } from "@/components/assistant/assistant-orb";
import { StepList } from "@/components/common/step-list";
import {
  type DashboardGeneration,
  generationDetail,
  generationSteps,
  isTerminalGeneration,
} from "@/lib/dashboard/generation";

type DashboardGenerationProgressProps = {
  generation: DashboardGeneration;
  /** A fresh start is on its way — Try again is disabled. */
  isStarting: boolean;
  onCancel: () => void;
  onRetry: () => void;
  /** Put the card away and show the empty state instead. */
  onDismiss: () => void;
};

/**
 * The page body while the AI builds the dashboard, or right after it could
 * not: the orb, the worker's phases as a checklist, the current detail line
 * and Cancel; a failed or cancelled generation shows why and offers Try
 * again or Dismiss (back to the empty state and its starter dashboard). The
 * onboarding finishing screen follows the same generation through its own
 * checklist.
 */
export function DashboardGenerationProgress({
  generation,
  isStarting,
  onCancel,
  onRetry,
  onDismiss,
}: DashboardGenerationProgressProps) {
  const t = useTranslations("dashboard.generation");
  const isActive = !isTerminalGeneration(generation);
  const detail = generationDetail(generation);
  const steps = generationSteps(generation).map((step) => ({
    key: step.key,
    label: t(`steps.${step.key}`),
    status: step.status,
  }));

  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-16 text-center">
        <AssistantOrb
          className="size-orb-md"
          state={isActive ? "running" : "idle"}
        />
        <h2 className="mt-6 text-subheading">{t("title")}</h2>
        <StepList className="mt-6 text-left" items={steps} />
        {isActive && detail && (
          <p className="mt-4 max-w-md text-caption text-muted-foreground">
            {detail}
          </p>
        )}
        {generation.status === "failed" && (
          <p
            className="mt-4 max-w-md text-caption text-destructive"
            role="alert"
          >
            {t("failed", { message: generation.error?.message ?? "" })}
          </p>
        )}
        {generation.status === "cancelled" && (
          <p className="mt-4 max-w-md text-caption text-muted-foreground">
            {t("cancelled")}
          </p>
        )}
        {isActive ? (
          <Button
            className="mt-6"
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
        ) : (
          <div className="mt-6 flex gap-2">
            <Button
              disabled={isStarting}
              onClick={onRetry}
              size="sm"
              type="button"
              variant="default"
            >
              {isStarting ? t("starting") : t("tryAgain")}
            </Button>
            <Button
              disabled={isStarting}
              onClick={onDismiss}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("dismiss")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
