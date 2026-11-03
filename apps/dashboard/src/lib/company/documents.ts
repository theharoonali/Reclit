import type { CompanyDocumentStatus, CompanyErrorKey } from "./api";

/** The plan's per-document cap — the api refuses more with `COMPANY_DOCUMENT_TOO_LARGE`. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** The plan's per-company cap — the api refuses more with `COMPANY_DOCUMENT_LIMIT`. */
export const MAX_DOCUMENTS = 10;

/** Extension → the media type `company.addDocument` accepts. */
const TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
};

export const DOCUMENT_TYPES: readonly string[] = [
  ...new Set(Object.values(TYPES_BY_EXTENSION)),
];

/** The file input's `accept`: the types and the extensions (a browser may not know `.md`). */
export const DOCUMENT_ACCEPT = [
  ...DOCUMENT_TYPES,
  ...Object.keys(TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
].join(",");

/**
 * The media type to send for `file`. The extension wins: browsers report a
 * `.md` as `""` and a `.csv` as `application/vnd.ms-excel` on Windows. An
 * unknown extension falls back on the browser's type when it is accepted;
 * otherwise `null`.
 */
export function documentMimeType(file: { name: string; type: string }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = TYPES_BY_EXTENSION[extension];
  if (byExtension && file.name.includes(".")) return byExtension;
  return DOCUMENT_TYPES.includes(file.type) ? file.type : null;
}

/**
 * Refuses a pick before any byte is sent: the type, the size, and the count
 * (`count` = documents already listed, uploads in flight included).
 */
export function documentPickError(
  file: { name: string; type: string; size: number },
  count: number,
): CompanyErrorKey | null {
  if (count >= MAX_DOCUMENTS) return "documentLimit";
  if (documentMimeType(file) === null) return "documentType";
  if (file.size > MAX_DOCUMENT_BYTES) return "documentTooLarge";
  return null;
}

/** A listed document's state: the api's, or `UPLOADING` while `POST /files` runs. */
export type DocumentRowStatus = CompanyDocumentStatus | "UPLOADING";

export type DocumentStatusKey = "uploading" | "processing" | "ready" | "failed";

/** A status → its `company.documents.status.*` key; `PENDING` reads as processing. */
export function documentStatusKey(
  status: DocumentRowStatus,
): DocumentStatusKey {
  switch (status) {
    case "UPLOADING":
      return "uploading";
    case "READY":
      return "ready";
    case "FAILED":
      return "failed";
    default:
      return "processing";
  }
}

/** True while the document is not settled — uploading, waiting or being read. */
export const isDocumentBusy = (status: DocumentRowStatus) =>
  status === "UPLOADING" || status === "PENDING" || status === "PROCESSING";
