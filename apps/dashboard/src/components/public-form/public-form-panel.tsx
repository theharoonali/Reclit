"use client";

import { Button } from "@reclit/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { uploadFile } from "@/lib/ai-spreadsheet/upload-file";
import {
  type AppendRowCells,
  emptyDraft,
  type FormDraft,
  hasAnyFilledField,
  isFillable,
  isFilled,
  validateField,
} from "@/lib/public-form";
import { useTRPC } from "@/trpc/client";
import { PublicFormFields } from "./public-form-fields";

type FieldErrors = Record<number, string>;

/**
 * The public form for one spreadsheet: fetches the sheet's columns, renders a
 * field per non-formula column, and appends one row on submit. Fields are all
 * optional; a submission needs at least one filled field. Audio/file fields
 * hold the picked File until submit, which uploads each through `POST /files`
 * and stores the returned URL as the cell value.
 */
export function PublicFormPanel({ spreadsheetId }: { spreadsheetId: string }) {
  const t = useTranslations("publicForm");
  const trpc = useTRPC();
  const sheet = useQuery(
    trpc.spreadsheet.rows.queryOptions({ id: spreadsheetId, limit: 1 }),
  );
  const appendRow = useMutation(trpc.spreadsheet.appendRow.mutationOptions());

  const [draft, setDraft] = useState<FormDraft>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<"editing" | "uploading" | "done">(
    "editing",
  );
  const [formError, setFormError] = useState<string | null>(null);

  if (sheet.isPending) return <LoadingState label={t("loading")} />;
  if (sheet.isError) {
    const code = (sheet.error as { data?: { code?: string } }).data?.code;
    return (
      <ErrorState
        message={code === "NOT_FOUND" ? t("notFound") : t("loadError")}
      />
    );
  }

  const columns = sheet.data.columns.filter(isFillable);
  if (columns.length === 0) return <ErrorState message={t("empty")} />;

  if (phase === "done") {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-title">{t("success.title")}</h1>
        <p className="text-body text-muted-foreground">
          {t("success.description")}
        </p>
        <Button
          onClick={() => {
            setDraft({});
            setErrors({});
            setFormError(null);
            setPhase("editing");
          }}
          type="button"
          variant="default"
        >
          {t("success.again")}
        </Button>
      </div>
    );
  }

  const canSubmit =
    hasAnyFilledField(columns, draft) &&
    phase !== "uploading" &&
    !appendRow.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setFormError(null);

    // Validate every filled text-shaped field before any upload starts.
    const nextErrors: FieldErrors = {};
    const cells: AppendRowCells = [];
    const uploads: { columnIndex: number; file: File }[] = [];
    for (const column of columns) {
      const field = draft[column.index] ?? emptyDraft();
      if (!isFilled(column.type, field)) continue;
      if (column.type === "boolean") {
        cells.push({ columnIndex: column.index, value: true });
      } else if (column.type === "audio" || column.type === "file") {
        if (field.file)
          uploads.push({ columnIndex: column.index, file: field.file });
      } else {
        const result = validateField(column.type, field.raw);
        if (!result.ok) {
          nextErrors[column.index] = t(`errors.${result.errorKey}`);
          continue;
        }
        cells.push({ columnIndex: column.index, value: result.value });
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPhase("uploading");
    try {
      for (const upload of uploads) {
        try {
          const uploaded = await uploadFile(upload.file);
          cells.push({ columnIndex: upload.columnIndex, value: uploaded.url });
        } catch {
          setErrors({ [upload.columnIndex]: t("errors.upload") });
          return;
        }
      }
      await appendRow.mutateAsync({ id: spreadsheetId, cells });
      setPhase("done");
    } catch {
      setFormError(t("submitError"));
    } finally {
      setPhase((current) => (current === "done" ? current : "editing"));
    }
  };

  const busy = phase === "uploading" || appendRow.isPending;

  return (
    // noValidate: url/email/number rules run in handleSubmit so every type
    // gets the same translated inline error, not a mix with native bubbles.
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <header className="space-y-1">
        <h1 className="text-title">{sheet.data.spreadsheet.name}</h1>
        <p className="text-body text-muted-foreground">{t("description")}</p>
      </header>

      <PublicFormFields
        columns={columns}
        draft={draft}
        errors={errors}
        labels={{
          choose: t("file.choose"),
          chooseAudio: t("file.chooseAudio"),
          replace: t("file.replace"),
          remove: t("file.remove"),
        }}
        onChange={(columnIndex, field) => {
          setDraft((current) => ({ ...current, [columnIndex]: field }));
          setErrors(({ [columnIndex]: _cleared, ...rest }) => rest);
        }}
      />

      {formError && (
        <p className="text-body text-destructive" role="alert">
          {formError}
        </p>
      )}

      <div className="space-y-2">
        <Button disabled={!canSubmit} type="submit" variant="default">
          {busy ? t("submitting") : t("submit")}
        </Button>
        {!hasAnyFilledField(columns, draft) && (
          <p className="text-caption text-muted-foreground">
            {t("atLeastOne")}
          </p>
        )}
      </div>
    </form>
  );
}
