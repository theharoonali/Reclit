"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Spinner } from "@reclit/ui/spinner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { FormField } from "@/components/common/form-field";
import { CompanyCard } from "@/components/company/company-card";
import { COMPANY_LIMITS } from "@/lib/company/api";
import type { OnboardingCompanyApi } from "./use-onboarding-company";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

/**
 * The second screen: the company's website. Next on a new address reads it
 * (a spinner line while it does, the orb runs) and shows the company card —
 * icon, name, host, the editable summary, the background crawl's line; Next
 * on the saved address moves to the documents. Skip moves on without one.
 */
export function OnboardingWebsiteScreen({
  company,
  details,
}: {
  company: OnboardingCompanyApi;
  details: OnboardingWizardApi["details"];
}) {
  const t = useTranslations("onboarding");
  const tCompany = useTranslations("company");
  const id = useId();
  const saved = company.company;
  const [url, setUrl] = useState(saved?.website ?? "");
  const busy = company.isScraping;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) company.submitWebsite(url);
  };

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <div className="space-y-1">
        <h1 className="text-title">{t("website.title")}</h1>
        <p className="text-subtitle text-muted-foreground">
          {t("website.subtitle")}
        </p>
      </div>
      <div className="space-y-2">
        <FormField htmlFor={id} label={t("website.label")}>
          <Input
            aria-invalid={company.websiteErrorKey ? true : undefined}
            autoComplete="url"
            autoFocus
            disabled={busy}
            id={id}
            inputMode="url"
            maxLength={COMPANY_LIMITS.website}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("website.placeholder")}
            value={url}
          />
        </FormField>
        {busy && (
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-caption text-muted-foreground"
          >
            <Spinner size="sm" />
            {tCompany("card.scraping")}
          </p>
        )}
        {company.websiteErrorKey && (
          <p className="text-caption text-destructive" role="alert">
            {tCompany(`errors.${company.websiteErrorKey}`)}
          </p>
        )}
      </div>
      {saved?.website && !busy && (
        <CompanyCard
          company={saved}
          isSaving={company.isSaving}
          onSummarySave={company.saveSummary}
        />
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
            onClick={company.skipWebsite}
            type="button"
            variant="ghost"
          >
            {t("skip")}
          </Button>
          <Button
            disabled={url.trim() === "" || busy}
            type="submit"
            variant="default"
          >
            {t("next")}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </form>
  );
}
