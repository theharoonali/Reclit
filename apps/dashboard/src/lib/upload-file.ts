import { postFile, sendJson } from "@/lib/api-fetch";

/**
 * The API's file endpoints, in the contract's shapes
 * (see `apps/api/src/__tests__/file.api.test.ts`). Shared by the grid's upload
 * editor and the public form.
 */
export type UploadedFile = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

/** The contract's upload cap — refused here before the bytes are sent. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** `POST /files` — the permanent public URL plus the sanitized name, type, size. */
export const uploadFile = (file: File) =>
  postFile<UploadedFile>("/files", file);

/** `DELETE /files` — removes one upload by the URL `uploadFile` returned. */
export const deleteFile = (url: string) =>
  sendJson<{ url: string; removed: boolean }>("DELETE", "/files", { url });
