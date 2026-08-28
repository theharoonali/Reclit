import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FileStorageNotConfiguredError,
  FileUploadFailedError,
} from "./file.errors";
import type { UploadedFile } from "./file.schema";

// Framework-free pass-through to Supabase Storage. The client is created
// lazily so a checkout without SUPABASE_* env vars still boots and tests.

const BUCKET = "reclit";

/** Keeps the original filename readable as the URL's last path segment. */
function sanitizeName(name: string): string {
  const trimmed = name.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-");
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "file";
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
    const path = `uploads/${crypto.randomUUID()}/${sanitizeName(name)}`;
    const { error } = await storage.upload(path, buffer, {
      contentType: mimeType,
    });
    if (error) throw new FileUploadFailedError(BUCKET, error.message);
    const { data } = storage.getPublicUrl(path);
    return {
      url: data.publicUrl,
      name: sanitizeName(name),
      mimeType,
      size: buffer.byteLength,
    };
  }
}

export const fileService = new FileService();
