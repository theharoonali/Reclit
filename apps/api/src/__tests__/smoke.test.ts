import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createApp } from "../bootstrap";
import { pingDatabase } from "../db/prisma";

// Skips the database-backed check (rather than failing) when DATABASE_URL
// points nowhere, so a checkout without a reachable database still passes CI.
const dbUp = await pingDatabase();

let app: Awaited<ReturnType<typeof createApp>>;
let baseUrl: string;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected the test server to bind a TCP port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

describe("api smoke", () => {
  it("GET /health reports database reachability", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(dbUp ? 200 : 503);
    expect(await res.json()).toMatchObject({
      status: dbUp ? "ok" : "degraded",
    });
  });

  it.skipIf(!dbUp)(
    "serves note.list over the mounted tRPC adapter",
    async () => {
      const res = await fetch(`${baseUrl}/trpc/note.list`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: { data: { json: unknown[] } };
      };
      expect(Array.isArray(body.result.data.json)).toBe(true);
    },
  );
});
