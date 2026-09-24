/**
 * CONTRACT — file
 * Feature doc: docs/features/file.md · Rules: docs/rules/TESTING.md
 *
 * No table. Stateless pass-through to Supabase Storage (public bucket
 * "reclit"); the returned public URL is the only record the upload exists.
 *
 * MODEL  UploadedFile = { url: string; name: string; mimeType: string;
 *                         size: number }
 *        DeletedFile  = { url: string; removed: boolean }
 * `url` is the permanent public URL; `name` is the sanitized original
 * filename, which is also the URL's last path segment.
 *
 * REST (no tRPC procedure — multipart does not belong on the tRPC link)
 * | POST   /files  multipart form, field "file", <= 25 MB | 201 | UploadedFile |
 * | DELETE /files  JSON body { url }                      | 200 | DeletedFile  |
 * Errors: 400 no "file" field · 400 VALIDATION_FAILED (`url` missing or not a
 * URL) · 400 FILE_URL_NOT_DELETABLE · 502 FILE_UPLOAD_FAILED /
 * FILE_DELETE_FAILED (storage rejected the call) · 503
 * FILE_STORAGE_NOT_CONFIGURED (SUPABASE_URL / SUPABASE_KEY unset).
 *
 * NOTES
 * - Uploads land at uploads/<uuid>/<sanitized-name> in the bucket.
 * - Nothing tracks uploads. DELETE takes the `url` an upload returned and
 *   removes that one object; any other URL — another host, another folder, a
 *   folder, a `..` path — is FILE_URL_NOT_DELETABLE.
 * - DELETE is idempotent: a URL that holds nothing answers 200 with
 *   `removed: false`. It does not check whether a cell still stores the URL.
 * - Without storage env DELETE answers 503 before it looks at the URL.
 * - The publishable (anon) key must be allowed to insert into — and delete
 *   from — the bucket; if its RLS rejects anon writes, put the service-role
 *   key in SUPABASE_KEY.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { uploadPathFromUrl } from "../modules/file/file.service";
import type { TestServer } from "./support/http";
import { jsonInit, startTestServer } from "./support/http";

const storageConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_KEY,
);

let server: TestServer;
let baseUrl = "";

beforeAll(async () => {
  server = await startTestServer();
  baseUrl = server.baseUrl;
});

afterAll(() => server.close());

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

describe.skipIf(!storageConfigured)("DELETE /files", () => {
  const remove = (body: unknown) =>
    fetch(`${baseUrl}/files`, jsonInit("DELETE", body));

  it("deletes an upload by its URL, then reports nothing left to remove", async () => {
    const form = new FormData();
    form.append("file", new Blob(["delete me"]), "delete-me.txt");
    const uploaded = (await (
      await fetch(`${baseUrl}/files`, { method: "POST", body: form })
    ).json()) as { url: string };

    const first = await remove({ url: uploaded.url });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ url: uploaded.url, removed: true });

    const second = await remove({ url: uploaded.url });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ url: uploaded.url, removed: false });
  });

  it("rejects a URL that is not one of its uploads", async () => {
    const res = await remove({ url: "https://elsewhere.test/uploads/a/b.txt" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      "FILE_URL_NOT_DELETABLE",
    );
  });

  it("rejects a missing or malformed url", async () => {
    for (const body of [{}, { url: "not a url" }]) {
      const res = await remove(body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe(
        "VALIDATION_FAILED",
      );
    }
  });
});

// The rule behind FILE_URL_NOT_DELETABLE, provable without storage env.
describe("uploadPathFromUrl", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/reclit/";
  const id = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

  it("answers the bucket path of an upload URL", () => {
    expect(uploadPathFromUrl(`${base}uploads/${id}/voice-note.mp3`, base)).toBe(
      `uploads/${id}/voice-note.mp3`,
    );
    // The base is accepted with or without its trailing slash.
    expect(
      uploadPathFromUrl(`${base}uploads/${id}/a.txt`, base.slice(0, -1)),
    ).toBe(`uploads/${id}/a.txt`);
  });

  it("refuses anything that is not exactly one upload object", () => {
    const refused = [
      `https://elsewhere.test/uploads/${id}/a.txt`,
      `${base}other/${id}/a.txt`,
      `${base}uploads/${id}/`,
      `${base}uploads/${id}`,
      `${base}uploads/${id}/nested/a.txt`,
      `${base}uploads/${id}/../../secret.txt`,
      `${base}uploads/not-a-uuid/a.txt`,
      `${base}uploads/${id}/a.txt?download=1`,
    ];
    for (const url of refused) expect(uploadPathFromUrl(url, base)).toBeNull();
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
