# 021 — Google Search node

**Status:** implemented
**Scope:** replace the search provider in the existing feature

## Goal

Keep the Google Search column, source-column picker, typed output and batch
lifecycle. Replace SerpAPI with the Vercel AI SDK Google Search tool.

## Decisions

- Use `google.tools.googleSearch({})` from the installed `@ai-sdk/google`.
- First call: Gemini researches the configured source cells with the built-in
  provider tool, without a JSON schema. Second call: format that grounded
  response using the existing typed output schema, without tools.
- Require non-empty text, reported search queries and grounded web sources.
  Missing grounding fails the cell through the existing worker failure path.
- Keep `result.searches`: actual provider queries; `resultCount` is the number
  of distinct grounded web sources for the response, shared across queries.
  Google does not expose per-query organic result counts or SERP ranks.
- Use the existing Google key and model; remove the SerpAPI adapter and key.
- Google controls queries. Remove custom query generation and fallback retry.
- Retain source isolation, output validation, empty attachments and token usage
  aggregated across both calls. No database or UI changes.

## Work

1. Replace adapter and prompts with grounded research.
2. Update contract tests, feature docs, architecture and environment example.
3. Run format, lint, typecheck and tests.

## Outcome

The original implementation shipped SerpAPI between two Gemini calls. This
user-requested revision replaces that decision in this plan.

- Implemented Google provider-tool research followed by typed formatting.
- Removed the SerpAPI adapter and environment example; updated the contract,
  feature documentation and architecture. UI and database are unchanged.
- Six deterministic search tests passed. A live call using the existing
  `gemini-2.5-flash` returned `https://vercel.com`, two Google queries and three
  distinct grounding sources.
- Production build passed outside the Windows sandbox after its worker spawn
  was blocked. All 135 dashboard tests passed directly; the Turbo dashboard
  test wrapper masks a Windows shell failure as "No tests yet".
- Full lint and typecheck passed. API suite: 156 passed, 2 skipped sentinel tests,
  0 failures; database-backed contracts ran successfully.
