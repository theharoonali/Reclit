"use client";

import { Spinner } from "@reclit/ui/spinner";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { CompanyUseCasePicker } from "@/components/company/company-use-case-picker";
import { useCompany } from "@/components/company/use-company";
import { useReseed } from "@/hooks/use-reseed";
import type { Company, UseCase } from "@/lib/company/api";
import { isUseCaseChange, toUseCaseUpdate } from "@/lib/company/use-cases";

/**
 * The use cases as compact chips. A toggle saves at once (the last one
 * cannot be removed — onboarding reads an empty set as "not started"); the
 * "Other" text saves when its field loses focus.
 */
export function CompanyUseCaseSettings({ company }: { company: Company }) {
  const t = useTranslations("settings.company");
  const tCompany = useTranslations("company");
  const headingId = useId();
  const { update } = useCompany();
  const [picked, setPicked] = useState<UseCase[]>(company.useCases);
  const [other, setOther] = useState(company.useCaseOther ?? "");
  useReseed(company.useCases.join(), () => setPicked(company.useCases));
  useReseed(company.useCaseOther ?? "", setOther);

  const save = (nextPicked: UseCase[], nextOther: string) => {
    if (!isUseCaseChange(company, nextPicked, nextOther)) return;
    void update.run(toUseCaseUpdate(nextPicked, nextOther));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-subheading" id={headingId}>
          {t("useCasesTitle")}
        </h3>
        {update.isPending && <Spinner size="sm" />}
      </div>
      <CompanyUseCasePicker
        labelledBy={headingId}
        onOtherBlur={() => save(picked, other)}
        onOtherChange={setOther}
        onPickedChange={(next) => {
          if (next.length === 0) return;
          setPicked(next);
          save(next, other);
        }}
        other={other}
        picked={picked}
        size="compact"
      />
      {update.errorKey && (
        <p className="text-caption text-destructive" role="alert">
          {tCompany(`errors.${update.errorKey}`)}
        </p>
      )}
    </div>
  );
}
