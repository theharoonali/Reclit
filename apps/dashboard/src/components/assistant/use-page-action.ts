"use client";

import { useEffect, useRef } from "react";
import { type PageAction, useAssistant } from "./assistant-provider";

const same = (a: PageAction | null, b: PageAction | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.label === b.label &&
    a.description === b.description &&
    a.busy === b.busy &&
    a.errorMessage === b.errorMessage &&
    a.onRun === b.onRun &&
    a.onDismissError === b.onDismissError);

/**
 * Publishes a page's action as the capsule's right-hand pill — the sheet's
 * Run while its selection holds runnable AI cells, the dashboard's AI
 * Recommendations while it is empty — withdraws it on `null` and when the
 * page unmounts. Compared field by field, so a re-render with the same
 * action publishes nothing: the provider re-renders the page on every run
 * event, and a fresh object each time would loop. `onRun` and
 * `onDismissError` must therefore be stable callbacks.
 */
export function useAssistantPageAction(action: PageAction | null): void {
  const { setPageAction } = useAssistant();
  const published = useRef<PageAction | null>(null);

  useEffect(() => {
    if (same(published.current, action)) return;
    published.current = action;
    setPageAction(action);
  }, [action, setPageAction]);

  useEffect(
    () => () => {
      published.current = null;
      setPageAction(null);
    },
    [setPageAction],
  );
}
