"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { FileDropZone } from "@/components/common/file-drop-zone";
import type { CompanyErrorKey } from "@/lib/company/api";
import { DOCUMENT_ACCEPT, MAX_DOCUMENTS } from "@/lib/company/documents";
import type { CompanyDocumentsApi } from "./use-company-documents";

/**
 * The company documents' drop zone: several files at once, the accepted
 * types and limits in its hint, and the last refusal or failure under the
 * button. Full at ten documents.
 */
export function CompanyDocumentUpload({
  documents,
}: {
  documents: Pick<CompanyDocumentsApi, "add" | "items" | "errorKey">;
}) {
  const t = useTranslations("company");
  const errorId = useId();
  const errorKey: CompanyErrorKey | null = documents.errorKey;

  return (
    <FileDropZone
      accept={DOCUMENT_ACCEPT}
      chooseLabel={t("documents.choose")}
      disabled={documents.items.length >= MAX_DOCUMENTS}
      error={errorKey ? t(`errors.${errorKey}`) : null}
      errorId={errorId}
      hint={t("documents.dropHint")}
      multiple
      onPick={documents.add}
      title={t("documents.dropTitle")}
    />
  );
}
