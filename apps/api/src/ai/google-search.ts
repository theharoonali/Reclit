import { z } from "zod";

// Only provider metadata counts as evidence that Google Search actually ran.
const groundingSchema = z.object({
  webSearchQueries: z.array(z.string().trim().min(1)).min(1),
  groundingChunks: z.array(
    z.object({
      web: z
        .object({
          uri: z.url().refine((url) => /^https?:/.test(url)),
          title: z.string().nullish(),
        })
        .nullish(),
    }),
  ),
});

const searchResponseSchema = z.object({
  text: z.string().trim().min(1),
  queries: z.array(z.string()),
  sources: z.array(z.object({ url: z.string(), title: z.string() })),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export function readGroundedSearch(
  text: string,
  metadata: unknown,
): SearchResponse {
  const grounding = groundingSchema.safeParse(metadata);
  if (!grounding.success || !text.trim()) {
    throw new Error("Google Search returned no grounded answer");
  }
  const sources = new Map<string, SearchResponse["sources"][number]>();
  for (const chunk of grounding.data.groundingChunks) {
    if (chunk.web)
      sources.set(chunk.web.uri, {
        url: chunk.web.uri,
        title: chunk.web.title ?? chunk.web.uri,
      });
  }
  if (sources.size === 0)
    throw new Error("Google Search returned no web sources");
  return {
    text: text.trim(),
    queries: grounding.data.webSearchQueries,
    sources: [...sources.values()],
  };
}
