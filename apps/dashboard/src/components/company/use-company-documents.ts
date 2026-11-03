"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  type CompanyDocument,
  type CompanyErrorKey,
  companyErrorKey,
} from "@/lib/company/api";
import {
  type DocumentRowStatus,
  documentMimeType,
  documentPickError,
} from "@/lib/company/documents";
import { trpcCodeOf } from "@/lib/onboarding/api";
import { deleteFile, uploadFile } from "@/lib/upload-file";
import { useTRPC } from "@/trpc/client";

/** One row of the document list: a stored document, or an upload still on its way. */
export type CompanyDocumentRow = {
  id: string;
  name: string;
  size: number;
  status: DocumentRowStatus;
  error: string | null;
};

type Upload = { id: string; name: string; size: number };

/**
 * The company's documents plus the uploads in flight, and the calls that
 * change them. `documents` is `company.documents` from `useCompany`.
 *
 * | Call | Does |
 * | --- | --- |
 * | `add(file)` | `uploadFile(file)` (`POST /files`), then `company.addDocument { url, name, mimeType: documentMimeType(file), size }`, then refetches `company.me`; a refused document's upload is deleted again |
 * | `remove(id)` | `company.removeDocument { id }`, then refetches `company.me` |
 *
 * A pick is refused before upload by `documentPickError` (type, 15 MB, 10
 * documents counting the uploads in flight).
 */
export function useCompanyDocuments(documents: CompanyDocument[]) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [errorKey, setErrorKey] = useState<CompanyErrorKey | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Several files arrive in one tick: count them before state catches up.
  const inFlight = useRef(0);
  const stored = useLatestRef(documents.length);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refetchCompany = () =>
    queryClient.invalidateQueries({ queryKey: trpc.company.me.queryKey() });
  const { mutateAsync: addDocument } = useMutation(
    trpc.company.addDocument.mutationOptions({ onSuccess: refetchCompany }),
  );
  const { mutateAsync: removeDocument } = useMutation(
    trpc.company.removeDocument.mutationOptions({ onSuccess: refetchCompany }),
  );

  const add = useCallback(
    async (file: File) => {
      const refused = documentPickError(
        file,
        stored.current + inFlight.current,
      );
      const mimeType = documentMimeType(file);
      if (refused || !mimeType) {
        setErrorKey(refused ?? "documentType");
        return;
      }
      const upload = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
      };
      inFlight.current += 1;
      setErrorKey(null);
      setUploads((current) => [...current, upload]);
      try {
        let uploaded: Awaited<ReturnType<typeof uploadFile>>;
        try {
          uploaded = await uploadFile(file);
        } catch {
          setErrorKey("uploadFailed");
          return;
        }
        try {
          await addDocument({
            url: uploaded.url,
            name: uploaded.name,
            mimeType,
            size: uploaded.size,
          });
        } catch (error) {
          // Refused: the stored file belongs to nothing now. Best effort.
          void deleteFile(uploaded.url).catch(() => {});
          setErrorKey(companyErrorKey("addDocument", trpcCodeOf(error)));
        }
      } finally {
        inFlight.current -= 1;
        setUploads((current) => current.filter((u) => u.id !== upload.id));
      }
    },
    [stored, addDocument],
  );

  const remove = async (id: string) => {
    setRemovingId(id);
    setErrorKey(null);
    try {
      await removeDocument({ id });
    } catch (error) {
      setErrorKey(companyErrorKey("removeDocument", trpcCodeOf(error)));
      // It may be gone already: show the list as it is now.
      void refetchCompany();
    } finally {
      setRemovingId(null);
    }
  };

  const items: CompanyDocumentRow[] = [
    ...documents.map(({ id, name, size, status, error }) => ({
      id,
      name,
      size,
      status,
      error,
    })),
    ...uploads.map((upload) => ({
      ...upload,
      status: "UPLOADING" as const,
      error: null,
    })),
  ];

  return {
    items,
    add: (file: File) => void add(file),
    remove: (id: string) => void remove(id),
    removingId,
    isUploading: uploads.length > 0,
    errorKey,
    dismissError: () => setErrorKey(null),
  };
}

export type CompanyDocumentsApi = ReturnType<typeof useCompanyDocuments>;
