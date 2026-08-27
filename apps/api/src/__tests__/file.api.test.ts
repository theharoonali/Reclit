/**
 * CONTRACT — file
 * Feature doc: docs/features/file.md · Rules: docs/rules/TESTING.md
 *
 * No table. Stateless pass-through to Supabase Storage (public bucket
 * "reclit"); the returned public URL is the only record the upload exists.
 *
 * MODEL  UploadedFile = { url: string; name: string; mimeType: string;
 *                         size: number }
 * `url` is the permanent public URL; `name` is the sanitized original
 * filename, which is also the URL's last path segment.
 *
 * REST (no tRPC procedure — multipart does not belong on the tRPC link)
 * | POST /files  multipart form, field "file", <= 25 MB | 201 | UploadedFile |
 * Errors: 400 no "file" field · 502 FILE_UPLOAD_FAILED (storage rejected the
 * write) · 503 FILE_STORAGE_NOT_CONFIGURED (SUPABASE_URL / SUPABASE_KEY unset).
 *
 * NOTES
 * - Uploads land at uploads/<uuid>/<sanitized-name> in the bucket.
 * - Nothing tracks or deletes uploads; there is no DELETE.
 * - The publishable (anon) key must be allowed to insert into the bucket; if
 *   its RLS rejects anon inserts, put the service-role key in SUPABASE_KEY.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createApp } from "../bootstrap";

const storageConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_KEY,
);

let app: Awaited<ReturnType<typeof createApp>>;
let baseUrl: string;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected the test server to bind a TCP port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

describe.skipIf(!storageConfigured)("POST /files", () => {
  it("uploads a file and returns its public bucket URL", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["contract-test audio bytes"], { type: "audio/mpeg" }),
      "contract test.mp3",
    );
    const res = await fetch(`${baseUrl}/files`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      url: string;
      name: string;
      mimeType: string;
      size: number;
    };
    expect(body.url).toContain("/storage/v1/object/public/reclit/uploads/");
    expect(body.url.endsWith("/contract-test.mp3")).toBe(true);
    expect(body.name).toBe("contract-test.mp3");
    expect(body.mimeType).toBe("audio/mpeg");
    expect(body.size).toBeGreaterThan(0);
  });

  it("rejects a request without a file field", async () => {
    const res = await fetch(`${baseUrl}/files`, {
      method: "POST",
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(storageConfigured)(
  "file contract (storage not configured)",
  () => {
    it("is skipped without SUPABASE_URL / SUPABASE_KEY", () => {
      expect(storageConfigured).toBe(false);
    });
  },
);
