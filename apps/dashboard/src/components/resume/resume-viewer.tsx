"use client";

import { useTranslations } from "next-intl";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/common/loading-state";

// pdf.js reads browser-only globals at import time, so the module is behind a
// lazy boundary and the `mounted` gate below keeps it from ever being rendered
// — and therefore ever imported — on the server.
const ResumePages = lazy(() =>
  import("./resume-pages").then((module) => ({ default: module.ResumePages })),
);

/**
 * Renders the resume by drawing each page to a canvas with pdf.js.
 *
 * Deliberately *not* an `<iframe>`: delegating to the browser's PDF viewer means
 * a browser configured to download PDFs rather than open them downloads the file
 * instead of showing it, and no response header can override that. Drawing the
 * pages ourselves is the only way to guarantee the document renders.
 */
export function ResumeViewer() {
  const t = useTranslations("resume");
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Pages are rasterised at an explicit pixel width, so the container is
  // measured and the pages re-render whenever it changes (sidebar collapse,
  // window resize).
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPageWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ready = mounted && pageWidth > 0;

  return (
    <div
      ref={containerRef}
      aria-label={t("viewerLabel")}
      className="h-full overflow-y-auto"
    >
      {ready ? (
        <Suspense fallback={<LoadingState label={t("loading")} />}>
          <ResumePages width={pageWidth} />
        </Suspense>
      ) : (
        <LoadingState label={t("loading")} />
      )}
    </div>
  );
}
