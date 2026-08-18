import { createClient } from "@repo/supabase/client";

/**
 * Reads the Supabase access token for attaching to API requests.
 *
 * Guarded by a short timeout: if Supabase auth is unreachable or
 * misconfigured, we proceed unauthenticated instead of hanging every
 * tRPC request behind a stuck getSession() call.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();

    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2000);
    });

    const session = supabase.auth
      .getSession()
      .then(({ data }) => data.session?.access_token ?? null)
      .catch(() => null);

    return await Promise.race([session, timeout]);
  } catch {
    return null;
  }
}
