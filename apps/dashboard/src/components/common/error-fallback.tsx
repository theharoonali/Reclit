"use client";

import { Button } from "@reclit/ui/button";

/**
 * The body of both error boundaries (`app/error.tsx`, `app/global-error.tsx`).
 *
 * English on purpose, and it imports only `Button`: `global-error.tsx`
 * replaces the root layout, so no intl or query provider is mounted above it,
 * and an error boundary must not depend on context that may itself be what
 * broke (docs/rules/FRONTEND.md, "Internationalisation").
 */
export function ErrorFallback({
  digest,
  onRetry,
}: {
  digest?: string;
  onRetry: () => void;
}) {
  return (
    <div className="max-w-md w-full text-center px-4">
      <h2 className="text-heading mb-4">Something went wrong</h2>

      {digest && (
        <p className="text-caption text-muted-foreground mt-4">
          Error ID: {digest}
        </p>
      )}

      <Button className="mt-6" onClick={() => onRetry()} variant="outline">
        Try again
      </Button>
    </div>
  );
}
