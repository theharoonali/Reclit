"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Spinner } from "@reclit/ui/spinner";
import { FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { FileDropZone } from "@/components/common/file-drop-zone";
import { FormField } from "@/components/common/form-field";
import { APP_NAME } from "@/config/nav";
import { useFilePicker } from "@/hooks/use-file-picker";
import { SHEET_FILE_ACCEPT } from "@/lib/ai-spreadsheet/import-file";
import { formatFileSize } from "@/lib/format-file-size";
import { workspaceNameFromFile } from "@/lib/onboarding/complete-onboarding";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-file";
import { useOnboarding } from "./use-onboarding";

/**
 * The onboarding screen: pick a CSV/XLSX, confirm the workspace name (prefilled
 * from the file), create. The server parses the file before writing anything,
 * so a rejected file can simply be replaced and retried.
 */
export function OnboardingUpload() {
  const t = useTranslations("onboarding");
  const ids = useId();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const onboarding = useOnboarding();

  const pick = (picked: File) => {
    onboarding.reset();
    setFile(picked);
    setName(workspaceNameFromFile(picked.name));
  };
  const replacer = useFilePicker(pick);
  const error = onboarding.errorKey ? t(onboarding.errorKey) : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (file && !onboarding.isPending) onboarding.run(file, name);
  };

  return (
    <main className="w-full max-w-lg space-y-8">
      <div className="space-y-2 text-center">
        <p className="text-eyebrow text-muted-foreground">
          {t("eyebrow", { name: APP_NAME })}
        </p>
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-subtitle text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {file ? (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 rounded-sm border border-input p-4">
            <input accept={SHEET_FILE_ACCEPT} {...replacer.inputProps} />
            <span className="flex size-control shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
              <FileSpreadsheet className="size-icon" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label">{file.name}</p>
              <p className="text-caption text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
            <Button
              disabled={onboarding.isPending}
              onClick={replacer.open}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("replace")}
            </Button>
          </div>

          <FormField htmlFor={`${ids}-name`} label={t("nameLabel")}>
            <Input
              disabled={onboarding.isPending}
              id={`${ids}-name`}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              value={name}
            />
          </FormField>

          {error && (
            <p className="text-caption text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            disabled={onboarding.isPending}
            type="submit"
            variant="default"
          >
            {onboarding.isPending && <Spinner size="sm" />}
            {onboarding.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      ) : (
        <FileDropZone
          accept={SHEET_FILE_ACCEPT}
          chooseLabel={t("choose")}
          hint={t("hint", { size: formatFileSize(MAX_UPLOAD_BYTES) })}
          onPick={pick}
          title={t("drop")}
        />
      )}
    </main>
  );
}
