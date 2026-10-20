"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Spinner } from "@reclit/ui/spinner";
import { Textarea } from "@reclit/ui/textarea";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId } from "react";
import { FormField } from "@/components/common/form-field";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

const DESCRIPTION_MAX = 1000;
const PURPOSE_MAX = 80;

/**
 * The second screen: the name, the label and the description the AI wrote
 * from the file, to review and edit — labels sit above the two fields —
 * with Back and Next under them. The fields fill themselves as the
 * description arrives.
 */
export function OnboardingReviewScreen({
  details,
  isBusy,
}: {
  details: OnboardingWizardApi["details"];
  /** The next stage is thinking: read-only until it is done. */
  isBusy: boolean;
}) {
  const t = useTranslations("onboarding");
  const nameId = useId();
  const purposeId = useId();
  const described = details.described;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (details.canContinue && !isBusy) details.continue();
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <h1 className="text-title">{t("review.title")}</h1>
        <p className="text-caption text-muted-foreground">
          {details.file?.name}
          {described &&
            ` · ${t("summary.rows", { count: described.rowCount })} · ${t("summary.columns", { count: described.columns.length })}`}
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField htmlFor={nameId} label={t("nameLabel")}>
            <Input
              disabled={isBusy}
              id={nameId}
              maxLength={200}
              onChange={(event) => details.setName(event.target.value)}
              value={details.name}
            />
          </FormField>
          <FormField htmlFor={purposeId} label={t("purposeLabel")}>
            <Input
              disabled={isBusy}
              id={purposeId}
              maxLength={PURPOSE_MAX}
              onChange={(event) => details.setPurpose(event.target.value)}
              value={details.purpose}
            />
          </FormField>
        </div>
        <Textarea
          aria-busy={details.isDescribing || undefined}
          aria-label={t("descriptionLabel")}
          disabled={isBusy}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => details.setDescription(event.target.value)}
          placeholder={t("descriptionLabel")}
          rows={4}
          value={details.description}
        />
        {details.isDescribing && (
          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <Spinner size="sm" />
            {t("describing")}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          disabled={isBusy}
          onClick={details.back}
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
          {t("back")}
        </Button>
        <Button
          disabled={!details.canContinue || isBusy}
          type="submit"
          variant="default"
        >
          {isBusy ? t("continuing") : t("next")}
          {isBusy ? <Spinner size="sm" /> : <ArrowRight />}
        </Button>
      </div>
    </form>
  );
}
