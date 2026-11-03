/**
 * CONTRACT — auth
 * Feature doc: docs/features/auth.md · Rules: docs/rules/TESTING.md
 *
 * No table. The one dummy user's credentials are env vars (AUTH_EMAIL,
 * AUTH_PASSWORD); a session is a stateless HMAC token in the httpOnly cookie
 * `reclit_session` (signed with AUTH_SECRET, defaulting to the credential
 * pair). DEV=TRUE authenticates every request with no credentials.
 *
 * MODEL  Session = { authenticated: boolean; devMode: boolean }
 *
 * PROCEDURES
 * | Procedure    | Kind     | Payload                                  | Response     | Errors                                        |
 * | ------------ | -------- | ---------------------------------------- | ------------ | --------------------------------------------- |
 * | auth.session | query    | —                                        | Session      | —                                             |
 * | auth.login   | mutation | { email: email<=320; password: 1..200 }  | { ok: true } | BAD_REQUEST, UNAUTHORIZED, SERVICE_UNAVAILABLE |
 * | auth.logout  | mutation | —                                        | { ok: true } | —                                             |
 *
 * NOTES
 * - `login` compares against AUTH_EMAIL / AUTH_PASSWORD (constant-time) and
 *   sets the session cookie: UNAUTHORIZED (`INVALID_CREDENTIALS`) on a
 *   mismatch, SERVICE_UNAVAILABLE (`AUTH_NOT_CONFIGURED`) when the env vars
 *   are unset — except with DEV=TRUE, where login always succeeds.
 * - `logout` clears the cookie and never fails, signed in or not.
 * - `session.devMode` tells the dashboard the login screen can be skipped.
 * - Protected procedures (`user.*`) answer UNAUTHORIZED ("Login required")
 *   without a valid session cookie, unless DEV=TRUE.
 * - The cookie: httpOnly, SameSite=Lax, path=/, 7-day maxAge, Secure in
 *   production. A tampered or stale token simply reads as unauthenticated.
 * - These procedures touch no database; only the protected `user.*` surface
 *   does (see the user contract).
 */

import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import {
  createCallerFactory,
  createTRPCContext,
  SESSION_COOKIE,
  type TRPCContext,
} from "../trpc/init";
import { appRouter } from "../trpc/routers/_app";
import { expectTRPCError } from "./support/trpc";

const EMAIL = "contract-auth@example.com";
const PASSWORD = "contract-password";

// The suite stages DEV / AUTH_* itself (bun auto-loads .env, which may carry
// DEV=TRUE) and restores whatever the process started with.
const ENV_KEYS = ["DEV", "AUTH_EMAIL", "AUTH_PASSWORD", "AUTH_SECRET"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => setEnv({ AUTH_EMAIL: EMAIL, AUTH_PASSWORD: PASSWORD }));

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const callerFor = (ctx: TRPCContext) => createCallerFactory(appRouter)(ctx);

/** A context built the way bootstrap.ts builds it, with cookie capture. */
function makeContext(cookieHeader?: string) {
  const jar: Record<string, string | null> = {};
  const opts = {
    req: { headers: { cookie: cookieHeader } },
    res: {
      cookie: (name: string, value: string) => {
        jar[name] = value;
      },
      clearCookie: (name: string) => {
        jar[name] = null;
      },
    },
  } as unknown as CreateExpressContextOptions;
  return { ctx: createTRPCContext(opts), jar };
}

async function loginAndGetCookie(): Promise<string> {
  const { ctx, jar } = makeContext();
  const result = await callerFor(ctx).auth.login({
    email: EMAIL,
    password: PASSWORD,
  });
  expect(result).toEqual({ ok: true });
  const token = jar[SESSION_COOKIE];
  expect(typeof token).toBe("string");
  return token as string;
}

describe("auth.login", () => {
  it("accepts the env credentials and sets a session cookie that authenticates", async () => {
    const token = await loginAndGetCookie();
    const { ctx } = makeContext(`${SESSION_COOKIE}=${token}`);
    expect(ctx.authenticated).toBe(true);
  });

  it("rejects a wrong password with UNAUTHORIZED", async () => {
    const { ctx } = makeContext();
    await expectTRPCError(
      callerFor(ctx).auth.login({ email: EMAIL, password: "wrong" }),
      "UNAUTHORIZED",
    );
  });

  it("rejects a wrong email with UNAUTHORIZED", async () => {
    const { ctx } = makeContext();
    await expectTRPCError(
      callerFor(ctx).auth.login({
        email: "someone-else@example.com",
        password: PASSWORD,
      }),
      "UNAUTHORIZED",
    );
  });

  it("rejects an invalid email shape with BAD_REQUEST", async () => {
    const { ctx } = makeContext();
    await expectTRPCError(
      callerFor(ctx).auth.login({ email: "not-an-email", password: PASSWORD }),
      "BAD_REQUEST",
    );
  });

  it("rejects a blank password with BAD_REQUEST", async () => {
    const { ctx } = makeContext();
    await expectTRPCError(
      callerFor(ctx).auth.login({ email: EMAIL, password: "" }),
      "BAD_REQUEST",
    );
  });

  it("answers SERVICE_UNAVAILABLE when the env credentials are unset", async () => {
    setEnv({});
    const { ctx } = makeContext();
    await expectTRPCError(
      callerFor(ctx).auth.login({ email: EMAIL, password: PASSWORD }),
      "SERVICE_UNAVAILABLE",
    );
  });

  it("succeeds without configured credentials when DEV=TRUE", async () => {
    setEnv({ DEV: "TRUE" });
    const { ctx } = makeContext();
    const result = await callerFor(ctx).auth.login({
      email: EMAIL,
      password: "anything",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("auth.session", () => {
  it("is unauthenticated without a cookie", async () => {
    const { ctx } = makeContext();
    expect(await callerFor(ctx).auth.session()).toEqual({
      authenticated: false,
      devMode: false,
    });
  });

  it("is authenticated with the login cookie", async () => {
    const token = await loginAndGetCookie();
    const { ctx } = makeContext(`${SESSION_COOKIE}=${token}`);
    expect(await callerFor(ctx).auth.session()).toEqual({
      authenticated: true,
      devMode: false,
    });
  });

  it("ignores a tampered cookie", async () => {
    const token = await loginAndGetCookie();
    const tampered = `${token.slice(0, -1)}0`;
    const { ctx } = makeContext(`${SESSION_COOKIE}=${tampered}`);
    expect(ctx.authenticated).toBe(false);
  });

  it("is authenticated with DEV=TRUE and no cookie", async () => {
    setEnv({ DEV: "TRUE" });
    const { ctx } = makeContext();
    expect(await callerFor(ctx).auth.session()).toEqual({
      authenticated: true,
      devMode: true,
    });
  });

  it("DEV is case-insensitive", () => {
    setEnv({ DEV: "true", AUTH_EMAIL: EMAIL, AUTH_PASSWORD: PASSWORD });
    expect(makeContext().ctx.devMode).toBe(true);
  });
});

describe("auth.logout", () => {
  it("clears the session cookie", async () => {
    const token = await loginAndGetCookie();
    const { ctx, jar } = makeContext(`${SESSION_COOKIE}=${token}`);
    expect(await callerFor(ctx).auth.logout()).toEqual({ ok: true });
    expect(jar[SESSION_COOKIE]).toBe(null);
  });

  it("succeeds when not signed in", async () => {
    const { ctx } = makeContext();
    expect(await callerFor(ctx).auth.logout()).toEqual({ ok: true });
  });
});

describe("protected procedures", () => {
  // The middleware refuses before any service or database work, so these
  // need no database.
  it("user.me answers UNAUTHORIZED without a session", async () => {
    const { ctx } = makeContext();
    await expectTRPCError(callerFor(ctx).user.me(), "UNAUTHORIZED");
  });

  it("user.update answers UNAUTHORIZED without a session", async () => {
    const { ctx } = makeContext();
    await expectTRPCError(
      callerFor(ctx).user.update({ name: "Nope" }),
      "UNAUTHORIZED",
    );
  });
});
