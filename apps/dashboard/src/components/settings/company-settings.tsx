"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { CompanyDocumentList } from "@/components/company/company-document-list";
import { CompanyDocumentUpload } from "@/components/company/company-document-upload";
import { useCompany } from "@/components/company/use-company";
import { useCompanyDocuments } from "@/components/company/use-company-documents";
import { CompanyRulesSettings } from "./company-rules-settings";
import { CompanyUseCaseSettings } from "./company-use-case-settings";
import { CompanyWebsiteSettings } from "./company-website-settings";

/**
 * The account's company profile — what every AI call knows about who the
 * user works for and why: the website and its card, the use cases, the
 * rules, the documents. Each part saves on its own; the container owns the
 * loading and error states and the document list.
 */
export function CompanySettings() {
  const t = useTranslations("settings.company");
  const { company, isPending, isError } = useCompany({ live: true });
  const documents = useCompanyDocuments(company?.documents ?? []);

  if (isPending) return <LoadingState label={t("loading")} />;
  if (isError || !company) return <ErrorState message={t("loadError")} />;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-heading">{t("title")}</h2>
        <p className="text-subtitle text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <div className="max-w-2xl space-y-8">
        <CompanyWebsiteSettings company={company} />
        <CompanyUseCaseSettings company={company} />
        <CompanyRulesSettings company={company} />
        <div className="space-y-3">
          <h3 className="text-subheading">{t("documentsTitle")}</h3>
          <CompanyDocumentList
            items={documents.items}
            onRemove={documents.remove}
            removingId={documents.removingId}
          />
          <CompanyDocumentUpload documents={documents} />
        </div>
      </div>
    </section>
  );
}
