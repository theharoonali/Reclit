import { describe, expect, it } from "bun:test";
import app from "../index";

describe("health", () => {
  it("GET /health returns ok", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  it("GET /example/hello returns a greeting", async () => {
    const res = await app.fetch(
      new Request("http://localhost/example/hello?name=Ada"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { greeting: string };
    expect(body.greeting).toBe("Hello, Ada!");
  });
});
