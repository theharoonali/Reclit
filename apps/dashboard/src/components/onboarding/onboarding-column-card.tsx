"use client";

import { Button } from "@reclit/ui/button";
import { Check, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type {
  ColumnDraftIssue,
  ColumnDraftItem,
} from "@/lib/onboarding/column-draft";
import { OnboardingChip } from "./onboarding-chip";
import { OnboardingColumnForm } from "./onboarding-column-form";

type OnboardingColumnCardProps = {
  draft: ColumnDraftItem;
  issue: ColumnDraftIssue | null;
  disabled: boolean;
  onChange: (next: ColumnDraftItem) => void;
  onRemove: () => void;
};

/**
 * One row of the column list, readable first: the name with its type and
 * the AI mark, the prompt under it. The pencil opens the form in place and
 * turns into a check; a blank column the user added starts open.
 */
export function OnboardingColumnCard({
  draft,
  issue,
  disabled,
  onChange,
  onRemove,
}: OnboardingColumnCardProps) {
  const t = useTranslations("onboarding.columns");
  const typeNames = useTranslations("aiSpreadsheet.types");
  const [editing, setEditing] = useState(draft.source === "user");
  const isAi = draft.node !== null;
  const prompt = (draft.prompt ?? "").trim();

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label">
              {draft.name.trim() || t("untitled")}
            </span>
            <OnboardingChip>{typeNames(draft.type)}</OnboardingChip>
            {isAi && (
              <OnboardingChip tone="primary">
                <Sparkles aria-hidden="true" className="size-3" />
                {t("aiChip")}
              </OnboardingChip>
            )}
          </div>
          {!editing && isAi && (
            <p className="line-clamp-2 text-caption text-muted-foreground">
              {prompt || t("promptEmpty")}
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
        <OnboardingColumnForm
          disabled={disabled}
          draft={draft}
          issue={issue}
          onChange={onChange}
        />
      )}

      {issue && (
        <p className="text-caption text-destructive" role="alert">
          {t(issue)}
        </p>
      )}
    </li>
  );
}
