"use client";

import { cn } from "@reclit/ui/cn";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { useTRPC } from "@/trpc/client";
import { PublicForm } from "./public-form";
import { PublicFormHeader } from "./public-form-header";
import { PublicFormOutput } from "./public-form-output";
import { PublicFormSuccess } from "./public-form-success";
import {
  type PublicFormSubmission,
  usePublicFormOutput,
} from "./use-public-form-output";

/**
 * The public page for one spreadsheet: a header carrying the sheet's name,
 * then the form, its success state, or why there is no form. `populate.form`
 * decides which columns are fields — formula and AI columns are not — and
 * whether the sheet shows its output: then the form sits on the left and the
 * submitted row's AI columns fill in on the right.
 */
export function PublicFormPanel({ spreadsheetId }: { spreadsheetId: string }) {
  const t = useTranslations("publicForm");
  const trpc = useTRPC();
  const form = useQuery(trpc.populate.form.queryOptions({ id: spreadsheetId }));
  const [submission, setSubmission] = useState<PublicFormSubmission | null>(
    null,
  );
  const outputs = form.data?.outputs ?? [];
  const showOutput = (form.data?.outputEnabled ?? false) && outputs.length > 0;
  const output = usePublicFormOutput(spreadsheetId, submission, outputs);

  let body: ReactNode;
  if (form.isPending) {
    body = <LoadingState label={t("loading")} />;
  } else if (form.isError) {
    body = (
      <ErrorState
        message={
          form.error.data?.code === "NOT_FOUND" ? t("notFound") : t("loadError")
        }
      />
    );
  } else if (form.data.fields.length === 0) {
    body = <ErrorState message={t("empty")} />;
  } else {
    const content = submission ? (
      <PublicFormSuccess onAgain={() => setSubmission(null)} />
    ) : (
      <PublicForm
        fields={form.data.fields}
        onDone={setSubmission}
        spreadsheetId={spreadsheetId}
      />
    );
    body = showOutput ? (
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {content}
        <PublicFormOutput
          hasSubmission={submission !== null}
          isWorking={output.isWorking}
          outputs={outputs}
          state={output.state}
        />
      </div>
    ) : (
      content
    );
  }

  return (
    <>
      <PublicFormHeader title={form.data?.spreadsheet.name ?? t("title")} />
      <main
        className={cn(
          "mx-auto w-full px-4 py-8 md:px-8",
          showOutput ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        {body}
      </main>
    </>
  );
}
