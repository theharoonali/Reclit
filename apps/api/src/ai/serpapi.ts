import { describeError } from "../common/errors";

// The one Google search behind a `google_search` node. Framework-free, key
// read lazily (the `gemini.ts` idiom) so the API and the test suite boot
// without it, and `fetch` injectable (the `cell-attachments.ts` idiom) so the
// contract test covers the parsing without a network call.
//
// A raw SerpAPI response is 30-50 KB of pagination, favicons, "about this
// result" links and highlighted-word arrays. Nearly all of it is noise to a
// model asked for one fact, and it would dominate the prompt it is pasted
// into, so `toSearchResponse` keeps only the fields an answer can be read out
// of and drops the rest.

export const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
export const SERPAPI_TIMEOUT_MS = 20_000;
export const SERPAPI_MAX_RESULTS = 10;

export type SearchResult = {
  position: number;
  title: string;
  link: string;
  /** The domain as Google prints it — often the whole answer on its own. */
  displayedLink: string | null;
  snippet: string | null;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  /** Google's knowledge panel, when it showed one. */
  knowledge?: { title?: string; website?: string; description?: string };
  /** Google's answer box ("featured snippet"), when it showed one. */
  answer?: string;
};

export type SearchFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/** The search URL, including the key. Exported so a test can assert the params. */
export function searchUrl(query: string, apiKey: string): string {
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", String(SERPAPI_MAX_RESULTS));
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  return url.toString();
}

/** A raw SerpAPI body reduced to what a model can answer from. Pure. */
export function toSearchResponse(query: string, body: unknown): SearchResponse {
  const root = asRecord(body) ?? {};
  const organic = Array.isArray(root.organic_results)
    ? root.organic_results
    : [];
  const results = organic
    .map(asRecord)
    .filter((result): result is Record<string, unknown> => result !== undefined)
    .slice(0, SERPAPI_MAX_RESULTS)
    .map((result, position) => ({
      position:
        typeof result.position === "number" ? result.position : position + 1,
      title: asText(result.title) ?? "",
      link: asText(result.link) ?? "",
      displayedLink: asText(result.displayed_link),
      snippet: asText(result.snippet),
    }))
    .filter((result) => result.link !== "");

  const knowledgeGraph = asRecord(root.knowledge_graph);
  const knowledge = knowledgeGraph && {
    ...(asText(knowledgeGraph.title) && {
      title: knowledgeGraph.title as string,
    }),
    ...(asText(knowledgeGraph.website) && {
      website: knowledgeGraph.website as string,
    }),
    ...(asText(knowledgeGraph.description) && {
      description: knowledgeGraph.description as string,
    }),
  };
  const answer = asText(asRecord(root.answer_box)?.answer);

  return {
    query,
    results,
    ...(knowledge && Object.keys(knowledge).length > 0 && { knowledge }),
    ...(answer !== null && { answer }),
  };
}

/**
 * One Google search. Unlike an attachment fetch, a failure here **throws**: a
 * search node whose search did not happen has nothing to answer from, and a
 * value invented without results is worse than a failed cell.
 *
 * Zero results is not a failure — it is a fact the caller may want to retry a
 * different query for.
 */
export async function googleSearch(
  query: string,
  fetchImpl: SearchFetch = fetch as unknown as SearchFetch,
): Promise<SearchResponse> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPAPI_API_KEY is not set. Add it to apps/api/.env (see .env.example).",
    );
  }
  // Only the transport is wrapped — a refusal below already reads well and
  // would just get a second prefix.
  let status: number;
  let ok: boolean;
  let body: unknown;
  try {
    const response = await fetchImpl(searchUrl(query, apiKey), {
      signal: AbortSignal.timeout(SERPAPI_TIMEOUT_MS),
    });
    ({ ok, status } = response);
    body = await response.json();
  } catch (error) {
    throw new Error(
      `Google search for "${query}" failed: ${describeError(error).message}`,
    );
  }
  // A 200 can still carry an error field (an exhausted plan, a bad parameter),
  // so the body is checked either way.
  const declared = asText(asRecord(body)?.error);
  if (!ok || declared !== null) {
    throw new Error(
      `SerpAPI refused "${query}": ${declared ?? `HTTP ${status}`}`,
    );
  }
  return toSearchResponse(query, body);
}
