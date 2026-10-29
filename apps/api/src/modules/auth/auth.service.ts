import { createHmac, timingSafeEqual } from "node:crypto";
import { AuthNotConfiguredError, InvalidCredentialsError } from "./auth.errors";

// Framework-free (docs/rules/BACKEND.md hard rule 1). No table backs auth:
// the one dummy user's credentials are the AUTH_EMAIL / AUTH_PASSWORD env
// vars and a session is a stateless HMAC token in an httpOnly cookie —
// `user.me` keeps resolving the seeded database user after login.

const SESSION_PAYLOAD = "reclit-session-v1";

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

  private token(): string | null {
    const secret = this.secret();
    if (!secret) return null;
    return createHmac("sha256", secret).update(SESSION_PAYLOAD).digest("hex");
  }

  /** Checks the posted credentials and returns the session cookie value. */
  async login(email: string, password: string): Promise<string> {
    const credentials = this.credentials();
    const token = this.token();
    if (!credentials || !token) {
      // In dev mode a login succeeds even without configured credentials —
      // the session is redundant there, but the screen should not dead-end.
      if (this.devMode() && token) return token;
      throw new AuthNotConfiguredError();
    }
    if (
      !safeEqual(email, credentials.email) ||
      !safeEqual(password, credentials.password)
    ) {
      throw new InvalidCredentialsError();
    }
    return token;
  }

  /** True when the cookie value is the current signed session token. */
  verify(token: string | undefined): boolean {
    if (!token) return false;
    const expected = this.token();
    return expected !== null && safeEqual(token, expected);
  }
}

export const authService = new AuthService();
