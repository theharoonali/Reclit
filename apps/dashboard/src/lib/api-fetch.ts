/**
 * Calls to the API's REST surface. Multipart deliberately does not go over the
 * tRPC link (see `docs/features/file.md`), so the file endpoints are reached
 * with plain `fetch`.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

/**
 * A non-2xx response. `code` is the API's stable machine-readable code from
 * `common/domain-error.filter.ts`; it is `"UNKNOWN"` for the framework's own
 * errors, which carry no code. Callers map the code to a message — never the
 * server's English `message`, which is not translated.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new ApiError(
      res.status,
      body?.code ?? "UNKNOWN",
      body?.message ?? `Request failed with status ${res.status}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * POSTs one file as multipart field "file", plus any text `fields` beside it,
 * and returns the parsed JSON.
 */
export async function postFile<T>(
  path: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  form.append("file", file, file.name);
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: form,
  });
  return parseResponse<T>(res);
}

/** Sends a JSON body with any method and returns the parsed JSON. */
export async function sendJson<T>(
  method: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}
