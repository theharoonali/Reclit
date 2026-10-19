"use client";

import { Button } from "@reclit/ui/button";
import { Spinner } from "@reclit/ui/spinner";
import { Textarea } from "@reclit/ui/textarea";
import { ArrowLeft, ArrowRight, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { canCreate, columnDraftIssues } from "@/lib/onboarding/column-draft";
import { OnboardingColumnCard } from "./onboarding-column-card";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

/**
 * The third screen: the proposed columns as one divided list, the "tell us
 * more" box when the AI asked for context (or could not answer), the add
 * buttons, then Back and Create workspace.
 */
export function OnboardingColumnList({
  columns,
  details,
}: {
  columns: OnboardingWizardApi["columns"];
  details: OnboardingWizardApi["details"];
}) {
  const t = useTranslations("onboarding.columns");
  const tErrors = useTranslations("onboarding");
  const moreId = useId();
  const issues = columnDraftIssues(columns.drafts, columns.fileColumnNames);
  const disabled = columns.isCreating || columns.isPending;
  const showMore = columns.needsMoreContext || columns.errorKey !== null;

  return (
    <div className="space-y-4">
      <h1 className="text-title">{t("title")}</h1>

      {columns.drafts.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {columns.isPending ? t("thinking") : t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border bg-card">
          {columns.drafts.map((draft) => (
            <OnboardingColumnCard
              disabled={disabled}
              draft={draft}
              issue={issues[draft.key] ?? null}
              key={draft.key}
              onChange={(next) => columns.update(draft.key, next)}
              onRemove={() => columns.remove(draft.key)}
            />
          ))}
        </ul>
      )}

      {showMore && (
        <div className="space-y-2 rounded-sm border border-border bg-card p-3">
          <p className="text-label">{columns.question ?? t("moreSubtitle")}</p>
          <Textarea
            aria-label={t("moreTitle")}
            disabled={disabled}
            id={moreId}
            maxLength={1000}
            onChange={(event) => columns.setMoreContext(event.target.value)}
            placeholder={t("morePlaceholder")}
            rows={2}
            value={columns.moreContext}
          />
          <Button
            disabled={disabled}
            onClick={columns.suggestAgain}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Sparkles />
            {t("moreSubmit")}
          </Button>
        </div>
      )}

      {columns.createErrorKey && (
        <p className="text-caption text-destructive" role="alert">
          {tErrors(columns.createErrorKey)}
        </p>
      )}

      <div className="flex gap-1">
        <Button
          disabled={disabled}
          onClick={columns.addAi}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Sparkles />
          {t("add")}
        </Button>
        <Button
          disabled={disabled}
          onClick={columns.addPlain}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus />
          {t("addPlain")}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          disabled={!details.canGoBack}
          onClick={details.back}
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
          {tErrors("back")}
        </Button>
        <Button
          disabled={disabled || !canCreate(issues)}
          onClick={columns.create}
          type="button"
          variant="default"
        >
          {columns.isCreating ? t("creating") : t("create")}
          {columns.isCreating ? <Spinner size="sm" /> : <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}
