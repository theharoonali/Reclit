# Features

**One doc per backend feature — its table, service, router, and procedures in one
place.** Working on a feature? Read its doc and nothing else; open code only when
the doc is insufficient, then fix the doc.

| Feature | Doc | Table(s) | Router | Contract test |
| --- | --- | --- | --- | --- |
| note | [note.md](note.md) | `Note` | `note` | `apps/api/src/__tests__/note.api.test.ts` |
| spreadsheet | [spreadsheet.md](spreadsheet.md) | `Spreadsheet`, `Column`, `Row`, `Cell` | `spreadsheet` | `apps/api/src/__tests__/spreadsheet.api.test.ts` |
| file | [file.md](file.md) | — | — (REST `POST /files`) | `apps/api/src/__tests__/file.api.test.ts` |

New feature? Copy [`_template.md`](_template.md), fill it in, add a row here.

Payload and response detail lives in the contract header of the feature's test
file, not in these docs ([../rules/TESTING.md](../rules/TESTING.md)).

Rules: [common](../rules/COMMON.md) · [backend](../rules/BACKEND.md) ·
[testing](../rules/TESTING.md) · [workflow](../rules/WORKFLOW.md) ·
Pages: [routes](../routes/index.md)
