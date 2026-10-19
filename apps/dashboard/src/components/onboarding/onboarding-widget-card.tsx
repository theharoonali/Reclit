"use client";

import type { ColumnMeta } from "@reclit/dashboard-engine";
import { Button } from "@reclit/ui/button";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { widgetIssueMessageKey } from "@/lib/dashboard/widget-state";
import {
  type WidgetDraft,
  widgetDraftIssues,
} from "@/lib/onboarding/widget-draft";
import { OnboardingChip } from "./onboarding-chip";
import { OnboardingWidgetForm } from "./onboarding-widget-form";

type OnboardingWidgetCardProps = {
  draft: WidgetDraft;
  columns: readonly ColumnMeta[];
  disabled: boolean;
  /** A card the user just added starts open. */
  startOpen?: boolean;
  onChange: (next: WidgetDraft) => void;
  onRemove: () => void;
};

/**
 * One row of the card list, readable first: the title with the chart type
 * and the subtitle under it — no formulas until the pencil opens the config
 * in place (and turns into a check). A card the engine refuses shows why
 * either way.
 */
export function OnboardingWidgetCard({
  draft,
  columns,
  disabled,
  startOpen = false,
  onChange,
  onRemove,
}: OnboardingWidgetCardProps) {
  const t = useTranslations("onboarding.widgets");
  const tIssues = useTranslations("dashboard.widget.errors");
  const [editing, setEditing] = useState(startOpen);
  const issue = widgetDraftIssues(draft, columns)[0] ?? null;

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label">
              {draft.name.trim() || t("untitled")}
            </span>
            <OnboardingChip>{t(`types.${draft.type}`)}</OnboardingChip>
          </div>
          {!editing && draft.description && (
            <p className="line-clamp-2 text-caption text-muted-foreground">
              {draft.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            aria-label={t(editing ? "done" : "edit")}
            aria-pressed={editing}
            disabled={disabled}
            onClick={() => setEditing((value) => !value)}
            size="icon-sm"
            type="button"
            variant={editing ? "secondary" : "ghost"}
          >
            {editing ? <Check /> : <Pencil />}
          </Button>
          <Button
            aria-label={t("remove")}
            disabled={disabled}
            onClick={onRemove}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {editing && (
        <OnboardingWidgetForm
          columns={columns}
          disabled={disabled}
          draft={draft}
          onChange={onChange}
        />
      )}

      {issue && (
        <p className="text-caption text-destructive" role="alert">
          {tIssues(widgetIssueMessageKey(issue), {
            column: issue.detail ?? "",
          })}
        </p>
      )}
    </li>
  );
}
