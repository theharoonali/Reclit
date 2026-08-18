/**
 * Lightweight probe functions for external services.
 *
 * Each probe should be the cheapest possible verification:
 * - No side effects
 * - Minimal data transfer
 * - Fast timeout
 */

import { checkHealth as checkDbHealth } from "@repo/db/utils/health";
import type { Dependency } from "./registry";

// ---------------------------------------------------------------------------
// Tier 1 — Core infrastructure (app breaks without these)
// ---------------------------------------------------------------------------

/** Database: SELECT 1 via the existing @repo/db health utility */
export function databaseProbe(): Dependency {
  return {
    name: "database",
    tier: 1,
    cacheTtlMs: 30_000,
    timeoutMs: 3_000,
    probe: async () => {
      await checkDbHealth();
      return true;
    },
  };
}

/** All dependencies the API health endpoints should check */
export function apiDependencies(): Dependency[] {
  return [databaseProbe(), supabaseProbe()];
}

/** Supabase: GET auth health (requires apikey header) */
export function supabaseProbe(): Dependency {
  return {
    name: "supabase",
    tier: 1,
    cacheTtlMs: 30_000,
    timeoutMs: 3_000,
    probe: async () => {
      const url =
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) throw new Error("SUPABASE_URL not set");
      const apikey =
        process.env.SUPABASE_SECRET_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      const headers: Record<string, string> = {};
      if (apikey) {
        headers.apikey = apikey;
      }
      const res = await fetch(`${url}/auth/v1/health`, {
        headers,
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    },
  };
}
