# 004 — My Resume page

**Status:** implemented
**Scope:** frontend

## Goal

A **My Resume** entry in the side menu leads to `/resume`, which renders
`Resume.pdf` inline, filling the content area beside the fixed sidebar and under
the fixed header. The resume is the whole page — no other content on it. This is
also the first route added since the shell landed, so it proves the shell's
promise: a new page is a `config/nav.ts` entry plus a `page.tsx`, and touches no
chrome file.

## Backend (Agent 1)

None. `apps/api` is not modified and the page calls no procedure.

## Frontend (Agent 2)

- **Route(s):** `/resume`, in the existing `(app)` group so it inherits the
  shell. Nav entry: `My Resume`, enabled — the second real destination.
- **Files:**

  | Path | New/changed | Owns |
  | --- | --- | --- |
  | `apps/dashboard/public/resume.pdf` | moved | the document, served at `/resume.pdf` |
  | `apps/dashboard/next.config.ts` | changed | `X-Frame-Options: SAMEORIGIN` + `CSP: frame-ancestors 'self'` |
  | `apps/dashboard/src/config/nav.ts` | changed | new `personal` section with the `resume` item |
  | `apps/dashboard/src/messages/en.json` | changed | new `nav.*` and `resume.*` keys |
  | `apps/dashboard/src/components/resume/resume-viewer.tsx` | new | the `<iframe>` and its no-inline-PDF fallback |
  | `apps/dashboard/src/app/(app)/resume/page.tsx` | new | thin page: metadata + one component |

- **States:** nothing to fetch, so no loading or error state. The one degraded
  path is a browser that will not display PDFs inline, which gets fallback text
  and a download link from inside the `<iframe>` element.

## Integration (Agent 3)

None.

## Decisions

- **Pages are drawn to canvas with `react-pdf`/`pdfjs-dist`, not embedded in an
  `<iframe>`.** This reverses the plan's original decision, which was made on the
  assumption that the browser's own PDF viewer would display the file. It does
  not: the user runs Internet Download Manager, whose extension intercepts PDF
  requests and offers a download instead. Chrome's "Download PDFs instead of
  automatically opening them" setting does the same. **No response header can
  override either** — the server was already sending `Content-Type:
  application/pdf` with no `Content-Disposition`, which was confirmed with
  `curl -D -`. Rendering the pages ourselves is the only approach that
  guarantees the document appears.
- **`X-Frame-Options` stays `DENY`.** It was relaxed to `SAMEORIGIN` for the
  iframe and then reverted once the iframe was gone: nothing in the app frames
  anything, so there is no reason to keep the weaker posture.
- **pdf.js sits behind a `lazy()` boundary gated on `mounted`.** `pdfjs-dist`
  touches `DOMMatrix` at import time, so any import reachable during SSR fails
  the route with a 500. A `mounted` check alone is not enough — the *import*, not
  just the render, has to be deferred.
- **The worker is resolved via `new URL(..., import.meta.url)`**, not copied into
  `public/`, so it can never drift from the installed `pdfjs-dist`.
- **The PDF fills the content area** and carries no page heading. `<main>`
  already has padding, so the viewer reads as an inset bordered card and the
  document gets the remaining room.
- **`public/resume.pdf`, lowercase** — the URL is user-visible and every other
  path in this repo is lowercase.
- **`My Resume` is pinned to the foot of the nav, not filed in a section.** It
  does not belong under `Management` beside `Employee`, `Leave` and `Timesheet`,
  and a section heading of its own for a single entry is noise. It lives in
  `bottomNavItems` and is pushed down with `mt-auto`, so it sits directly above
  the workspace block while staying inside the scrolling nav area — above the
  divider, not below it.
- **`h-full` on the page wrapper is load-bearing.** `<main>` is `min-h-0 flex-1`
  in the shell's fixed-height column, so it has a definite height; `h-full`
  resolves against it and, with `box-sizing: border-box`, fits exactly inside
  main's padding. The result is one scrollbar — the PDF viewer's — which is what
  keeps the header and sidebar fixed.

## Risks / open questions

- **The resume becomes world-readable.** `public/` is served to anyone with the
  URL, this repo has no auth, and the file enters git history permanently. A
  resume normally carries a phone number, email and address. Raised with the
  user before implementing and accepted. Putting it behind auth would mean a
  route handler and a session check — a different plan.
- **3.97 MB for two pages**, so almost certainly a scan rather than text. Every
  visit to `/resume` downloads all of it. Not re-encoded here: silently
  recompressing someone's document is not this change's business.
- **There is no zoom, print, search or page-jump control.** The native viewer
  supplied all of those free; canvas rendering supplies none. Pages render at
  container width and that is the only view. Adding controls is real work.
- **No download escape hatch.** If pdf.js fails, the user sees an error message
  and nothing else.
- **Weight.** `react-pdf` + `pdfjs-dist` is a large client dependency for one
  page, on top of a 3.97 MB document.
- If IDM (or similar) turns out to intercept pdf.js's own XHR for `/resume.pdf`
  too, the next step is a route handler on a URL without a `.pdf` extension.
  Script-initiated fetches are not normally hooked, so this is not expected.

---

## Outcome

- **Shipped:** all of the plan, unchanged.
  - `Resume.pdf` → `apps/dashboard/public/resume.pdf`. It was untracked, so
    `git mv` did not apply and a plain `mv` was used; `Content-Length` on the
    served file is `3967180`, matching the original byte count exactly.
  - `next.config.ts` now sends `X-Frame-Options: SAMEORIGIN` and
    `Content-Security-Policy: frame-ancestors 'self'`.
  - `personal` nav section with the enabled `resume` item (`FileUser`).
  - Seven new message keys; no existing key touched.
  - `components/resume/resume-viewer.tsx` and `app/(app)/resume/page.tsx`.

- **Verified** against the running server, not by inspection of the diff:
  - `curl -D -` on `/resume.pdf` returns `200`, `X-Frame-Options: SAMEORIGIN`,
    `Content-Security-Policy: frame-ancestors 'self'`,
    `Content-Type: application/pdf`, `Content-Length: 3967180`. This was the
    premise of the whole plan, so it was checked directly.
  - `/resume` renders `<iframe src="/resume.pdf" title="My resume, PDF
    document" class="h-full w-full …">` inside `<div class="h-full">`, with the
    fallback text and download link present as iframe children.
  - Sidebar active state is correct on both routes: on `/resume`, `My Resume` is
    the only row with `aria-current="page"` and `Dashboard` is not; on `/`, the
    reverse. The eight placeholder rows remain inert `<span aria-disabled>`.
  - `<title>` is `My Resume`, resolved from `resume.title`.
  - Build lists `ƒ /resume`; lint, typecheck and tests pass.

- **Deviated: the rendering approach was reversed after shipping.** The
  `<iframe>` version was built, verified at the header level, and then failed in
  the user's browser — IDM intercepted `/resume.pdf` and offered a download. The
  premise of the original decision was false, so the viewer was rebuilt on
  `react-pdf` and `X-Frame-Options` was returned to `DENY`. The `Decisions`
  section above now records the approach that actually ships.
  - Along the way SSR failed with `ReferenceError: DOMMatrix is not defined`,
    which forced the three-file split: `resume-viewer.tsx` (container, measure,
    lazy boundary), `resume-pages.tsx` (pdf.js, browser-only),
    and shared loading/error states, which now live in `components/common/`.
  - Build emits the worker to `.next/static/media/pdf.worker.min.*.mjs` in both
    dev and production, so `new URL(..., import.meta.url)` resolves correctly
    under Turbopack.

- **Not done / still true:**
  - The PDF was not recompressed. 3.97 MB is fetched on every visit.
  - `/resume.pdf` is world-readable; there is no auth in this repo.
  - No zoom, print, search or page-jump controls.
  - **The canvas rendering is not verified.** SSR, the build, the emitted worker
    asset and the served markup are all confirmed, but pdf.js only paints in a
    real browser and none is available in this environment. Whether the pages
    actually appear is unconfirmed and needs the user to look.

- **Docs updated:** `docs/routes/resume.md` (new), `docs/routes/index.md`,
  `docs/rules/FRONTEND.md` (fill-the-frame pages, and the standing requirement
  that the XFO/CSP pair stays `SAMEORIGIN`/`frame-ancestors 'self'`).
