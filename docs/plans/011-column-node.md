# 011 — Column node & prompt

**Status:** implemented
**Scope:** full feature

## Goal

A column can carry an optional **node** — `ai` or `email` on the wire, with
more kinds to come — that marks it for automated processing, plus a **prompt**
string the node will use. The column side-panel form gains a Node select;
choosing a node reveals a sparkles-decorated Prompt field. An `ai` column
paints a ✨ glyph left of its name in the canvas header. Nothing executes the
prompt yet — this is the persistence + UI groundwork.

## Backend (Agent 1)

- **Table(s):** `Column` gains `node NodeType?` (new enum `NodeType { AI EMAIL }`,
  null = no node) and `prompt String?`.
- **Procedures:** no new ones. `createColumn` accepts
  `node?: "ai" | "email" | null` (default null) and `prompt?: string | null`;
  `updateColumn` accepts both partially (`undefined` = unchanged, `null` =
  clear). Column outputs always include `node` and `prompt` (nullable).
- **Rules:** a prompt without a node is BAD_REQUEST (create checks the input;
  update checks the *effective* pair against the stored row). Setting
  `node: null` on update also nulls `prompt`.
- Reused: the lowercase-wire/uppercase-DB mapping pattern
  (`toDbNodeType`/`toWireNodeType` beside the `ColumnType` mappers),
  `columnSelect`, the conditional-spread partial-update pattern in
  `updateColumn`.

## Frontend (Agent 2)

- **Route(s):** none new — `/ai-spreadsheet`.
- **Components:** `ai-spreadsheet-column-form.tsx` gains a Node `Select`
  (None / AI / Email; `"none"` sentinel mapped to null at the boundary) and,
  when a node is chosen, a Prompt `Textarea`.
  `onSubmit` passes a `ColumnDraft` (`name`, `type`, `node`, `prompt`)
  through grid → model → sync. `paint-header.ts` gets an extensible
  `NODE_GLYPHS` map (`ai` → "✨") painted left of the column name, with the
  name's truncation room reduced by the glyph width.
- **States:** prompt field hidden while node is None; a cleared node submits
  `prompt: null`.

## Integration (Agent 3)

- Optimistic model (`use-sheet-model`) stores node/prompt so the glyph paints
  immediately and the edit form re-prefills; `use-sheet-sync` always sends
  both fields explicitly on update (`null` clears — never rely on omission).

## Decisions

- **Nullable enum, not a `NONE` member**, in DB and wire: "no node" is
  absence; a NONE member would leak into glyph maps and future switches.
- **Prompt allowed for any non-null node** (email included) — the backend has
  no per-node prompt policy yet; the form shows Prompt whenever node ≠ None.
- **Glyph via `fillText("✨")`**, not a hand-drawn path: matches the request,
  and the map keys it per node so future nodes add their own. Decorative
  only — no hit-testing.
- Prompt input is the shared `@reclit/ui` `Textarea` (4 rows), plain — no
  decoration icon.

## Risks / open questions

- Nothing executes prompts yet; a future plan wires an LLM/email worker.
- Import and seed never set node — imported columns are always plain.

---

## Outcome

- **Shipped:** everything above. Key files:
  `apps/api/prisma/schema.prisma`,
  `apps/api/src/modules/spreadsheet/spreadsheet.schema.ts`,
  `apps/api/src/modules/spreadsheet/spreadsheet-cells.service.ts`,
  `apps/dashboard/src/components/ai-spreadsheet/ai-spreadsheet-column-form.tsx`,
  `apps/dashboard/src/lib/ai-spreadsheet/paint-header.ts`.
- **Deviated:** nothing material.
- **Not done:** prompt execution; per-node prompt policies; EMAIL glyph.
- **Docs updated:** `docs/features/spreadsheet.md`,
  `docs/routes/ai-spreadsheet.md`, contract test header.
