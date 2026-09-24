# 027 — Onboarding: first workspace from a CSV/Excel upload

**Status:** implemented
**Scope:** full feature

## Goal

The first time the user opens the app, they land on `/onboarding` and upload
a CSV or `.xlsx` file. The upload creates their first workspace, which they
own, and fills its sheet with the file's contents. A new
`User.onboardingCompleted` flag records that this has happened. On first load
every `(app)` route shows a full-screen loader while it calls `user.me`, then
sends the user to `/onboarding` if the flag is `false` and otherwise shows the
dashboard.

## Backend (Agent 1)

- **Table:** `User.onboardingCompleted Boolean @default(false)`. The migration
  backfills `true` for every user who already owns a workspace. The seed
  creates the demo user with `true`.
- **Procedures:**
  - `user.me` / `user.update` now return `onboardingCompleted`.
  - New REST-only endpoint `POST /onboarding`, taking multipart `file` plus an
    optional `name`.
    - Returns 200 `{ user, workspace, import: { rowCount, cellCount, totalColumns } }`.
    - Errors: 400 when there is no file; 400 `SPREADSHEET_IMPORT_*`; 400
      (zod) for an invalid name; 409 `ONBOARDING_ALREADY_COMPLETED`.
- **Service methods:**
  - `spreadsheetImportService.parse`: the parse, infer and limit-check half of
    `import`, split out so it can be reused.
  - `userService.completeOnboarding`.
  - `onboardingService.complete`: guard → parse → `workspaceService.create` →
    `replaceAll` → set the flag. A failed grid write deletes the new
    workspace again.

## Frontend (Agent 2)

- **Routes:**
  - `/onboarding` lives in a new `(onboarding)` route group with no chrome.
  - Both `(app)` and `(onboarding)` are wrapped in `OnboardingGate`, which runs
    the `user.me` query, shows a full-screen `LoadingState` while it loads, and
    redirects when the user is in the wrong group.
- **Components:**
  - `components/onboarding/{onboarding-gate,onboarding-upload,use-onboarding}`.
  - `components/common/file-drop-zone.tsx` is extracted from the public-form
    file field.
  - Pure helpers live in `lib/onboarding/`.
- **States:**
  - The gate has loader and error states.
  - The upload screen has idle, file-picked, uploading and error states, with
    errors mapped from `ApiError.code`.

## Integration (Agent 3)

- `use-onboarding` calls `POST /onboarding`, then:
  - sets the `user.me` data from the response,
  - invalidates `workspace.list`,
  - stores the new workspace as active,
  - redirects to `/`.

## Decisions

- **One REST endpoint, not three client calls** (`workspace.create` → import →
  flag). Doing it server-side means the file is validated before anything is
  written, and a half-finished onboarding cannot leave an orphan workspace.
- **Only onboarding writes the flag.** `user.update` does not accept it.
- **Existing users with a workspace are backfilled to `true`**, so the
  migration does not push them into onboarding.
- **The gate is client-side, with no SSR prefetch.** This avoids the trap
  where a query is dehydrated while pending and then fails, and it matches
  "show a loader, then decide".

## Risks / open questions

- There is no auth: "the user" is still `userService.me()`, the first user.
  Once real auth lands, the gate reads the session user instead.

---

## Outcome

- **Shipped:**
  - `User.onboardingCompleted` plus the migration
    `20260925120000_add_user_onboarding_completed` (with its backfill).
  - `apps/api/src/modules/onboarding/` (REST `POST /onboarding`).
  - `SpreadsheetImportService.parse`, split out of `import`.
  - `UserService.completeOnboarding`.
  - `OnboardingGate` on the `(app)` and `(onboarding)` route groups.
  - The `/onboarding` page (`components/onboarding/`, `lib/onboarding/`).
  - `components/common/file-drop-zone.tsx`, now also used by the public-form
    file field.
- **Deviated:**
  - The success path does not call `router.replace("/")` itself. The hook
    refetches `user.me`, and the `(onboarding)` gate redirects, so all routing
    on user state stays in one place.
  - The hook does not `setQueryData` the REST response either, because its
    dates are strings where the tRPC cache holds `Date`s.
  - The CSV/XLSX multipart test builders moved to
    `src/__tests__/support/upload.ts` once they had a second consumer.
- **Not done:**
  - There is no "skip onboarding".
  - There is no server-side (middleware) gate, since there is no auth to key
    it on.
- **Docs updated:**
  - `docs/features/{user,onboarding,index}.md`
  - `docs/routes/{onboarding,root,form,index}.md`
  - `docs/rules/{FRONTEND,TESTING}.md`
  - `ARCHITECTURE.md`
  - the contract headers of `user.api.test.ts` and the new
    `onboarding.api.test.ts`
