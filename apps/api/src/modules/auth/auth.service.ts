import { createHmac, timingSafeEqual } from "node:crypto";
import { AuthNotConfiguredError, InvalidCredentialsError } from "./auth.errors";

// Framework-free (docs/rules/BACKEND.md hard rule 1). No table backs auth:
// the one dummy user's credentials are the AUTH_EMAIL / AUTH_PASSWORD env
// vars and a session is a stateless signed token — `user.me` keeps resolving
// the seeded database user after login.
//
// A token is `v1.<expiresAtMs>.<hmac>`: the HMAC (AUTH_SECRET, else the
// credential pair) covers the version and the expiry, so it cannot be
// extended or forged, and changing the secret or the password revokes every
// token at once. The client sends it as `Authorization: Bearer <token>` (or
// `connectionParams.token` on a subscription); the same value also rides the
// httpOnly cookie for same-site callers.

const TOKEN_VERSION = "v1";

/** How long a session token (and its cookie) stays valid. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type IssuedSession = { token: string; expiresAt: Date };

/** Constant-time string compare (length leaks, contents do not). */
const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export class AuthService {
  /** DEV=TRUE (any casing) authenticates every request with no credentials. */
  devMode(): boolean {
    return process.env.DEV?.toLowerCase() === "true";
  }

  private credentials(): { email: string; password: string } | null {
    const email = process.env.AUTH_EMAIL;
    const password = process.env.AUTH_PASSWORD;
    if (!email || !password) return null;
    return { email, password };
  }

  /** HMAC key for session tokens: AUTH_SECRET, else the credentials pair. */
  private secret(): string | null {
    if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
    const credentials = this.credentials();
    if (credentials) return `${credentials.email}\n${credentials.password}`;
    return this.devMode() ? "dev" : null;
  }

  private sign(secret: string, body: string): string {
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  /** A new token valid for `SESSION_TTL_MS` from `now`; null without a secret. */
  private issue(now: number): IssuedSession | null {
    const secret = this.secret();
    if (!secret) return null;
    const expiresAt = now + SESSION_TTL_MS;
    const body = `${TOKEN_VERSION}.${expiresAt}`;
    return {
      token: `${body}.${this.sign(secret, body)}`,
      expiresAt: new Date(expiresAt),
    };
  }

  /** Checks the posted credentials and returns a fresh session token. */
  async login(
    email: string,
    password: string,
    now = Date.now(),
  ): Promise<IssuedSession> {
    const credentials = this.credentials();
    const session = this.issue(now);
    if (!credentials || !session) {
      // In dev mode a login succeeds even without configured credentials —
      // the session is redundant there, but the screen should not dead-end.
      if (this.devMode() && session) return session;
      throw new AuthNotConfiguredError();
    }
    if (
      !safeEqual(email, credentials.email) ||
      !safeEqual(password, credentials.password)
    ) {
      throw new InvalidCredentialsError();
    }
    return session;
  }

  /** True when `token` was signed with the current secret and has not expired. */
  verify(token: string | undefined, now = Date.now()): boolean {
    if (!token) return false;
    const secret = this.secret();
    if (!secret) return false;
    const [version, expiresAt, signature, ...extra] = token.split(".");
    if (version !== TOKEN_VERSION || !expiresAt || !signature || extra.length) {
      return false;
    }
    const expires = Number(expiresAt);
    if (!Number.isSafeInteger(expires) || expires <= now) return false;
    return safeEqual(
      signature,
      this.sign(secret, `${TOKEN_VERSION}.${expiresAt}`),
    );
  }
}

export const authService = new AuthService();
