"use client";

import { Button } from "@reclit/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import {
  type FormDraft,
  type FormField,
  hasAnyFilledField,
  isUploading,
  toSubmitFields,
} from "@/lib/public-form";
import { useTRPC } from "@/trpc/client";
import { PublicFormFields } from "./public-form-fields";
import { usePublicFormUploads } from "./use-public-form-uploads";

/**
 * The form card: a draft per field, inline validation, and one
 * `populate.submit` — which appends the row and starts the sheet's AI columns
 * for it. Fields are all optional; a submission needs at least one filled.
 */
export function PublicForm({
  spreadsheetId,
  fields,
  onDone,
}: {
  spreadsheetId: string;
  fields: FormField[];
  onDone: () => void;
}) {
  const t = useTranslations("publicForm");
  const trpc = useTRPC();
  const [draft, setDraft] = useState<FormDraft>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const uploads = usePublicFormUploads(draft, setDraft);
  const submit = useMutation(
    trpc.populate.submit.mutationOptions({
      onSuccess: () => {
        // Cleared here, not on "submit another": once the row is saved its
        // files must be out of reach of the remove button.
        setDraft({});
        onDone();
      },
    }),
  );

  const filled = hasAnyFilledField(fields, draft);
  const canSubmit = filled && !isUploading(fields, draft) && !submit.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const result = toSubmitFields(fields, draft);
    if (!result.ok) {
      setErrors(
        Object.fromEntries(
          Object.entries(result.errors).map(([columnIndex, key]) => [
            columnIndex,
            t(`errors.${key}`),
          ]),
        ),
      );
      return;
    }
    setErrors({});
    submit.mutate({ id: spreadsheetId, fields: result.fields });
  };

  return (
    // noValidate: url/email/number rules run in toSubmitFields so every type
    // gets the same translated inline error, not a mix with native bubbles.
    <form
      className="space-y-8 rounded-sm border bg-card p-6 md:p-8"
      noValidate
      onSubmit={handleSubmit}
    >
      <header className="space-y-1">
        <h2 className="text-heading">{t("heading")}</h2>
        <p className="text-body text-muted-foreground">{t("description")}</p>
      </header>

      <PublicFormFields
        draft={draft}
        errors={errors}
        fields={fields}
        onChange={(columnIndex, field) => {
          setDraft((current) => ({ ...current, [columnIndex]: field }));
          setErrors(({ [columnIndex]: _cleared, ...rest }) => rest);
        }}
        onPickFile={(columnIndex, file) => void uploads.pick(columnIndex, file)}
        onRemoveFile={uploads.remove}
      />

      {submit.isError && (
        <p className="text-body text-destructive" role="alert">
          {t("submitError")}
        </p>
      )}

      <footer className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-muted-foreground">
          {filled ? t("aiNote") : t("atLeastOne")}
        </p>
        <Button disabled={!canSubmit} size="lg" type="submit" variant="default">
          {submit.isPending ? t("submitting") : t("submit")}
        </Button>
      </footer>
    </form>
  );
}
