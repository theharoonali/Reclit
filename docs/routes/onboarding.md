# `/onboarding`

**Purpose:** the first run. The user uploads a CSV or `.xlsx` file, which
becomes their first workspace; the page then hands them to the dashboard.

**Rendering:** dynamic, the same as every route (the `locale` cookie opts the
app out of prerendering). The decision to show this page is made on the
client by `OnboardingGate`.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(onboarding)/layout.tsx` | RSC | The `(onboarding)` route group has no chrome: `<OnboardingGate area="onboarding">` around a centred `min-h-dvh` column |
| `apps/dashboard/src/app/(onboarding)/onboarding/page.tsx` | RSC | `pageMetadata("onboarding")` + `<OnboardingUpload />` |
| `apps/dashboard/src/components/onboarding/onboarding-gate.tsx` | client | `user.me` → full-screen `LoadingState` while pending or redirecting, full-screen `ErrorState` on failure, otherwise renders its children. Also mounted by `(app)/layout.tsx` with `area="app"` |
| `apps/dashboard/src/components/onboarding/onboarding-upload.tsx` | client | Drop zone → picked file (replace) + workspace-name field prefilled from the file name → submit; error text from the error code |
| `apps/dashboard/src/components/onboarding/use-onboarding.ts` | hook | The `POST /onboarding` mutation. On success it stores the new workspace as active and refetches `user.me`, which makes the gate redirect |
| `apps/dashboard/src/lib/onboarding/route.ts` | data | `onboardingRedirect(user, area)`, a pure helper that decides the redirect |
| `apps/dashboard/src/lib/onboarding/complete-onboarding.ts` | data | `completeOnboarding` (`postFile`), the hand-declared `OnboardingResult`, `workspaceNameFromFile`, `onboardingErrorKey` |

Shared pieces used: `components/common/file-drop-zone.tsx`,
`components/common/form-field.tsx`, `components/common/loading-state.tsx`,
`components/common/error-state.tsx`, `storeActiveWorkspaceId` from
`components/workspace/workspace-provider.tsx`, `SHEET_FILE_ACCEPT` from
`lib/ai-spreadsheet/import-file.ts`, `@reclit/ui/button`, `@reclit/ui/input`
and `@reclit/ui/spinner`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `user.me` | query | `OnboardingGate` (both route groups) | — |
| `POST /onboarding` (REST, multipart) | mutation | `useOnboarding` | `workspace.list`, `user.me` |

Payloads and responses are in the contract headers of
`apps/api/src/__tests__/onboarding.api.test.ts` and `user.api.test.ts`.
Backend detail is in [docs/features/onboarding.md](../features/onboarding.md).
This page makes no other call: `workspace.list` loads only once the
dashboard's `WorkspaceProvider` mounts.

## Behaviour

- **Gate:**
  - Every `(app)` page and this page start with a full-screen spinner while
    `user.me` loads.
  - `onboardingCompleted: false` means the user belongs here.
  - `true` means `/`: a visit to `/onboarding` redirects there.
  - While a redirect runs, the spinner stays up, so the wrong screen never
    flashes.
  - If `user.me` fails, the page shows a full-screen error.
- **Upload:**
  - The file is picked by drag-and-drop or the button (`.csv`/`.xlsx`).
  - The name field is prefilled with the file name minus its extension. The
    user can edit it; if they clear it, the server falls back to the file
    name.
  - "Replace" picks another file and clears any earlier error.
- **Submit:**
  - The button shows a spinner and stays disabled until the redirect.
  - Errors are mapped from `ApiError.code` to message keys: `errorType`,
    `errorEmpty`, `errorTooLarge`, `errorName`, and a generic `error`.
  - A rejected file creates nothing, so the user can simply try again.
- **Success:**
  - The new workspace is stored as the active one (the localStorage key
    `reclit.activeWorkspaceId`).
  - `user.me` is refetched and now returns `true`, so the gate replaces the
    route with `/`.
  - The dashboard opens with the new workspace selected, and its sheet holds
    the file's rows.
- `ONBOARDING_ALREADY_COMPLETED`, for example after finishing in another tab,
  refetches `user.me`, so the gate moves the user on.

## Reusable pieces

- `OnboardingGate` is the one place that sends a user to a route based on
  their state. Extend `onboardingRedirect` rather than adding a second gate.
- `FileDropZone` is the file-picking surface to reuse.

## Linked routes

- `/` ([root.md](root.md)): the gate sends a user here when onboarding is
  done, and sends a user who has not onboarded from here to this page.
