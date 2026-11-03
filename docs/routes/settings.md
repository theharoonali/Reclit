# `/settings`

**Purpose:** the user's profile (name, email, picture), the account's
company profile (website, use cases, rules, documents — the context every AI
call gets) and the stubbed subscription/add-on cards.

**Rendering:** dynamic (`force-dynamic`) — reads live user data.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/settings/page.tsx` | RSC | `pageMetadata`, prefetch `user.me` and `company.me`, `PageShell`, mounts the three sections (Profile, Company, Subscription) |
| `apps/dashboard/src/components/settings/profile-settings.tsx` | client | display-only name + email from `user.me`, rendered as disabled (dimmed) fields |
| `apps/dashboard/src/components/settings/company-settings.tsx` | client | the Company section's container: `useCompany({ live: true })` (the one `company.onChange` stream) → `LoadingState` / `ErrorState`, then the three parts below and the documents (`CompanyDocumentList` with its empty line, `CompanyDocumentUpload`) |
| `apps/dashboard/src/components/settings/company-website-settings.tsx` | client | `CompanyCard` (summary saved on blur) or the "no website" line; the website `Input` with "Read website" (enabled for a new address) and "Re-scan website" (disabled without a website or while crawling) |
| `apps/dashboard/src/components/settings/company-use-case-settings.tsx` | client | `CompanyUseCasePicker` in `compact` size: a toggle saves at once (the last use case cannot be removed), the Other text saves on blur |
| `apps/dashboard/src/components/settings/company-rules-settings.tsx` | client | the rules `Textarea` (max 8000) and "Save rules", enabled once the text differs from the saved rules |
| `apps/dashboard/src/components/settings/subscription-settings.tsx` | client | plan cards (Pro plain, Premium primary-tinted) + three one-time add-on cards; pure UI over `config/subscription.ts`, no handlers |
| `apps/dashboard/src/config/subscription.ts` | data | stubbed plans, add-ons, current plan and credit usage (no billing backend) |

Company pieces (shared with `/onboarding`): `components/company/`
(`company-card`, `company-document-list`, `company-document-upload`,
`company-use-case-picker`, `use-company`, `use-company-documents`),
`config/use-cases.ts`, `lib/company/*`,
`@reclit/ui/choice-card`. Tests: `apps/dashboard/tests/company/`.

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/input`,
`components/common/page-shell.tsx`, `components/common/form-field.tsx`,
`components/common/loading-state.tsx`, `components/common/error-state.tsx`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `user.me` | query | `profile-settings` | — |
| `company.me` | query | `useCompany` (`company-settings` and each part), prefetched by `page.tsx` | — |
| `company.onChange` | subscription | `useCompany({ live: true })` in `company-settings`, while the section is mounted (the parts share its cache, no stream of their own) | replaces the `company.me` cache |
| `company.setWebsite { url }` | mutation | `company-website-settings`, on Read website | sets `company.me` from the response |
| `company.recrawl` | mutation | `company-website-settings`, on Re-scan website | sets `company.me` from the response |
| `company.update { summary }` · `{ useCases, useCaseOther }` · `{ rules }` | mutation | the card's summary on blur · a chip toggle or the Other field's blur · Save rules | sets `company.me` from the response |
| `POST /files` then `company.addDocument` | REST + mutation | `useCompanyDocuments.add`, per picked file; a refused document's upload is removed with `DELETE /files` | refetch `company.me` |
| `company.removeDocument { id }` | mutation | `useCompanyDocuments.remove` | refetch `company.me` (also after a failure) |

Payloads and responses: the contract headers of
`apps/api/src/__tests__/user.api.test.ts` and `company.api.test.ts`; the
dashboard's `Company` / `CompanyDocument` / `CompanyUpdate` are
`RouterOutputs` / `RouterInputs` aliases in `lib/company/api.ts`.
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
- Company: the account's profile, one per user and shared by every
  workspace. The card shows the site's icon (the initial until it loads),
  the name, the host and the summary (editable; saved when the field loses
  focus) and the crawl line ("Reading the rest of your site…" while
  `CRAWLING`, "Read N pages of your site" once `READY`, a destructive line
  if `FAILED`). A new address is read with "Read website"; "Re-scan website"
  crawls the saved one again. Use cases are compact chips that save on
  toggle. Rules save with their button. Documents list with status chips
  (uploading, reading, ready, failed) and a remove button; the drop zone
  takes several files and refuses a wrong type, a file over 15 MB or an
  eleventh document before uploading. Errors read `company.errors.*`
  through `companyErrorKey(procedure, trpcCode)` — only the tRPC code
  reaches the client, so each call maps its own: `setWebsite` BAD_REQUEST
  → invalid address, SERVICE_UNAVAILABLE → reading not configured,
  BAD_GATEWAY → could not be read; `recrawl` CONFLICT → no website;
  `addDocument` CONFLICT → the 10-document limit, BAD_REQUEST → the type;
  `removeDocument` NOT_FOUND → already removed; `update` BAD_REQUEST →
  too long; anything else the generic error. A failed `POST /files` is
  "could not be uploaded".
- Subscription: presentation only. Cards and add-ons read the stub in
  `config/subscription.ts`; the Upgrade/Buy buttons carry no handlers and the
  current plan's button is disabled. Wiring billing means replacing that
  config with real data — the components need no structural change.
- There is no workspace section; workspace creation and switching live in the
  sidebar's account menu ([root.md](root.md)).

## Linked routes

- `/` ([root.md](root.md)) — the sidebar's account menu links here (the
  bottom-pinned Settings nav row is gone).
