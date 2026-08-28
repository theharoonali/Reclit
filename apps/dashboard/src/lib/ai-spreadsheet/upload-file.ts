import { postFile } from "@/lib/api-fetch";

/**
 * Uploads one file through the API's `POST /files` and returns the contract's
 * response shape: the permanent public URL in the `reclit` bucket, plus the
 * sanitized name, mime type, and size
 * (see `apps/api/src/__tests__/file.api.test.ts`).
 */
export type UploadedFile = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export const uploadFile = (file: File) =>
  postFile<UploadedFile>("/files", file);
