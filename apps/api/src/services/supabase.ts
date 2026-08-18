import type { Database } from "@repo/supabase/types";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Fall back to local-dev placeholders so the API can boot (and public
// endpoints work) before Supabase is configured. Any actual Supabase
// call will fail until SUPABASE_URL / SUPABASE_SECRET_KEY are set.
const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "placeholder";

export async function createClient(accessToken?: string) {
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    accessToken() {
      return Promise.resolve(accessToken || "");
    },
  });
}

export async function createAdminClient() {
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY);
}
