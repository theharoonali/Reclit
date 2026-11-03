"use client";

import { Button } from "@reclit/ui/button";
import { Spinner } from "@reclit/ui/spinner";
import { Textarea } from "@reclit/ui/textarea";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { FormField } from "@/components/common/form-field";
import { CompanyDocumentList } from "@/components/company/company-document-list";
import { CompanyDocumentUpload } from "@/components/company/company-document-upload";
import { COMPANY_LIMITS } from "@/lib/company/api";
import type { OnboardingCompanyApi } from "./use-onboarding-company";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

/**
 * The third screen: company documents and rules. Files upload as soon as
 * they are picked and list with their status; the rules are saved on Next.
 * Skip moves on to the workspace name without saving the rules.
 */
export function OnboardingDocumentsScreen({
  company,
  details,
}: {
  company: OnboardingCompanyApi;
  details: OnboardingWizardApi["details"];
}) {
  const t = useTranslations("onboarding");
  const tCompany = useTranslations("company");
  const rulesId = useId();
  const [rules, setRules] = useState(company.company?.rules ?? "");
  const { documents } = company;
  const busy = company.isSaving;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) company.submitDocuments(rules);
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <h1 className="text-title">{t("documents.title")}</h1>
        <p className="text-subtitle text-muted-foreground">
          {t("documents.subtitle")}
        </p>
      </div>
      <div className="space-y-3">
        <CompanyDocumentUpload documents={documents} />
        {documents.items.length > 0 && (
          <CompanyDocumentList
            items={documents.items}
            onRemove={documents.remove}
            removingId={documents.removingId}
          />
        )}
      </div>
      <FormField htmlFor={rulesId} label={t("documents.rulesLabel")}>
        <Textarea
          disabled={busy}
          id={rulesId}
          maxLength={COMPANY_LIMITS.rules}
          onChange={(event) => setRules(event.target.value)}
          placeholder={t("documents.rulesPlaceholder")}
          rows={4}
          value={rules}
        />
      </FormField>
      {company.updateErrorKey && (
        <p className="text-caption text-destructive" role="alert">
          {tCompany(`errors.${company.updateErrorKey}`)}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button
          disabled={!details.canGoBack}
          onClick={details.back}
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
          {t("back")}
        </Button>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={company.skipDocuments}
            type="button"
            variant="ghost"
          >
            {t("skip")}
          </Button>
          <Button disabled={busy} type="submit" variant="default">
            {busy ? t("saving") : t("next")}
            {busy ? <Spinner size="sm" /> : <ArrowRight />}
          </Button>
        </div>
      </div>
    </form>
  );
}
