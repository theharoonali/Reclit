"use client";

import type { Dispatch, SetStateAction } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  emptyDraft,
  type FormDraft,
  type UploadState,
} from "@/lib/public-form";
import { deleteFile, MAX_UPLOAD_BYTES, uploadFile } from "@/lib/upload-file";

/**
 * The form's file fields: a picked file uploads at once, and removing it —
 * or picking another — deletes the upload from storage. Deletes are
 * best-effort: a failed one leaves an orphan, never a broken form.
 *
 * Only a *draft's* upload is ever deleted. The form clears its draft the
 * moment a submission succeeds, so a file a saved row points at is out of
 * reach of `remove`.
 */
export function usePublicFormUploads(
  draft: FormDraft,
  setDraft: Dispatch<SetStateAction<FormDraft>>,
) {
  // `pick` awaits the upload; the draft it closed over is stale by then.
  const draftRef = useLatestRef(draft);

  const setUpload = (columnIndex: number, upload: UploadState) =>
    setDraft((current) => ({
      ...current,
      [columnIndex]: { ...(current[columnIndex] ?? emptyDraft()), upload },
    }));

  const release = (columnIndex: number) => {
    const upload = draftRef.current[columnIndex]?.upload;
    if (upload?.status === "uploaded") {
      void deleteFile(upload.file.url).catch(() => {});
    }
  };

  const remove = (columnIndex: number) => {
    release(columnIndex);
    setUpload(columnIndex, { status: "idle" });
  };

  const pick = async (columnIndex: number, file: File) => {
    // The picked file replaces whatever the field held.
    release(columnIndex);
    if (file.size > MAX_UPLOAD_BYTES) {
      setUpload(columnIndex, {
        status: "error",
        fileName: file.name,
        reason: "tooLarge",
      });
      return;
    }
    setUpload(columnIndex, { status: "uploading", fileName: file.name });
    try {
      const uploaded = await uploadFile(file);
      setUpload(columnIndex, { status: "uploaded", file: uploaded });
    } catch {
      setUpload(columnIndex, {
        status: "error",
        fileName: file.name,
        reason: "upload",
      });
    }
  };

  return { pick, remove };
}
