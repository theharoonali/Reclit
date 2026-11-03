# 035 — Locked Chat and column nodes

**Status:** implemented
**Scope:** frontend

## Goal

The sidebar lists Chat, visibly locked, with no page behind it. In the spreadsheet column form, Email stays in the node picker but cannot be chosen, and API appears beside it, also locked.

## Backend (Agent 1)

- None. API is not a wire node. Email stays a real node for columns that already have it; the form simply will not select it.

## Frontend (Agent 2)

- **Nav:** `config/nav.ts` gains a Chat row with `locked: true`. `app-sidebar.tsx` renders a locked row as inert text plus a lock icon. Label in `en.json`. No route, no page.
- **Column form:** the node capsules stay None / AI / Email / Google Search, with API inserted after Email. Email and API capsules are locked (`CapsuleSelect` `locked` option: lock icon, not selectable, skipped by arrow keys). An existing email column still shows Email as the current value and can still be saved.
- **States:** no new loading, error, or empty state. No new token.

## Integration (Agent 3)

- None. Locked choices never reach `spreadsheet.createColumn` / `updateColumn`.

## Decisions

- Chat uses the existing inert-nav treatment (`disabled` destinations have no route because unknown paths redirect home) plus a lock icon, rather than a placeholder page.
- API is a picker label only. It is not added to `NodeType`, so the API contract is unchanged.
- Email stays in `nodeTypes` so a column that already has that node still loads and saves. The lock only blocks choosing it.

## Risks / open questions

- "AI column" was read as the column form's node picker (None / AI / Email / Google Search), not the column type dropdown. Locking the email *type* would block a real data type the public form already uses.

---

## Outcome

- **Shipped:** Chat is a locked sidebar row (`config/nav.ts`, lock icon in `app-sidebar.tsx`, label in `en.json`). No `/chat` page. The column node picker shows None / AI / Email / API / Google Search; Email and API capsules are locked. API is not a `NodeType`. An existing email column still loads and saves.
- **Deviated:** none.
- **Not done:** no Chat page, and Email / API cannot be selected. Opening them means dropping the lock and, for API, adding a real node.
- **Docs updated:** `docs/routes/root.md`, `docs/routes/ai-spreadsheet.md`. No contract test — no API change.
