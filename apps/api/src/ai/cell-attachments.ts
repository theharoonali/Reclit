import { describeError } from "../common/errors";
import type { RunAiInputCell } from "../modules/run-ai/run-ai.schema";

// The media a row points at — file and website cells hold URLs — is fetched
// and handed to the model as file parts, not described as text. Fetching is
// done here rather than left to the SDK so the size cap, the timeout and the
// media type are ours, and a link that cannot be fetched degrades to a note in
// the prompt instead of failing the run.
//
// Audio cells are NOT here: they are transcribed first and reach the model as
// text (cell-transcripts.ts). `fetchAttachment`, `isUrlCell`, `filenameOf` and
// `mediaTypeFor` are shared with that path.

/** Gemini's inline-data ceiling is 20 MB per request; keep one file under it. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const ATTACHMENT_TIMEOUT_MS = 30_000;

/** Column types whose value is a URL the model should be given as a file. */
const ATTACHABLE_TYPES = new Set(["file", "url"]);
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

/** One cell's file, or why it could not be fetched. Never throws. */
export async function fetchAttachment(
  cell: RunAiInputCell & { value: string },
  fetchImpl: FetchLike = fetch,
): Promise<Attachment | AttachmentFailure> {
  const url = cell.value;
  const failure = (error: string): AttachmentFailure => ({
    columnId: cell.id,
    url,
    error,
  });
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS),
    });
    if (!response.ok) return failure(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_ATTACHMENT_BYTES) {
      return failure(`larger than ${MAX_ATTACHMENT_BYTES} bytes`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > MAX_ATTACHMENT_BYTES) {
      return failure(`larger than ${MAX_ATTACHMENT_BYTES} bytes`);
    }
    return {
      columnId: cell.id,
      filename: filenameOf(url),
      mediaType: mediaTypeFor(url, response.headers.get("content-type")),
      data,
    };
  } catch (error) {
    return failure(describeError(error).message);
  }
}

/** Every attachable cell of the row, fetched in parallel, in row order. */
export async function collectAttachments(
  cells: RunAiInputCell[],
  fetchImpl: FetchLike = fetch,
): Promise<Attachments> {
  const results = await Promise.all(
    cells
      .filter(isAttachableCell)
      .map((cell) => fetchAttachment(cell, fetchImpl)),
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
