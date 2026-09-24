"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { useTRPC } from "@/trpc/client";
import { PublicForm } from "./public-form";
import { PublicFormHeader } from "./public-form-header";
import { PublicFormSuccess } from "./public-form-success";

/**
 * The public page for one spreadsheet: a header carrying the sheet's name,
 * then the form, its success state, or why there is no form. `populate.form`
 * decides which columns are fields — formula and AI columns are not.
 */
export function PublicFormPanel({ spreadsheetId }: { spreadsheetId: string }) {
  const t = useTranslations("publicForm");
  const trpc = useTRPC();
  const form = useQuery(trpc.populate.form.queryOptions({ id: spreadsheetId }));
  const [done, setDone] = useState(false);

  return (
    <>
      <PublicFormHeader title={form.data?.spreadsheet.name ?? t("title")} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        {form.isPending ? (
          <LoadingState label={t("loading")} />
        ) : form.isError ? (
          <ErrorState
            message={
              form.error.data?.code === "NOT_FOUND"
                ? t("notFound")
                : t("loadError")
            }
          />
        ) : form.data.fields.length === 0 ? (
          <ErrorState message={t("empty")} />
        ) : done ? (
          <PublicFormSuccess onAgain={() => setDone(false)} />
        ) : (
          <PublicForm
            fields={form.data.fields}
            onDone={() => setDone(true)}
            spreadsheetId={spreadsheetId}
          />
        )}
      </main>
    </>
  );
}
