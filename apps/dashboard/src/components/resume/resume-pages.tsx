"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// pdf.js parses in a worker. Resolved through the bundler rather than copied
// into a served directory, so it can never drift from the installed pdfjs-dist.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** No `.pdf` extension: see the route handler for why that matters. */
const RESUME_URL = "/resume-document";

// One plain GET, no HTTP range requests — partial fetching gains nothing for a
// single document and is extra surface for an extension to hook. Defined at
// module scope: react-pdf reloads the document if this changes identity.
const PDF_OPTIONS = { disableStream: true, disableRange: true };

/**
 * The pdf.js half of the viewer. This module touches browser-only globals
 * (`DOMMatrix`) at import time, so it must never be imported during SSR — it is
 * reached only through the lazy boundary in `resume-viewer.tsx`.
 *
 * The bytes are fetched here and handed to pdf.js as an ArrayBuffer rather than
 * letting it fetch a URL itself, so the response's content type never has to be
 * `application/pdf` and nothing in the request looks like a file download.
 */
export function ResumePages({ width }: { width: number }) {
  const t = useTranslations("resume");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch(RESUME_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) setBytes(new Uint8Array(buffer));
      })
      .catch((error) => {
        console.error("Resume could not be fetched", error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // pdf.js detaches the buffer it is given, so the object identity must stay
  // stable across renders or the document reloads on every paint.
  const file = useMemo(() => (bytes ? { data: bytes } : null), [bytes]);

  if (failed) return <ErrorState message={t("error")} />;
  if (!file) return <LoadingState label={t("loading")} />;

  return (
    <>
      {/* The loader is rendered as a sibling of <Document>, never through its
          `loading` prop. Inside <Document> it would be a child of an
          auto-height flex column, where `h-full` resolves to the content
          height and the spinner collapses to the top of the page instead of
          staying centred. Owning all three states here keeps it put. */}
      {pageCount === 0 && <LoadingState label={t("loading")} />}
      <Document
        file={file}
        options={PDF_OPTIONS}
        onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        onLoadError={(error) => {
          console.error("Resume failed to parse", error);
          setFailed(true);
        }}
        loading=""
        error=""
        noData=""
        className="flex flex-col"
      >
        {Array.from({ length: pageCount }, (_, index) => (
          <Page
            // Pages have no identity beyond their position in the document.
            key={`page-${index + 1}`}
            pageNumber={index + 1}
            width={width}
            loading=""
          />
        ))}
      </Document>
    </>
  );
}
