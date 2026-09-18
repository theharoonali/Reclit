"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { submitPath } from "@/config/populate";
import { API_BASE_URL } from "@/lib/api-fetch";
import { buildCurlExample } from "@/lib/populate/curl-example";
import { useTRPC } from "@/trpc/client";
import { useCopy } from "./use-copy";

const CODE = "rounded-sm border bg-muted/50 font-mono";

/**
 * The Populate API for one sheet: the endpoint and a curl built from the
 * sheet's real fields. It is the same submit the public form performs — a row
 * is appended and the sheet's AI columns run for it.
 */
export function PopulateApiCard({ spreadsheetId }: { spreadsheetId: string }) {
  const t = useTranslations("populate.api");
  const trpc = useTRPC();
  // Never trusted from cache: the fields are the sheet's columns, which change
  // on another page (`/ai-spreadsheet`), through the API, or in another tab —
  // none of which can invalidate this query. Opening the page, or refocusing
  // it, refetches; the last example stays on screen meanwhile.
  const form = useQuery(
    trpc.populate.form.queryOptions({ id: spreadsheetId }, { staleTime: 0 }),
  );
  const endpointCopy = useCopy();
  const exampleCopy = useCopy();

  if (form.isPending) return <LoadingState label={t("loading")} />;
  if (form.isError) return <ErrorState message={t("loadError")} />;

  const endpoint = `${API_BASE_URL}${submitPath(spreadsheetId)}`;
  const example = buildCurlExample({ endpoint, fields: form.data.fields });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-label">{t("endpoint")}</h3>
        <div className="flex items-start gap-2">
          <p
            className={cn(CODE, "min-w-0 flex-1 break-all px-3 py-2 text-body")}
          >
            <span className="text-primary">POST</span> {endpoint}
          </p>
          <Button
            onClick={() => void endpointCopy.copy(endpoint)}
            type="button"
            variant="outline"
          >
            {endpointCopy.copied ? t("copied") : t("copy")}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-label">{t("example")}</h3>
          <Button
            onClick={() => void exampleCopy.copy(example)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {exampleCopy.copied ? t("copied") : t("copy")}
          </Button>
        </div>
        <pre className={cn(CODE, "overflow-x-auto p-3 text-caption")}>
          {example}
        </pre>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-body text-muted-foreground">
        <li>{t("fieldsNote")}</li>
        <li>{t("responseNote")}</li>
        <li>{t("errorsNote")}</li>
        <li>{t("filesNote")}</li>
        <li>{t("corsNote")}</li>
      </ul>
    </div>
  );
}
