/**
 * CONTRACT — auth
 * Feature doc: docs/features/auth.md · Rules: docs/rules/TESTING.md
 *
 * No table. The one dummy user's credentials are env vars (AUTH_EMAIL,
 * AUTH_PASSWORD); a session is a stateless signed token
 * `v1.<expiresAtMs>.<hmac>` (HMAC-SHA256 with AUTH_SECRET, defaulting to the
 * credential pair), valid for 7 days. DEV=TRUE authenticates every request
 * with no credentials.
 *
 * MODEL  Session = { authenticated: boolean; devMode: boolean }
 *        LoginResult = { ok: true; token: string; expiresAt: Date }
 *
 * PROCEDURES
 * | Procedure    | Kind     | Payload                                  | Response     | Errors                                        |
 * | ------------ | -------- | ---------------------------------------- | ------------ | --------------------------------------------- |
 * | auth.session | query    | —                                        | Session      | —                                             |
 * | auth.login   | mutation | { email: email<=320; password: 1..200 }  | LoginResult  | BAD_REQUEST, UNAUTHORIZED, SERVICE_UNAVAILABLE |
 * | auth.logout  | mutation | —                                        | { ok: true } | —                                             |
 *
 * NOTES
 * - `login` compares against AUTH_EMAIL / AUTH_PASSWORD (constant-time),
 *   answers a fresh token and also sets it as the session cookie:
 *   UNAUTHORIZED (`INVALID_CREDENTIALS`) on a mismatch, SERVICE_UNAVAILABLE
 *   (`AUTH_NOT_CONFIGURED`) when the env vars are unset — except with
 *   DEV=TRUE, where login always succeeds.
 * - A request is authenticated by the token from, in order: the header
 *   `Authorization: Bearer <token>` (queries, mutations, any origin), the
 *   subscription's `connectionParams.token` (an EventSource cannot send
 *   headers), then the `reclit_session` cookie (same-site callers). A token
 *   that is expired, tampered with, or signed with another secret (a changed
 *   AUTH_SECRET or password revokes every token) reads as unauthenticated.
 * - `logout` clears the cookie and never fails, signed in or not. Tokens are
 *   stateless: the client forgets its copy.
 * - `session.devMode` tells the dashboard the login screen can be skipped.
 * - Every procedure is protected — UNAUTHORIZED ("Login required") without
 *   a valid token, unless DEV=TRUE — except `auth.*` and the public form's
 *   `populate.form`, `populate.submit` and `runAi.onChange`.
 * - REST: `/spreadsheets/*`, `/onboarding/*`, `POST /assistant/transcribe`
 *   and `DELETE /files` take the same token and answer 401
 *   `{ code: "LOGIN_REQUIRED" }` without it. `POST /files` (public form
 *   attachments) and `/populate/*` stay public.
 * - The cookie: httpOnly, SameSite=Lax, path=/, 7-day maxAge, Secure in
 *   production.
 * - These procedures touch no database; only the protected `user.*` surface
 *   does (see the user contract).
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { authService, SESSION_TTL_MS } from "../modules/auth/auth.service";
import {
  createCallerFactory,
  createTRPCContext,
  SESSION_COOKIE,
  type TRPCContext,
} from "../trpc/init";
import { appRouter } from "../trpc/routers/_app";
import { startTestServer, type TestServer } from "./support/http";
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
function makeContext(
  cookieHeader?: string,
  extra: {
    authorization?: string;
    connectionParams?: Record<string, string>;
  } = {},
) {
  const jar: Record<string, string | null> = {};
  const opts = {
    req: {
      headers: { cookie: cookieHeader, authorization: extra.authorization },
    },
    info: { connectionParams: extra.connectionParams ?? null },
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
  expect(result.ok).toBe(true);
  const token = jar[SESSION_COOKIE];
  expect(token).toBe(result.token);
  return token as string;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

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
    expect(result.ok).toBe(true);
  });

  it("answers a token that expires in 7 days", async () => {
    const { ctx } = makeContext();
    const before = Date.now();
    const result = await callerFor(ctx).auth.login({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(result.token).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    const ttl = result.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(SESSION_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_MS + 1000);
  });

  it("answers a new token on every login", async () => {
    const first = await loginAndGetCookie();
    await Bun.sleep(2);
    expect(await loginAndGetCookie()).not.toBe(first);
  });
});

describe("bearer token", () => {
  it("authenticates with the Authorization header and no cookie", async () => {
    const token = await loginAndGetCookie();
    const { ctx } = makeContext(undefined, bearer(token));
    expect(await callerFor(ctx).auth.session()).toEqual({
      authenticated: true,
      devMode: false,
    });
  });

  it("accepts any casing of the Bearer scheme", async () => {
    const token = await loginAndGetCookie();
    const { ctx } = makeContext(undefined, {
      authorization: `bearer ${token}`,
    });
    expect(ctx.authenticated).toBe(true);
  });

  it("authenticates a subscription through connectionParams.token", async () => {
    const token = await loginAndGetCookie();
    const { ctx } = makeContext(undefined, { connectionParams: { token } });
    expect(ctx.authenticated).toBe(true);
  });

  it("prefers the header: a bad header is not rescued by a good cookie", async () => {
    const token = await loginAndGetCookie();
    const { ctx } = makeContext(
      `${SESSION_COOKIE}=${token}`,
      bearer("v1.1.deadbeef"),
    );
    expect(ctx.authenticated).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await loginAndGetCookie();
    expect(authService.verify(token)).toBe(true);
    expect(authService.verify(token, Date.now() + SESSION_TTL_MS + 1)).toBe(
      false,
    );
  });

  it("rejects a token whose expiry was pushed out", async () => {
    const [version, expiresAt, signature] = (await loginAndGetCookie()).split(
      ".",
    );
    const extended = `${version}.${Number(expiresAt) + SESSION_TTL_MS}.${signature}`;
    const { ctx } = makeContext(undefined, bearer(extended));
    expect(ctx.authenticated).toBe(false);
  });

  it("rejects every token once the secret changes", async () => {
    const token = await loginAndGetCookie();
    setEnv({
      AUTH_EMAIL: EMAIL,
      AUTH_PASSWORD: PASSWORD,
      AUTH_SECRET: "rotated",
    });
    expect(makeContext(undefined, bearer(token)).ctx.authenticated).toBe(false);
  });

  it("rejects malformed tokens", () => {
    for (const token of [
      "",
      "v1",
      "v1.123",
      "v2.9999999999999.abc",
      "a.b.c.d",
    ]) {
      expect(authService.verify(token)).toBe(false);
    }
  });

  it("protected procedures accept the bearer token", async () => {
    const token = await loginAndGetCookie();
    const { ctx } = makeContext(undefined, bearer(token));
    // Past the middleware: anything but UNAUTHORIZED means it let the call in.
    const outcome = await callerFor(ctx)
      .user.me()
      .then(
        () => "ok",
        (error: { code?: string }) => error.code,
      );
    expect(outcome).not.toBe("UNAUTHORIZED");
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

describe("REST guard", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(() => server.close());

  const deleteFile = (headers: Record<string, string> = {}) =>
    fetch(`${server.baseUrl}/files`, {
      method: "DELETE",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({}),
    });

  it("answers 401 LOGIN_REQUIRED without a token", async () => {
    const res = await deleteFile();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "LOGIN_REQUIRED" });
  });

  it("lets a bearer token through to the route", async () => {
    const token = await loginAndGetCookie();
    // Past the guard, the empty body fails the route's own validation.
    const res = await deleteFile({ authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });

  it("lets everything through with DEV=TRUE", async () => {
    setEnv({ DEV: "TRUE" });
    expect((await deleteFile()).status).toBe(400);
  });

  it("keeps the public form's upload route open", async () => {
    // No file: the route itself refuses (400), not the guard (401).
    const res = await fetch(`${server.baseUrl}/files`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("router protection", () => {
  it("refuses workspace and spreadsheet procedures without a token", async () => {
    const { ctx } = makeContext();
    await expectTRPCError(callerFor(ctx).workspace.list(), "UNAUTHORIZED");
    await expectTRPCError(
      callerFor(ctx).spreadsheet.byId({ id: "any" }),
      "UNAUTHORIZED",
    );
  });

  it("keeps the public form's procedures open", async () => {
    const { ctx } = makeContext();
    const outcome = await callerFor(ctx)
      .populate.form({ id: "no-such-sheet" })
      .then(
        () => "ok",
        (error: { code?: string }) => error.code,
      );
    expect(outcome).not.toBe("UNAUTHORIZED");
  });
});
