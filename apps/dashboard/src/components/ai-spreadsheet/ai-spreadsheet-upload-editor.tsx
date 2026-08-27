"use client";

import { Button } from "@reclit/ui/button";
import { useRef, useState } from "react";
import { fileLabel, isResourceUrl } from "@/lib/ai-spreadsheet/cell-format";
import type { CellValue } from "@/lib/ai-spreadsheet/types";
import { uploadFile } from "@/lib/ai-spreadsheet/upload-file";

type AiSpreadsheetUploadEditorProps = {
  value: CellValue;
  /** MIME filter for the picker, e.g. "audio/*"; undefined accepts anything. */
  accept?: string;
  labels: {
    upload: string;
    replace: string;
    uploading: string;
    error: string;
    clear: string;
    empty: string;
  };
  onChange: (value: string | null) => void;
};

/**
 * The upload panel behind a file or audio cell. Mount it with a `key` tied to the
 * cell, like the JSON and date editors; the same re-seed dance keeps it honest
 * when the cell changes underneath the animating panel.
 *
 * The file goes through the API's `POST /files` into the public bucket, and
 * the cell then stores the returned URL — playback (`use-sheet-audio`) just
 * sets `audio.src` to it, so nothing else changes.
 */
export function AiSpreadsheetUploadEditor(
  props: AiSpreadsheetUploadEditorProps,
) {
  const { labels } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [seed, setSeed] = useState(props.value);
  const [current, setCurrent] = useState(props.value);

  if (seed !== props.value) {
    setSeed(props.value);
    setCurrent(props.value);
    setStatus("idle");
  }

  const url = isResourceUrl(current) ? current : null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus("uploading");
    try {
      const uploaded = await uploadFile(file);
      setCurrent(uploaded.url);
      setSeed(uploaded.url);
      setStatus("idle");
      props.onChange(uploaded.url);
    } catch {
      setStatus("error");
    }
  };

  const handleClear = () => {
    setCurrent(null);
    setSeed(null);
    props.onChange(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="truncate text-body text-muted-foreground">
        {url ? fileLabel(url) : labels.empty}
      </p>

      <input
        accept={props.accept}
        className="sr-only"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />

      <Button
        disabled={status === "uploading"}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {status === "uploading"
          ? labels.uploading
          : url
            ? labels.replace
            : labels.upload}
      </Button>

      {status === "error" && (
        <p className="text-body text-destructive" role="alert">
          {labels.error}
        </p>
      )}

      {url && (
        <Button onClick={handleClear} type="button" variant="ghost">
          {labels.clear}
        </Button>
      )}
    </div>
  );
}
