import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";

/**
 * The copy-paste curl on the Populate page, built from the sheet's real
 * fields. Sample values are code, not copy: they show each type's wire shape
 * (see the populate contract), so they are not translated.
 */

type PopulateField = RouterOutputs["populate"]["form"]["fields"][number];

export const SAMPLE_VALUES: Record<PopulateField["type"], unknown> = {
  string: "Text",
  number: 42,
  boolean: true,
  date: "2026-01-31",
  json: { key: "value" },
  // Never a field — the API refuses formula columns; listed for totality.
  formula: "",
  audio: "https://example.com/recording.mp3",
  file: "https://example.com/document.pdf",
  email: "name@example.com",
  url: "https://example.com",
};

/** A single-quoted shell string: `'` closes, escapes and reopens the quote. */
const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

export function buildCurlExample({
  endpoint,
  fields,
}: {
  endpoint: string;
  fields: Pick<PopulateField, "name" | "type">[];
}): string {
  const body = {
    fields: Object.fromEntries(
      fields.map((field) => [field.name, SAMPLE_VALUES[field.type]]),
    ),
  };
  return [
    `curl -X POST ${shellQuote(endpoint)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d ${shellQuote(JSON.stringify(body, null, 2))}`,
  ].join("\n");
}
