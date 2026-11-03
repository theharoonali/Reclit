"use client";

import { Button } from "@reclit/ui/button";
import { Spinner } from "@reclit/ui/spinner";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { CompanyUseCasePicker } from "@/components/company/company-use-case-picker";
import type { UseCase } from "@/lib/company/api";
import type { OnboardingCompanyApi } from "./use-onboarding-company";

/**
 * The first screen: what the user will use Reclit for. Six cards, several
 * may be picked; Other opens a field. Next is disabled until something is
 * picked, then saves the pick and moves to the website.
 */
export function OnboardingPurposeScreen({
  company,
}: {
  company: OnboardingCompanyApi;
}) {
  const t = useTranslations("onboarding");
  const tCompany = useTranslations("company");
  const headingId = useId();
  const [picked, setPicked] = useState<UseCase[]>(
    company.company?.useCases ?? [],
  );
  const [other, setOther] = useState(company.company?.useCaseOther ?? "");
  const busy = company.isSaving;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (picked.length > 0 && !busy) company.submitPurpose(picked, other);
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <h1 className="text-title" id={headingId}>
          {t("purpose.title")}
        </h1>
        <p className="text-subtitle text-muted-foreground">
          {t("purpose.subtitle")}
        </p>
      </div>
      <CompanyUseCasePicker
        disabled={busy}
        labelledBy={headingId}
        onOtherChange={setOther}
        onPickedChange={setPicked}
        other={other}
        picked={picked}
      />
      {company.updateErrorKey && (
        <p className="text-caption text-destructive" role="alert">
          {tCompany(`errors.${company.updateErrorKey}`)}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          disabled={picked.length === 0 || busy}
          type="submit"
          variant="default"
        >
          {busy ? t("saving") : t("next")}
          {busy ? <Spinner size="sm" /> : <ArrowRight />}
        </Button>
      </div>
    </form>
  );
}
