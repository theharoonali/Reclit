"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { Spinner } from "@reclit/ui/spinner";
import { FileAudio, FileText, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FileDropZone } from "@/components/common/file-drop-zone";
import { useFilePicker } from "@/hooks/use-file-picker";
import { formatFileSize } from "@/lib/format-file-size";
import type { UploadState } from "@/lib/public-form";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-file";

type PublicFormFileFieldProps = {
  inputId: string;
  errorId: string;
  audio: boolean;
  state: UploadState;
  onPick: (file: File) => void;
  onRemove: () => void;
};

const FRAME = "flex items-center gap-3 rounded-sm border p-4";

/**
 * The file selector of an audio/file column: a `FileDropZone` that uploads the
 * moment a file is picked, then shows it with replace and remove. Removing
 * deletes the upload from storage (`usePublicFormUploads`).
 */
export function PublicFormFileField({
  inputId,
  errorId,
  audio,
  state,
  onPick,
  onRemove,
}: PublicFormFileFieldProps) {
  const t = useTranslations("publicForm.file");
  // Drives "Replace" once a file is uploaded; the idle state picks through
  // FileDropZone's own input.
  const picker = useFilePicker(onPick);
  const Icon = audio ? FileAudio : FileText;
  const input = (
    <input
      accept={audio ? "audio/*" : undefined}
      id={inputId}
      {...picker.inputProps}
    />
  );

  if (state.status === "uploading") {
    return (
      <output aria-live="polite" className={cn(FRAME, "border-input")}>
        <Spinner size="sm" />
        <span className="min-w-0 flex-1 truncate text-body">
          {state.fileName}
        </span>
        <span className="text-caption text-muted-foreground">
          {t("uploading")}
        </span>
      </output>
    );
  }

  if (state.status === "uploaded") {
    return (
      <div className={cn(FRAME, "border-input bg-background")}>
        {input}
        <span className="flex size-control shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <Icon className="size-icon" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-label">{state.file.name}</p>
          <p className="text-caption text-muted-foreground">
            {t("uploaded", { size: formatFileSize(state.file.size) })}
          </p>
        </div>
        <Button onClick={picker.open} size="sm" type="button" variant="ghost">
          {t("replace")}
        </Button>
        <Button
          aria-label={t("remove")}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
    );
  }

  return (
    <FileDropZone
      accept={audio ? "audio/*" : undefined}
      chooseLabel={audio ? t("chooseAudio") : t("choose")}
      error={
        state.status === "error"
          ? t(state.reason === "tooLarge" ? "tooLarge" : "failed", {
              name: state.fileName,
              size: formatFileSize(MAX_UPLOAD_BYTES),
            })
          : null
      }
      errorId={errorId}
      hint={t("maxSize", { size: formatFileSize(MAX_UPLOAD_BYTES) })}
      inputId={inputId}
      onPick={onPick}
      title={audio ? t("dropAudio") : t("drop")}
    />
  );
}
