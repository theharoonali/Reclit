/**
 * Uploads one file through the API's `POST /files` (REST — multipart does not
 * belong on the tRPC link) and returns the contract's response shape: the
 * permanent public URL in the `reclit` bucket, plus the sanitized name, mime
 * type, and size (see `apps/api/src/__tests__/file.api.test.ts`).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

export type UploadedFile = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(`${API_BASE_URL}/files`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}`);
  }
  return (await res.json()) as UploadedFile;
}
