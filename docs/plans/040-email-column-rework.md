# 040 — Email column rework + AI node icon

## Goal

1. The AI node's icon becomes a real AI mark (Hugeicons `AiSparklesIcon`) in
   the primary orange, in the node picker and the canvas header.
2. The Mail (`email` node) column grows up:
   - Recipients come from addresses found in the column's **prompt** and in
     **any row cell's content** — not only email-typed cells. No address
     anywhere, or a model that cannot tell who to email → nothing is sent.
   - **Multiple recipients**, one **personalized** email each (one Gemini
     call returning a draft list; sends go out one by one).
   - The cell value becomes `{ address: "Subject: …\n\n…" | "FAILED" }`,
     which forces Mail columns to be `json` (enforced at create/update).
   - Mail cells are **read-only** — grid and API (`SPREADSHEET_COLUMN_READ_ONLY`);
     only the run worker writes them (`setCell`'s `computed` option).
   - The cell paints two count capsules (green sent, red failed when any),
     and the column form shows the column's totals the same way.

## Plan

- API: `email-prompt.ts` discovery/draft-schema/cell-value rewrite,
  `email-output.ts` multi-send with per-address idempotency
  (`<runId>:<address>`) and FAILED capture, `run-ai.schema.ts`
  `emails: RunAiEmail[]` (legacy `email` kept optional), json-only +
  read-only guards in the spreadsheet services, `isRunnable` email ⇒ json.
- Dashboard: `email-cell.ts` counting helper, canvas count chips
  (`paint-cell.ts` gains `node`), read-only guards in
  `use-cell-editor`/`use-sheet-pointer`, `run-targets` mirror, column form
  locks type to json for Mail, `EmailCountChips` in the column panel,
  node icon accent.
- Contracts: run-ai email sections rewritten; spreadsheet json-only +
  read-only tests; populate Mail fixture now json.

## Outcome

Shipped as planned. Backend suites green (run-ai 99, spreadsheet 81,
populate 25); dashboard tests 256 with the new `email-cell.test.ts`. Legacy
string Mail columns are no longer runnable (values kept); old runs' single
`result.email` records still parse. The send path (Gemini draft list →
per-address Resend sends) is exercised in the live app, not in contract
tests, since it needs the model.
