# Routes

One doc per page. **Read the route's doc before opening its code** — it lists
every file and API behind the page and what it does today.

| Route | Doc | Purpose |
| --- | --- | --- |
| `/` | [root.md](root.md) | The dashboard and the app shell — sidebar + header. Calls no API |
| `/ai-spreadsheet` | [ai-spreadsheet.md](ai-spreadsheet.md) | A canvas spreadsheet: endless rows, typed columns, canvas-drawn editing. Calls no API |
| `/resume` | [resume.md](resume.md) | The resume PDF, embedded in the browser's viewer. Calls no API |

New route? Copy [`_template.md`](_template.md), fill it in, add a row here.

Backend detail (tables, services, procedures) lives in
[docs/features/](../features/index.md); payloads and responses live in the
feature's contract test. Route docs link to those rather than repeating them.

Rules: [common](../rules/COMMON.md) · [frontend](../rules/FRONTEND.md) ·
[backend](../rules/BACKEND.md) · [testing](../rules/TESTING.md) ·
[workflow](../rules/WORKFLOW.md)
