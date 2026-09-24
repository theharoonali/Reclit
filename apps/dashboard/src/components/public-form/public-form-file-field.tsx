"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { Spinner } from "@reclit/ui/spinner";
import { FileAudio, FileText, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { type DragEvent, useState } from "react";
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
 * The file selector of an audio/file column: a drop target that uploads the
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
  const picker = useFilePicker(onPick);
  const [dragging, setDragging] = useState(false);
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

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onPick(file);
  };

  return (
    // Drag-and-drop is an extra; the button inside is the keyboard path.
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-sm border border-dashed border-input p-6 text-center transition-colors",
        dragging && "border-primary bg-accent",
        state.status === "error" && "border-destructive",
      )}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={handleDrop}
    >
      {input}
      <span className="flex size-control-lg items-center justify-center rounded-full bg-primary/10 text-primary">
        <Upload className="size-icon" />
      </span>
      <div className="space-y-1">
        <p className="text-body">{audio ? t("dropAudio") : t("drop")}</p>
        <p className="text-caption text-muted-foreground">
          {t("maxSize", { size: formatFileSize(MAX_UPLOAD_BYTES) })}
        </p>
      </div>
      <Button
        aria-describedby={state.status === "error" ? errorId : undefined}
        onClick={picker.open}
        type="button"
        variant="outline"
      >
        {audio ? t("chooseAudio") : t("choose")}
      </Button>
      {state.status === "error" && (
        <p className="text-caption text-destructive" id={errorId} role="alert">
          {t(state.reason === "tooLarge" ? "tooLarge" : "failed", {
            name: state.fileName,
            size: formatFileSize(MAX_UPLOAD_BYTES),
          })}
        </p>
      )}
    </div>
  );
}
