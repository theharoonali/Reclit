"use client";

import { Button } from "@reclit/ui/button";
import { Spinner } from "@reclit/ui/spinner";
import { Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { widgetDraftIssues } from "@/lib/onboarding/widget-draft";
import { OnboardingWidgetCard } from "./onboarding-widget-card";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

/**
 * The last screen: the proposed cards as one divided list (titles and
 * subtitles; the config behind the pencil), Add card on the left, the
 * summary and Run AI on the right.
 */
export function OnboardingWidgetList({
  widgets,
}: {
  widgets: OnboardingWizardApi["widgets"];
}) {
  const t = useTranslations("onboarding.widgets");
  const tErrors = useTranslations("onboarding");
  const disabled = widgets.isRunning || widgets.isRecommending;
  const hasIssue = widgets.drafts.some(
    (draft) => widgetDraftIssues(draft, widgets.columns).length > 0,
  );
  const summary =
    widgets.rowCount === null
      ? t("summaryNoRows", {
          cards: widgets.drafts.length,
          columns: widgets.aiColumnCount,
        })
      : t("summary", {
          cards: widgets.drafts.length,
          columns: widgets.aiColumnCount,
          rows: widgets.rowCount,
        });

  return (
    <div className="space-y-4">
      <h1 className="text-title">{t("title")}</h1>

      {widgets.drafts.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {widgets.isRecommending ? t("thinking") : t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border bg-card">
          {widgets.drafts.map((draft) => (
            <OnboardingWidgetCard
              columns={widgets.columns}
              disabled={disabled}
              draft={draft}
              key={draft.key}
              onChange={(next) => widgets.update(draft.key, next)}
              onRemove={() => widgets.remove(draft.key)}
              startOpen={draft.key.startsWith("new-")}
            />
          ))}
        </ul>
      )}

      {widgets.runErrorKey && (
        <p className="text-caption text-destructive" role="alert">
          {tErrors(widgets.runErrorKey)}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          disabled={disabled}
          onClick={() => widgets.add(t("newCard"))}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus />
          {t("add")}
        </Button>
        <div className="flex items-center gap-3">
          <p className="text-caption text-muted-foreground">{summary}</p>
          <Button
            disabled={disabled || hasIssue}
            onClick={widgets.run}
            type="button"
            variant="default"
          >
            {widgets.isRunning ? t("running") : t("run")}
            {widgets.isRunning ? <Spinner size="sm" /> : <Sparkles />}
          </Button>
        </div>
      </div>
    </div>
  );
}
