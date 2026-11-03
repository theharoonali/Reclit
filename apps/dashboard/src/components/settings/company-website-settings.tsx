"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Spinner } from "@reclit/ui/spinner";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { FormField } from "@/components/common/form-field";
import { CompanyCard } from "@/components/company/company-card";
import { useCompany } from "@/components/company/use-company";
import { useReseed } from "@/hooks/use-reseed";
import { COMPANY_LIMITS, type Company } from "@/lib/company/api";
import { isSameWebsite } from "@/lib/company/website";

/**
 * The website part of Settings' company section: the company card (the
 * summary edits in place), the address with "Read website" for a new one,
 * and "Re-scan website" to crawl the saved one again.
 */
export function CompanyWebsiteSettings({ company }: { company: Company }) {
  const t = useTranslations("settings.company");
  const tCompany = useTranslations("company");
  const id = useId();
  const { update, setWebsite, recrawl } = useCompany();
  const [url, setUrl] = useState(company.website ?? "");
  useReseed(company.website ?? "", setUrl);

  const isNew = url.trim() !== "" && !isSameWebsite(url, company.website);
  const isCrawling =
    company.crawlStatus === "SCRAPING" || company.crawlStatus === "CRAWLING";
  const errorKey = setWebsite.errorKey ?? recrawl.errorKey;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isNew && !setWebsite.isPending) void setWebsite.run(url.trim());
  };

  return (
    <div className="space-y-4">
      {company.website ? (
        <CompanyCard
          company={company}
          isSaving={update.isPending}
          onSummarySave={(summary) => void update.run({ summary })}
        />
      ) : (
        <p className="text-caption text-muted-foreground">{t("noWebsite")}</p>
      )}
      <form className="space-y-2" noValidate onSubmit={handleSubmit}>
        <FormField htmlFor={id} label={t("websiteLabel")}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-invalid={setWebsite.errorKey ? true : undefined}
              autoComplete="url"
              disabled={setWebsite.isPending}
              id={id}
              inputMode="url"
              maxLength={COMPANY_LIMITS.website}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t("websitePlaceholder")}
              value={url}
            />
            <Button
              disabled={!isNew || setWebsite.isPending}
              type="submit"
              variant="outline"
            >
              {setWebsite.isPending && <Spinner size="sm" />}
              {t("readWebsite")}
            </Button>
            <Button
              disabled={!company.website || isCrawling || recrawl.isPending}
              onClick={() => void recrawl.run()}
              type="button"
              variant="ghost"
            >
              <RefreshCw />
              {t("rescan")}
            </Button>
          </div>
        </FormField>
        {errorKey && (
          <p className="text-caption text-destructive" role="alert">
            {tCompany(`errors.${errorKey}`)}
          </p>
        )}
      </form>
    </div>
  );
}
