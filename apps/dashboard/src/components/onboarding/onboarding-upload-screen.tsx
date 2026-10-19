"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId } from "react";
import { useFilePicker } from "@/hooks/use-file-picker";
import { SHEET_FILE_ACCEPT } from "@/lib/ai-spreadsheet/import-file";
import type { OnboardingWizardApi } from "./use-onboarding-wizard";

/**
 * The first screen: the title and one field. The field opens the file
 * picker and shows the picked file; Next under it (or Enter) moves on.
 * Skip sits beside Next and does nothing yet. The hidden input is the
 * picker's — the one control the user never sees.
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (details.file) details.submitUpload();
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <h1 className="text-title">{t("title")}</h1>
      <div className="space-y-2">
        <input accept={SHEET_FILE_ACCEPT} {...picker.inputProps} />
        <Input
          aria-label={t("upload.label")}
          className="cursor-pointer"
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost">
          {t("skip")}
        </Button>
        <Button disabled={!details.file} type="submit" variant="default">
          {t("next")}
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
