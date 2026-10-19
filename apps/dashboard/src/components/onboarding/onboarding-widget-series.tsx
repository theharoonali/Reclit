"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { FormField } from "@/components/common/form-field";
import {
  addSeries,
  isFormulaValid,
  removeSeries,
  updateSeries,
  type WidgetDraft,
} from "@/lib/onboarding/widget-draft";

/** A card's y axis: one row per series — a label and a formula — plus add / remove. */
export function OnboardingWidgetSeries({
  draft,
  disabled,
  onChange,
}: {
  draft: WidgetDraft;
  disabled: boolean;
  onChange: (next: WidgetDraft) => void;
}) {
  const t = useTranslations("onboarding.widgets");
  const ids = useId();
  const canRemove = draft.query.series.length > 1;

  return (
    <FormField label={t("series")} labelId={`${ids}-series`}>
      <div aria-labelledby={`${ids}-series`} className="space-y-2" role="group">
        {draft.query.series.map((series) => {
          const invalid = !isFormulaValid(series.formula);
          return (
            <div className="flex items-start gap-2" key={series.key}>
              <Input
                aria-label={t("seriesLabel")}
                className="w-1/3 shrink-0"
                disabled={disabled}
                maxLength={200}
                onChange={(event) =>
                  onChange(
                    updateSeries(draft, series.key, {
                      label: event.target.value,
                    }),
                  )
                }
                placeholder={t("seriesLabel")}
                value={series.label}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  aria-invalid={invalid ? true : undefined}
                  aria-label={t("formula")}
                  className="font-mono"
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      updateSeries(draft, series.key, {
                        formula: event.target.value,
                      }),
                    )
                  }
                  placeholder="SUM({Amount})"
                  value={series.formula}
                />
                {invalid && (
                  <p className="text-caption text-destructive">
                    {t("formulaInvalid")}
                  </p>
                )}
              </div>
              <Button
                aria-label={t("removeSeries")}
                disabled={disabled || !canRemove}
                onClick={() => onChange(removeSeries(draft, series.key))}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
          );
        })}
        <Button
          disabled={disabled}
          onClick={() =>
            onChange(
              addSeries(
                draft,
                t("newSeries", { n: draft.query.series.length + 1 }),
              ),
            )
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus />
          {t("addSeries")}
        </Button>
      </div>
    </FormField>
  );
}
