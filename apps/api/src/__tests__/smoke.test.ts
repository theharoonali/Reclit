import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { pingDatabase } from "../db/prisma";
import type { TestServer } from "./support/http";
import { startTestServer } from "./support/http";

// Skips the database-backed check (rather than failing) when DATABASE_URL
// points nowhere, so a checkout without a reachable database still passes CI.
const dbUp = await pingDatabase();

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(() => server.close());

describe("api smoke", () => {
  it("GET /health reports database reachability", async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    expect(res.status).toBe(dbUp ? 200 : 503);
    expect(await res.json()).toMatchObject({
      status: dbUp ? "ok" : "degraded",
    });
  });

  it.skipIf(!dbUp)(
    "serves spreadsheet.list over the mounted tRPC adapter",
    async () => {
      const res = await fetch(`${server.baseUrl}/trpc/spreadsheet.list`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: { data: { json: unknown[] } };
      };
      expect(Array.isArray(body.result.data.json)).toBe(true);
    },
  );
});
