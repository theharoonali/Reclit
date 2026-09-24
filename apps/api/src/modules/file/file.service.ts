import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FileDeleteFailedError,
  FileStorageNotConfiguredError,
  FileUploadFailedError,
  FileUrlNotDeletableError,
} from "./file.errors";
import type { DeletedFile, UploadedFile } from "./file.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). Pass-through to Supabase
// Storage; the client is created lazily so a checkout without SUPABASE_* env
// vars still boots and tests.

const BUCKET = "reclit";

/** Keeps the original filename readable as the URL's last path segment. */
function sanitizeName(name: string): string {
  const trimmed = name.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-");
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "file";
}

/** What `upload` writes: `uploads/<uuid>/<sanitized name>` — one object, never a folder. */
const UPLOAD_PATH_RE = /^uploads\/[0-9a-f-]{36}\/[\w.-]+$/i;

/**
 * The bucket path behind a public URL, or null when the URL is not one of
 * this API's uploads. Anchoring on the bucket's own base and the exact upload
 * shape keeps a delete from reaching another host, another folder or `..`.
 */
export function uploadPathFromUrl(
  url: string,
  publicBase: string,
): string | null {
  const base = publicBase.endsWith("/") ? publicBase : `${publicBase}/`;
  if (!url.startsWith(base)) return null;
  const path = url.slice(base.length);
  return UPLOAD_PATH_RE.test(path) ? path : null;
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new FileStorageNotConfiguredError();
  client ??= createClient(url, key);
  return client;
}

export class FileService {
  /** Uploads into the public bucket and returns its permanent public URL. */
  async upload(
    buffer: Uint8Array,
    name: string,
    mimeType: string,
  ): Promise<UploadedFile> {
    const storage = getClient().storage.from(BUCKET);
    const safeName = sanitizeName(name);
    const path = `uploads/${crypto.randomUUID()}/${safeName}`;
    const { error } = await storage.upload(path, buffer, {
      contentType: mimeType,
    });
    if (error) throw new FileUploadFailedError(BUCKET, error.message);
    const { data } = storage.getPublicUrl(path);
    return {
      url: data.publicUrl,
      name: safeName,
      mimeType,
      size: buffer.byteLength,
    };
  }

  /**
   * Deletes one upload by its public URL. Idempotent: storage answers an
   * empty list, not an error, for a path that holds nothing (or that the key
   * may not delete), which is reported as `removed: false`.
   */
  async remove(url: string): Promise<DeletedFile> {
    const storage = getClient().storage.from(BUCKET);
    const path = uploadPathFromUrl(
      url,
      storage.getPublicUrl("").data.publicUrl,
    );
    if (path === null) throw new FileUrlNotDeletableError(url);
    const { data, error } = await storage.remove([path]);
    if (error) throw new FileDeleteFailedError(BUCKET, error.message);
    return { url, removed: data.length > 0 };
  }
}

export const fileService = new FileService();
