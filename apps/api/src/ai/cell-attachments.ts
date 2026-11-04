import { describeError } from "../common/errors";
import type { RunAiInputCell } from "../modules/run-ai/run-ai.schema";

// The files a row points at — file cells hold URLs — are fetched and handed
// to the model as file parts, not described as text. Fetching is done here
// rather than left to the SDK so the size cap, the timeout and the media type
// are ours, and a link that cannot be fetched degrades to a note in the
// prompt instead of failing the run.
//
// Most files do not travel as bytes any more: a file, audio or YouTube cell
// is converted to markdown first (cell-markdown.ts) and a website is crawled
// (cell-crawls.ts). What is still attached is decided there — an image (the
// model reads the picture; its markdown is only metadata) and any file whose
// conversion failed. `fetchFile`, `isUrlCell`, `filenameOf` and
// `mediaTypeFor` are shared with those paths.

/** The provider's inline-data ceiling is 20 MB per request; keep one file under it. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const ATTACHMENT_TIMEOUT_MS = 30_000;

/** Column types whose value is a URL the model should be given as a file. */
const ATTACHABLE_TYPES = new Set(["file"]);
const HTTP_URL_RE = /^https?:\/\/\S+$/i;

export type Attachment = {
  columnId: string;
  filename: string;
  mediaType: string;
  data: Uint8Array;
};

export type AttachmentFailure = {
  columnId: string;
  url: string;
  error: string;
};

export type Attachments = {
  files: Attachment[];
  failures: AttachmentFailure[];
};

/** What a completed run records about its attachments — never the bytes. */
export type AttachmentSummary =
  | { columnId: string; filename: string; mediaType: string; bytes: number }
  | AttachmentFailure;

/**
 * A cell of one of `types` holding an http(s) URL — the shape both the
 * attachment path and the transcription path start from.
 */
export function isUrlCell(
  cell: RunAiInputCell,
  types: ReadonlySet<string>,
): cell is RunAiInputCell & { value: string } {
  return (
    types.has(cell.type) &&
    typeof cell.value === "string" &&
    HTTP_URL_RE.test(cell.value)
  );
}

export function isAttachableCell(
  cell: RunAiInputCell,
): cell is RunAiInputCell & { value: string } {
  return isUrlCell(cell, ATTACHABLE_TYPES);
}

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  aac: "audio/aac",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
};

/** The file name the model sees: the URL's last path segment, or the host. */
export function filenameOf(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : parsed.host;
  } catch {
    return url;
  }
}

/**
 * The media type to declare: the server's `content-type` (parameters
 * stripped) unless it is missing or the generic octet-stream, in which case
 * the URL's extension decides; an unknown extension falls back to the
 * generic type and the model is left to refuse it.
 */
export function mediaTypeFor(url: string, contentType: string | null): string {
  const declared = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = filenameOf(url).split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MEDIA_TYPES[extension] ?? "application/octet-stream";
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/**
 * One URL's bytes under `maxBytes` (the attachment cap unless a caller that
 * never sends the bytes to the model says otherwise) and the timeout, or why
 * not. Never throws. Shared by the cell attachments below, the markdown
 * conversion (cell-markdown.ts) and the company documents
 * (trigger/process-company-document.ts).
 */
export async function fetchFile(
  url: string,
  fetchImpl: FetchLike = fetch,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): Promise<
  { filename: string; mediaType: string; data: Uint8Array } | { error: string }
> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS),
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxBytes) return { error: `larger than ${maxBytes} bytes` };
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > maxBytes) {
      return { error: `larger than ${maxBytes} bytes` };
    }
    return {
      filename: filenameOf(url),
      mediaType: mediaTypeFor(url, response.headers.get("content-type")),
      data,
    };
  } catch (error) {
    return { error: describeError(error).message };
  }
}

/** One cell's file, or why it could not be fetched. Never throws. */
export async function fetchAttachment(
  cell: RunAiInputCell & { value: string },
  fetchImpl: FetchLike = fetch,
): Promise<Attachment | AttachmentFailure> {
  const file = await fetchFile(cell.value, fetchImpl);
  return "error" in file
    ? { columnId: cell.id, url: cell.value, error: file.error }
    : { columnId: cell.id, ...file };
}

/** Every attachable cell of the row, fetched in parallel, in row order. */
export function collectAttachments(
  cells: RunAiInputCell[],
  fetchImpl: FetchLike = fetch,
): Promise<Attachments> {
  return fetchAttachments(cells.filter(isAttachableCell), fetchImpl);
}

/**
 * These URL cells' files, whatever their column type, fetched in parallel,
 * in order — what the cell attaches after conversion picked them
 * (cell-output.ts: images, and files whose conversion failed).
 */
export async function fetchAttachments(
  cells: (RunAiInputCell & { value: string })[],
  fetchImpl: FetchLike = fetch,
): Promise<Attachments> {
  const results = await Promise.all(
    cells.map((cell) => fetchAttachment(cell, fetchImpl)),
  );
  const files: Attachment[] = [];
  const failures: AttachmentFailure[] = [];
  for (const result of results) {
    if ("data" in result) files.push(result);
    else failures.push(result);
  }
  return { files, failures };
}

export function summariseAttachments(
  attachments: Attachments,
): AttachmentSummary[] {
  return [
    ...attachments.files.map(({ columnId, filename, mediaType, data }) => ({
      columnId,
      filename,
      mediaType,
      bytes: data.byteLength,
    })),
    ...attachments.failures,
  ];
}
