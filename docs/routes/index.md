# Routes

One doc per page. **Read the route's doc before opening its code** — it lists
every file and API behind the page and what it does today.

| Route | Doc | Purpose |
| --- | --- | --- |
| `/` | [root.md](root.md) | The dashboard and the app shell — sidebar + header. Calls no API |
| `/ai-spreadsheet` | [ai-spreadsheet.md](ai-spreadsheet.md) | A canvas spreadsheet: endless rows, typed columns, canvas-drawn editing. Persists through the spreadsheet API + `POST /files` uploads |
| `/populate` | [populate.md](populate.md) | The public form link + the Populate API (endpoint and curl). Calls `populate.form` |
| `/settings` | [settings.md](settings.md) | Display-only user profile + stubbed subscription cards. Calls `user.me` |
| `/onboarding` | [onboarding.md](onboarding.md) | First run: upload a CSV/XLSX to create the first workspace. Every `(app)` route is gated on `user.me` and sends a user who has not onboarded here. Calls `user.me`, `POST /onboarding` |
| `/form/[spreadsheetId]` | [form.md](form.md) | Public form that adds a row to a spreadsheet and runs its AI columns. Calls `populate.form`, `populate.submit`, `POST /files`, `DELETE /files` |

New route? Copy [`_template.md`](_template.md), fill it in, add a row here.

Backend detail (tables, services, procedures) lives in
[docs/features/](../features/index.md); payloads and responses live in the
feature's contract test. Route docs link to those rather than repeating them.

Rules: [common](../rules/COMMON.md) · [frontend](../rules/FRONTEND.md) ·
[backend](../rules/BACKEND.md) · [testing](../rules/TESTING.md) ·
[workflow](../rules/WORKFLOW.md)
