# `/login`

**Purpose:** the login screen for the env-backed dummy user — one centred card
with email + password; skipped entirely when `DEV=TRUE`.

**Rendering:** static shell; the form and its session check are client-side.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(auth)/layout.tsx` | RSC | chrome-free route group (no sidebar/header, no gate) |
| `apps/dashboard/src/app/(auth)/login/page.tsx` | RSC | metadata + mounts the form |
| `apps/dashboard/src/components/auth/login-form.tsx` | client | session check, credentials form, error display, redirects |

Shared pieces used: `@reclit/ui/{card,input,button}`, `components/common/form-field`,
`components/common/loading-state`, `APP_NAME` from `config/nav.ts`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `auth.session` | query | `login-form` | — |
| `auth.login` | mutation | `login-form` | everything (`queryClient.invalidateQueries()`) |

Payloads and responses: the contract header of
`apps/api/src/__tests__/auth.api.test.ts`.
Backend detail: [docs/features/auth.md](../features/auth.md).
`auth.logout` is deliberately not called here — it lives in the account menu
(`components/workspace/account-menu.tsx`).

## Behaviour

- On mount the form asks `auth.session` and holds a full-screen loader until it
  answers; an authenticated visitor (valid cookie, or `DEV=TRUE`) is
  `router.replace`d to `/` without ever seeing the form.
- Wrong credentials surface the `invalidCredentials` message inline
  (UNAUTHORIZED); any other failure (e.g. `AUTH_NOT_CONFIGURED`, 503) shows the
  generic error. Submit is disabled while either field is empty.
- On success every cached query is invalidated (the gate's `user.me` must
  refetch with the new cookie) and the user lands on `/`.
- The reverse redirect lives in the gate
  (`components/onboarding/onboarding-gate.tsx`): `user.me` answering
  UNAUTHORIZED sends any `(app)`/`(onboarding)` visitor here.

## Reusable pieces

- The `(auth)` route group — a second auth screen (signup, reset) mounts beside
  `login/` with the same chrome-free layout.

## Linked routes

- `/` ([root.md](root.md)) — destination after login; its gate redirects back
  here when signed out.
