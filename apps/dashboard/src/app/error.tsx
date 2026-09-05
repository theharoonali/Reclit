"use client";

import { ErrorFallback } from "@/components/common/error-fallback";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <ErrorFallback digest={error.digest} onRetry={reset} />
    </div>
  );
}
