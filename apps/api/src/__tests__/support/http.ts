import { createApp } from "../../bootstrap";

// The real app composition on an ephemeral port, for suites that drive REST
// routes with `fetch` (docs/rules/TESTING.md §Setup).

export type TestServer = { baseUrl: string; close: () => Promise<void> };

export async function startTestServer(): Promise<TestServer> {
  const app = await createApp({ logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected the test server to bind a TCP port");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => app.close(),
  };
}

/** A JSON request init; `body` is omitted when undefined. */
export const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
