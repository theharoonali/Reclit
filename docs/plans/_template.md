# NNN — <title>

> Copy to `docs/plans/NNN-<slug>.md` (next free number) and commit it **before**
> writing code ([../rules/COMMON.md](../rules/COMMON.md) §7). After implementing,
> fill in `Outcome` and flip `Status` — never rewrite the plan body to match what
> happened.

**Status:** planned | implemented | abandoned
**Scope:** backend | frontend | full feature

## Goal

One paragraph: what the user can do when this is finished.

## Backend (Agent 1)

- **Table(s):** model name + the columns being added or changed.
- **Procedures:** name, kind, payload, response, error codes — this is what the
  contract header will say.
- **Service methods:** name → what it does.
- Anything reused instead of written.

## Frontend (Agent 2)

- **Route(s):** path, rendering mode, nav entry.
- **Components:** which exist already and get extended, which are new, and where
  each lives.
- **States:** loading / error / empty handling; any new token or chrome change.

## Integration (Agent 3)

- Which component calls which procedure, and which query gets invalidated after
  which mutation.

## Decisions

- Choices made and the option rejected, one line each. This is the part worth
  reading a year from now.

## Risks / open questions

- What could be wrong, and what would settle it.

---

## Outcome

*(filled in after implementation)*

- **Shipped:** what actually exists now, with paths.
- **Deviated:** where the implementation differs from the plan above, and why.
- **Not done:** anything deliberately left out, and what it would take.
- **Docs updated:** feature doc, route doc, contract test.
