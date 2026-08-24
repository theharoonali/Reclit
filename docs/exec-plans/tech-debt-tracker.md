# Tech Debt Tracker

Known intentional gaps in the template, logged when they were made.

| Item | Detail | Since |
| --- | --- | --- |
| No auth | Supabase removed; all procedures are public. Add a `protectedProcedure` when an auth provider is chosen. | 2026-08-19 |
| No toast system | `Toaster` and its ~15 transitive deps removed from `@reclit/ui`; re-add via shadcn when a feature needs it. | 2026-08-19 |
| No pagination on `note.list` | Returns every row. Fine at template scale; add input + a control before real data. | 2026-08-20 |
| No delete confirmation | `/` deletes immediately, no undo. | 2026-08-20 |
| No REST feature endpoints | The REST mirror of the note CRUD was removed; `/health` is the only REST route. Add a controller + module when a non-tRPC consumer exists. | 2026-08-21 |
| UI kit is one component | `@reclit/ui` ships only `Button`; card/dialog/input/label/skeleton/table/textarea were removed. Re-add via shadcn as features need them. | 2026-08-21 |
| No Dockerfiles | Deleted with the runtime rework; recreate when a deployment target exists. | 2026-08-19 |
| No i18n | `next-international` and the `[locale]` route segment removed; re-add if multi-locale lands on the roadmap. | 2026-08-19 |
