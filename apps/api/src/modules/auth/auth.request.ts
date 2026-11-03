// Framework-free (docs/rules/BACKEND.md hard rule 1). Where a request's
// session token is read from — shared by the tRPC context (trpc/init.ts) and
// the REST guard (common/auth.guard.ts), so both accept exactly the same
// requests.

export const SESSION_COOKIE = "reclit_session";

/** Reads one cookie out of a raw `Cookie` header (no cookie-parser dep). */
function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** The token of an `Authorization: Bearer <token>` header. */
function readBearer(header: string | undefined): string | undefined {
  return header?.match(/^Bearer\s+(\S+)$/i)?.[1];
}

/**
 * The session token, from the first place that has one: the Authorization
 * header (queries, mutations, REST — any origin), `connectionParamsToken`
 * (tRPC subscriptions: a browser EventSource cannot send headers), then the
 * cookie (same-site callers, local dev).
 */
export function requestToken(
  headers: { authorization?: string; cookie?: string },
  connectionParamsToken?: string,
): string | undefined {
  return (
    readBearer(headers.authorization) ??
    connectionParamsToken ??
    readCookie(headers.cookie, SESSION_COOKIE)
  );
}
