"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Spinner } from "@reclit/ui/spinner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId } from "react";
import { useFilePicker } from "@/hooks/use-file-picker";
import { SHEET_FILE_ACCEPT } from "@/lib/ai-spreadsheet/import-file";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

/**
 * The second screen: the title and one field. The field opens the file
 * picker and shows the picked file; Next under it (or Enter) moves on, Skip
 * beside it creates the named empty workspace and leaves the wizard, Back
 * returns to the name. The hidden input is the picker's — the one control
 * the user never sees.
 */
export function OnboardingUploadScreen({
  details,
  errorMessage,
}: {
  details: OnboardingWizardApi["details"];
  errorMessage: string | null;
}) {
  const t = useTranslations("onboarding");
  const id = useId();
  const picker = useFilePicker(details.pickFile);
  const busy = details.isSkipping;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (details.file && !busy) details.submitUpload();
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <h1 className="text-title">{t("upload.title")}</h1>
      <div className="space-y-2">
        <input accept={SHEET_FILE_ACCEPT} {...picker.inputProps} />
        <Input
          aria-label={t("upload.label")}
          className="cursor-pointer"
          disabled={busy}
          id={id}
          onClick={picker.open}
          placeholder={t("upload.placeholder")}
          readOnly
          value={details.file?.name ?? ""}
        />
        <p className="text-caption text-muted-foreground">{t("examples")}</p>
        {errorMessage && (
          <p className="text-caption text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
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
            onClick={details.skip}
            type="button"
            variant="ghost"
          >
            {busy ? t("skipping") : t("skip")}
            {busy && <Spinner size="sm" />}
          </Button>
          <Button
            disabled={!details.file || busy}
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
