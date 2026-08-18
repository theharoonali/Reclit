import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

export type Session = {
  user: {
    id: string;
    email?: string;
    full_name?: string;
  };
  teamId?: string;
};

type SupabaseJWTPayload = JWTPayload & {
  user_metadata?: {
    email?: string;
    full_name?: string;
    [key: string]: string | undefined;
  };
};

// Primary: verify via JWKS (asymmetric ES256/RS256). jose caches the
// keyset in memory so only the first call hits the network.
// Lazily initialized so the app can boot without SUPABASE_URL set
// (public endpoints still work; token verification just returns null).
let jwks: ReturnType<typeof createRemoteJWKSet> | null | undefined;

function getJWKS() {
  if (jwks === undefined) {
    jwks = process.env.SUPABASE_URL
      ? createRemoteJWKSet(
          new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
        )
      : null;
  }
  return jwks;
}

// Fallback: HS256 shared secret for tokens issued before key rotation.
// Remove this once the legacy JWT secret is revoked in Supabase.
const HS256_SECRET = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null;

function extractSession(payload: JWTPayload): Session {
  const p = payload as SupabaseJWTPayload;
  return {
    user: {
      id: p.sub!,
      email: p.user_metadata?.email,
      full_name: p.user_metadata?.full_name,
    },
  };
}

export async function verifyAccessToken(
  accessToken?: string,
): Promise<Session | null> {
  if (!accessToken) return null;

  const JWKS = getJWKS();

  if (JWKS) {
    try {
      const { payload } = await jwtVerify(accessToken, JWKS);
      return extractSession(payload);
    } catch {
      // JWKS verification failed -- try HS256 fallback if configured.
    }
  }

  if (HS256_SECRET) {
    try {
      const { payload } = await jwtVerify(accessToken, HS256_SECRET);
      return extractSession(payload);
    } catch {
      // Both methods failed.
    }
  }

  return null;
}
