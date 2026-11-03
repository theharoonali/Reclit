# 038 — Mail column (the `email` node sends mail)

**Status:** implemented
**Scope:** full feature

## Goal

A column can carry the **Mail** node (wire `email`, registered since plan 011
and never executed). Its prompt is an email instruction. On Run, each selected
row gets an email drafted by Gemini from the prompt and the row — or forwarded
verbatim from the row's previous runnable column ("send the Draft column
as-is") — and sent through Resend from `Reclit <noreply@reclit.com>` to one of
the row's own `email`-typed cells. The cell records what was sent.

## Backend (Agent 1)

- **Tables:** none. `NodeType.EMAIL` already exists; `Column.config` stays
  dropped — the prompt is the whole configuration.
- **Procedures:** none new. `runAi.runCells` now runs an `email` column that
  has a prompt and is a `string` or `json` column. `RunAi.result` gains
  `email: { to, subject, body, from, messageId, sentAt }`.
- **Service methods / helpers:**
  - `isRunnable` — `email` needs a prompt and a `string` / `json` column (the
    cell holds the send summary or the record). Dashboard mirror in
    `run-targets.ts`.
  - `src/ai/resend.ts` — `sendEmail({ to, subject, text, idempotencyKey })`,
    raw `fetch` to `POST https://api.resend.com/emails`, key read per call
    (`RESEND_API_KEY`), sender `RESEND_FROM` defaulting to
    `Reclit <noreply@reclit.com>`, `Idempotency-Key` = the run id.
  - `src/ai/email-prompt.ts` (pure) — `emailRecipients`, `emailDraftSchema`,
    `resolveRecipient`, `emailCellValue`.
  - `cell-prompt.ts` — `EMAIL_RULES`; an `email` target swaps the "Answer
    with …" sentence for the rules plus the allowed recipients.
  - `src/ai/email-output.ts` — `generateEmailCellValue(input, { runId })`:
    recipients → draft (`Output.object`, no tools) → recipient check → send →
    `CellGeneration & { email }`.
  - `run-ai-cell.ts` — third branch; a `complete` that fails after the
    generator succeeded fails the run *with* the generator's extras, so a
    sent-but-unrecorded email keeps `result.email`.
- **Reused, not written:** `buildCellMessages` row rendering and `previous`,
  `coerceCellValue`, `gemini()`, the `elevenlabs.ts` fetch idiom, the whole
  run / wave / stream machinery.

## Frontend (Agent 2)

- **Route:** `/ai-spreadsheet`, unchanged.
- **Components:** the column form unlocks the Mail capsule (`LOCKED_NODES`
  keeps only API), picks the prompt placeholder per node; `node-icons.ts`
  gains `Mail01Icon`; `en.json` `nodes.email` → "Mail".
- **States:** a Mail node on a column that is not Text/JSON is skipped by Run,
  the same silence as a promptless column.

## Integration (Agent 3)

Nothing new to wire: `runCells` and the `onChange` stream carry the mail run
like any other.

## Decisions

- **Recipient from the row, checked by the server.** The model picks `to`;
  anything not literally one of the row's email cells (trimmed,
  case-insensitive) fails the cell before anything is sent.
- **Draft by the model, forward via `previous`.** No body-from-column config:
  the row's previous runnable column already reaches the model as the primary
  input, and the rules tell it to copy it verbatim when asked.
- **Plain text only**, no HTML.
- **Media pipeline skipped** (as for the search node): file/audio/url cells
  reach the model as text lines.
- **Idempotency key = run id.** Protects against a worker re-execution; a user
  re-run is a new run and sends again, by design.
- **The assistant's pending-AI-column filter keeps `node === "ai"`.** A mail
  cell's value is a send summary, not data to chart.

## Risks / open questions

- **Automatic sends.** Once runnable, a mail column also runs on every public
  form submission (`populate.submit` → `runRow`) and in onboarding's `finish`.
- A row whose email cell is blank fails the mail cell and stops that row's
  later waves (`RunAiSeriesStopped`), like a failed search.
- A mail column placed first has no `previous`; its prompt must describe the
  body.
- A Resend 403 (sender domain not verified) fails the cell with the message.

---

## Outcome

- **Shipped:**
  - `apps/api/src/ai/resend.ts`, `email-prompt.ts`, `email-output.ts` (new);
    `cell-prompt.ts` (`EMAIL_RULES`, the email branch of
    `buildCellMessages`); `run-ai.schema.ts` (`runAiEmailSchema`,
    `result.email`); `run-ai-batch.service.ts` (`isRunnable`);
    `trigger/run-ai-cell.ts` (third branch, generator extras kept on a failed
    `complete`); `assistant-tools.ts` (tool description).
  - Dashboard: `run-targets.ts` mirror, `node-icons.ts` (`Mail01Icon`),
    `ai-spreadsheet-column-form.tsx` (Mail unlocked, mail placeholder),
    `ai-spreadsheet-grid.tsx`, `en.json` (`nodes.email` → "Mail",
    `column.mailPromptPlaceholder`).
  - Env: `apps/api/.env.example`, `turbo.json`, `ARCHITECTURE.md`.
  - Also in this change, the same request: a hover tooltip with the full
    content of a body cell — `lib/ai-spreadsheet/cell-tooltip.ts`,
    `ai-spreadsheet-cell-tooltip.tsx`, hover state in `use-sheet-canvas.ts`,
    `use-sheet-pointer.ts`, `use-sheet-scroll.ts` (`onScrolled`),
    `ai-spreadsheet-body.tsx` (`onPointerLeave`), tokens `cell-tooltip` /
    `cell-tooltip-tall`.
- **Verified end to end** (2026-10-21) with the local worker on a throwaway
  "Mail column check" workspace: a Mail column sent "Hello from Reclit", a
  second one forwarded the AI "Draft" cell verbatim, both reported
  `delivered` by Resend from `noreply@reclit.com`; a row with no address
  failed with the no-recipient reason and its later mail cell stopped with
  the series.
- **Deviated:** the per-node placeholder is one extra key
  (`mailPromptPlaceholder`) rather than a per-node map.
- **Not done:** no send confirmation, no HTML body, no attachments, no
  cc/bcc; the assistant's pending-AI-column list still ignores mail columns.
- **Docs updated:** `docs/features/run-ai.md`, `docs/features/spreadsheet.md`,
  `docs/features/populate.md`, `docs/routes/ai-spreadsheet.md`, contract
  headers in `run-ai.api.test.ts`, `spreadsheet.api.test.ts`,
  `populate.api.test.ts`.
