import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

export const createClient = () => {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
};
