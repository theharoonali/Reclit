import { describe, expect, test } from "bun:test";
import { buildCurlExample, SAMPLE_VALUES } from "@/lib/populate/curl-example";

const endpoint = "http://localhost:4001/populate/sheet-1";

/** The JSON between `-d '` and the closing quote, with shell escapes undone. */
const bodyOf = (curl: string) =>
  JSON.parse(
    curl
      .slice(curl.indexOf("-d '") + 4, curl.lastIndexOf("'"))
      .replaceAll("'\\''", "'"),
  );

describe("buildCurlExample", () => {
  test("posts JSON to the endpoint with a sample value per field type", () => {
    const curl = buildCurlExample({
      endpoint,
      fields: [
        { name: "Company", type: "string" },
        { name: "Score", type: "number" },
        { name: "Voice", type: "audio" },
        { name: "Meta", type: "json" },
      ],
    });
    expect(curl.startsWith(`curl -X POST '${endpoint}' \\\n`)).toBe(true);
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(bodyOf(curl)).toEqual({
      fields: {
        Company: SAMPLE_VALUES.string,
        Score: SAMPLE_VALUES.number,
        Voice: SAMPLE_VALUES.audio,
        Meta: SAMPLE_VALUES.json,
      },
    });
  });

  test("escapes a single quote in a column name for the shell", () => {
    const curl = buildCurlExample({
      endpoint,
      fields: [{ name: "Owner's email", type: "email" }],
    });
    expect(curl).toContain("Owner'\\''s email");
    expect(bodyOf(curl)).toEqual({
      fields: { "Owner's email": SAMPLE_VALUES.email },
    });
  });

  test("a sheet with no fields still yields a valid request body", () => {
    expect(bodyOf(buildCurlExample({ endpoint, fields: [] }))).toEqual({
      fields: {},
    });
  });
});
