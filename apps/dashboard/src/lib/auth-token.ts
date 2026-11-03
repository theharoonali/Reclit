/**
 * The API session token (docs/features/auth.md): `auth.login` answers it, it
 * is kept in localStorage, and every call to the API sends it — as
 * `Authorization: Bearer <token>` on queries, mutations and REST calls, and as
 * `connectionParams.token` on subscriptions (an EventSource cannot send
 * headers). A bearer token works from any origin, unlike the cookie, which
 * the API only receives from the same site.
 *
 * Storage can be missing or throw (private windows, blocked site data); the
 * app then still works on the cookie alone where the browser sends it.
 */

const STORAGE_KEY = "reclit:auth-token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage unavailable: the cookie remains the session.
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/** The `Authorization` header for the current token, or none. */
export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
