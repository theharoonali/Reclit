# `/resume`

**Purpose:** Renders the resume PDF, filling the content area. The document is
the entire page — there is no other content on it.

**Rendering:** dynamic. The page fetches nothing and has no `export const
dynamic`, but `i18n/request.ts` reads the `locale` cookie, which opts every
route out of static prerendering ([root.md](root.md)).

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/resume/page.tsx` | RSC | Metadata from messages; renders one component inside an `h-full` wrapper |
| `apps/dashboard/src/components/resume/resume-viewer.tsx` | client | The container, its width measurement, and the lazy boundary in front of pdf.js |
| `apps/dashboard/src/components/resume/resume-pages.tsx` | client | pdf.js itself: `<Document>` + one `<Page>` per page. **Never imported at module scope** |
| `apps/dashboard/src/components/common/loading-state.tsx` | shared | Centred spinner, used while the document loads |
| `apps/dashboard/src/components/common/error-state.tsx` | shared | Centred failure message |
| `apps/dashboard/public/resume.pdf` | asset | The document, fetched by pdf.js from `/resume.pdf` |
| `apps/dashboard/src/config/nav.ts` | data | `bottomNavItems` — the `resume` entry pinned to the foot of the sidebar |
| `apps/dashboard/src/messages/en.json` | data | The `resume.*` keys and `nav.items.resume` |

Chrome comes from `(app)/layout.tsx` — this route adds none.

## APIs called

**None.** The page calls no procedure and prefetches nothing. The only network
request is pdf.js fetching `/resume.pdf`.

## Behaviour

- **Pages are drawn to canvas by pdf.js** (`react-pdf`), not handed to the
  browser's PDF viewer. All pages render stacked, top to bottom, in one
  scrolling column.
- **This is deliberate and must not be "simplified" back to an `<iframe>`.** An
  embedded PDF is served to the browser as a file, and anything that treats PDFs
  as downloads — Internet Download Manager and similar extensions, or Chrome's
  "Download PDFs instead of automatically opening them" setting — intercepts it
  and downloads the file instead of showing it. No response header can override
  that; the server was already sending `Content-Type: application/pdf` with no
  `Content-Disposition`. Drawing the pages ourselves is the only approach that
  guarantees the document renders.
- **pdf.js must never be imported on the server.** `pdfjs-dist` touches
  `DOMMatrix` at import time, so SSR fails with `ReferenceError: DOMMatrix is
  not defined`. `resume-pages.tsx` is reached only through a `lazy()` boundary
  that is additionally gated on a `mounted` flag, so the module is never even
  imported during SSR. Importing it directly from `resume-viewer.tsx` — or from
  the page — brings back a 500.
- The pdf.js worker is resolved with
  `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` so it tracks
  the installed `pdfjs-dist` version. Turbopack emits it to
  `.next/static/media/`. It is deliberately **not** copied into `public/`, which
  would silently go stale on upgrade.
- **Pages stretch to the full width of the content area.** The container is
  measured with a `ResizeObserver` and pages re-render at that exact width on
  sidebar collapse and window resize. The page is **full bleed**: no gutters, no
  gap between pages, no border, shadow or rounding — `<main>` carries no padding
  and this route adds none, so the document occupies the entire area right up to
  the sidebar and header.
- **`disableStream` and `disableRange` are set** on the `<Document>` options.
  pdf.js otherwise fetches via HTTP range requests, which is exactly the traffic
  a download-manager extension hooks, and a 4 MB file gains nothing from partial
  fetching. The options object is defined at module scope — react-pdf reloads
  the document if it changes identity between renders.
- The viewer fills the content area: the page wrapper is `h-full` and `<main>`
  has a definite height, so the **viewer owns the only scrollbar** and the
  sidebar and header stay fixed.
- Loading renders the app-wide `LoadingState` (a centred spinner); failures
  render `ErrorState`. Neither is local to this route. There is no download
  link — rendering, not downloading, is the point of this page.
- The PDF is **3.97 MB** and is fetched on every visit.

## Gotcha: never run a production build while `bun dev` is running

`next build` and the dev server share `apps/dashboard/.next`, and a build run
during a dev session leaves both trees in place. The dev HTML then references
chunks that may not match what is served, and this page fails with "The resume
could not be displayed" while every server-side check still passes. Fix:
stop the dev server, `rm -rf apps/dashboard/.next`, restart.

## Security note

`public/` is served to anyone who knows the URL and this app has no auth, so
`/resume.pdf` is world-readable and the file is in git history. That was a
deliberate, confirmed choice ([../plans/004-resume-page.md](../plans/004-resume-page.md)).
Putting it behind a session check means a route handler that streams the file,
not a `public/` asset.

## Reusable pieces

- The three-file split — container + lazy boundary, browser-only renderer,
  shared message — is the pattern for **any** library that cannot be imported on
  the server. Copy the shape rather than reaching for `next/dynamic` ad hoc.

## Linked routes

- [`/`](root.md) — the dashboard. Both live in the `(app)` group and share the
  shell; the sidebar's active state distinguishes them.
