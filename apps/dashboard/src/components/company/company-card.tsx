"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@reclit/ui/avatar";
import { Card } from "@reclit/ui/card";
import { cn } from "@reclit/ui/cn";
import { focusRing } from "@reclit/ui/focus-ring";
import { Spinner } from "@reclit/ui/spinner";
import { Textarea } from "@reclit/ui/textarea";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { FormField } from "@/components/common/form-field";
import { useReseed } from "@/hooks/use-reseed";
import { COMPANY_LIMITS, type Company } from "@/lib/company/api";
import { companyInitial, websiteHost } from "@/lib/company/website";

type CompanyCardProps = {
  company: Pick<
    Company,
    "name" | "website" | "iconUrl" | "summary" | "crawlStatus" | "pageCount"
  >;
  /** Saves an edited summary on blur (`null` when cleared). Absent: read-only. */
  onSummarySave?: (summary: string | null) => void;
  isSaving?: boolean;
};

/**
 * What the AI knows about the company: the site's icon (the initial until
 * it loads), the name, the host as a link, the summary — editable, saved on
 * blur — and one line for the background crawl. Onboarding's website
 * screen and Settings both show it.
 */
export function CompanyCard({
  company,
  onSummarySave,
  isSaving = false,
}: CompanyCardProps) {
  const t = useTranslations("company.card");
  const id = useId();
  const saved = company.summary ?? "";
  const [draft, setDraft] = useState(saved);
  const markSeed = useReseed(saved, setDraft);
  const host = company.website ? websiteHost(company.website) : null;

  const handleBlur = () => {
    const next = draft.trim();
    if (!onSummarySave || next === saved.trim()) return;
    markSeed(next);
    onSummarySave(next === "" ? null : next);
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Avatar>
          {company.iconUrl && <AvatarImage alt="" src={company.iconUrl} />}
          <AvatarFallback>
            {companyInitial(company.name, company.website)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-subheading">{company.name ?? host}</p>
          {company.website && (
            <a
              className={cn(
                "rounded-sm text-caption text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
                focusRing,
              )}
              href={company.website}
              rel="noreferrer"
              target="_blank"
            >
              {host}
            </a>
          )}
        </div>
        {isSaving && <Spinner size="sm" />}
      </div>
      <FormField htmlFor={id} label={t("summaryLabel")}>
        <Textarea
          id={id}
          maxLength={COMPANY_LIMITS.summary}
          onBlur={handleBlur}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("summaryPlaceholder")}
          readOnly={!onSummarySave}
          rows={4}
          value={draft}
        />
      </FormField>
      <CrawlLine pageCount={company.pageCount} status={company.crawlStatus} />
    </Card>
  );
}

function CrawlLine({
  status,
  pageCount,
}: {
  status: Company["crawlStatus"];
  pageCount: number;
}) {
  const t = useTranslations("company.card");
  if (status === "IDLE") return null;
  const isBusy = status === "SCRAPING" || status === "CRAWLING";
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 text-caption",
        status === "FAILED" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {isBusy && <Spinner size="sm" />}
      {status === "SCRAPING" && t("scraping")}
      {status === "CRAWLING" && t("crawling")}
      {status === "READY" && t("ready", { count: pageCount })}
      {status === "FAILED" && t("failed")}
    </p>
  );
}
