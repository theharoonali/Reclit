import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const RESUME_FILE = join(process.cwd(), "src", "assets", "haroon.pdf");

/**
 * Streams the resume to the viewer.
 *
 * Two things here are deliberate and both exist to get past download-manager
 * browser extensions, which intercept the request before the page ever sees it
 * (observed: `204 Intercepted by the IDM Advanced Integration`):
 *
 * 1. **The URL carries no `.pdf` extension.** Extension matching is the primary
 *    trigger, and it applies to `fetch`/XHR too — not just navigations.
 * 2. **The content type is deliberately not `application/pdf`.** Those managers
 *    also match well-known document and `application/octet-stream` types. The
 *    real type is irrelevant here because the bytes are handed straight to
 *    pdf.js as an ArrayBuffer; the browser never interprets them.
 *
 * The file lives outside `public/` so this route is the only way to reach it.
 *
 * Replacing `src/assets/haroon.pdf` takes effect on the next request: the file
 * is read per request, and the ETag is derived from its size and mtime, so a
 * new file invalidates the browser's copy immediately. `no-cache` means
 * "revalidate every time", not "never cache" — an unchanged file still costs
 * only a 304 rather than 4 MB.
 */
export async function GET(request: Request) {
  const { size, mtimeMs } = await stat(RESUME_FILE);
  const etag = `W/"${size}-${mtimeMs}"`;

  const headers = {
    "Content-Type": "application/x-reclit-document",
    "Content-Disposition": "inline",
    "Cache-Control": "no-cache",
    ETag: etag,
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const file = await readFile(RESUME_FILE);
  return new Response(new Uint8Array(file), { headers });
}
