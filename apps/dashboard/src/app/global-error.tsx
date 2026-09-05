"use client";

import "@/styles/globals.css";
import { ErrorFallback } from "@/components/common/error-fallback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <div className="min-h-screen flex items-center justify-center">
          <ErrorFallback digest={error.digest} onRetry={reset} />
        </div>
      </body>
    </html>
  );
}
