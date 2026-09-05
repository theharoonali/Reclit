# `/settings`

**Purpose:** the user's profile (name, email, picture) and the stubbed
subscription/add-on cards.

**Rendering:** dynamic (`force-dynamic`) — reads live user data.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/settings/page.tsx` | RSC | `pageMetadata`, prefetch `user.me`, `PageShell`, mounts the two sections |
| `apps/dashboard/src/components/settings/profile-settings.tsx` | client | display-only name + email from `user.me`, rendered as disabled (dimmed) fields |
| `apps/dashboard/src/components/settings/subscription-settings.tsx` | client | plan cards (Pro plain, Premium primary-tinted) + three one-time add-on cards; pure UI over `config/subscription.ts`, no handlers |
| `apps/dashboard/src/config/subscription.ts` | data | stubbed plans, add-ons, current plan and credit usage (no billing backend) |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`,
`components/common/page-shell.tsx`, `components/common/form-field.tsx`,
`components/common/loading-state.tsx`, `components/common/error-state.tsx`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `user.me` | query | `profile-settings` | — |

Payloads and responses: the contract header of
`apps/api/src/__tests__/user.api.test.ts`.
Backend detail: [docs/features/user.md](../features/user.md).
Deliberately not called: `workspace.*` — workspace creation and switching live
in the sidebar's account menu, and rename/delete have no UI surface right now
(the procedures still exist; see the workspace contract).

## Behaviour

- Profile: display only. Name and email come from `user.me` and render as
  disabled inputs (the shared disabled style dims them) — the profile is not
  editable for now, so there is no form, no Save and no `user.update` call
  (the procedure still exists; see the user contract). Loading and errors use
  the common states.
- Subscription: presentation only. Cards and add-ons read the stub in
  `config/subscription.ts`; the Upgrade/Buy buttons carry no handlers and the
  current plan's button is disabled. Wiring billing means replacing that
  config with real data — the components need no structural change.
- There is no workspace section; workspace creation and switching live in the
  sidebar's account menu ([root.md](root.md)).

## Linked routes

- `/` ([root.md](root.md)) — the sidebar's account menu links here (the
  bottom-pinned Settings nav row is gone).
