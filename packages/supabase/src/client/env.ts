// Fall back to local-dev placeholders so apps can boot before Supabase
// is configured. Any actual Supabase call will fail until the real
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder";
