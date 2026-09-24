"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { Upload } from "lucide-react";
import { type DragEvent, useState } from "react";
import { useFilePicker } from "@/hooks/use-file-picker";

type FileDropZoneProps = {
  onPick: (file: File) => void;
  /** The drop instruction, e.g. "Drag a file here, or choose one". */
  title: string;
  /** A muted line under the title, e.g. the size limit. */
  hint: string;
  chooseLabel: string;
  accept?: string;
  inputId?: string;
  /** Shown under the button as an alert; also turns the border destructive. */
  error?: string | null;
  errorId?: string;
  disabled?: boolean;
};

/**
 * A dashed drop target with a "choose" button: the one file-picking surface
 * (public form file fields, onboarding). Drag-and-drop is an extra; the button
 * is the keyboard path.
 */
export function FileDropZone({
  onPick,
  title,
  hint,
  chooseLabel,
  accept,
  inputId,
  error,
  errorId,
  disabled = false,
}: FileDropZoneProps) {
  const picker = useFilePicker(onPick);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onPick(file);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-sm border border-dashed border-input p-6 text-center transition-colors",
        dragging && "border-primary bg-accent",
        error && "border-destructive",
      )}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDrop={handleDrop}
    >
      <input accept={accept} id={inputId} {...picker.inputProps} />
      <span className="flex size-control-lg items-center justify-center rounded-full bg-primary/10 text-primary">
        <Upload className="size-icon" />
      </span>
      <div className="space-y-1">
        <p className="text-body">{title}</p>
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>
      <Button
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        onClick={picker.open}
        type="button"
        variant="outline"
      >
        {chooseLabel}
      </Button>
      {error && (
        <p className="text-caption text-destructive" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
