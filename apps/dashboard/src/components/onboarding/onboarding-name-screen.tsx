"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId } from "react";
import { FormField } from "@/components/common/form-field";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

const NAME_MAX = 200;

/**
 * The first screen: the workspace's name, one field with Next under it
 * (Enter submits too). The name is the source of truth from here on — the
 * skip creates a workspace with it, the upload path names the created one.
 */
export function OnboardingNameScreen({
  details,
}: {
  details: OnboardingWizardApi["details"];
}) {
  const t = useTranslations("onboarding");
  const id = useId();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    details.submitName();
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <h1 className="text-title">{t("name.title")}</h1>
      <FormField htmlFor={id} label={t("name.label")}>
        <Input
          autoFocus
          id={id}
          maxLength={NAME_MAX}
          onChange={(event) => details.setName(event.target.value)}
          placeholder={t("name.placeholder")}
          value={details.name}
        />
      </FormField>
      <div className="flex justify-end">
        <Button
          disabled={!details.canSubmitName}
          type="submit"
          variant="default"
        >
          {t("next")}
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
