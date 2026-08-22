# Plans

How execution plans are tracked. Rule of record: [rules/COMMON.md](rules/COMMON.md).

## Lifecycle

1. A plan that is written but **not yet executed** is added to
   `docs/exec-plans/active/` as `NNN-short-name.md` — before any code is written.
2. When it has been executed, **move** the file to `docs/exec-plans/completed/`
   and tick its checklist. Never delete a plan.
3. Deliberate gaps and known debt go in
   [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md).

## Active

_None._

## Done

| Plan | Summary |
| --- | --- |
| [001-prisma-note-crud.md](exec-plans/completed/001-prisma-note-crud.md) | Prisma + Postgres, the `Note` CRUD slice, and this rules/route-docs system |
