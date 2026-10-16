"use client";

import { useEffect, useRef } from "react";
import {
  type PageAction,
  useAssistant,
} from "@/components/assistant/assistant-provider";

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
 * Publishes the sheet's Run as the capsule's right-hand pill while the
 * selection holds runnable AI cells (`action`), withdraws it when it does
 * not (`null`) and when the grid unmounts. Compared field by field, so a
 * grid re-render with the same action publishes nothing — the provider
 * re-renders the grid on every run event, and a fresh object each time
 * would loop.
 */
export function useAssistantRunAction(action: PageAction | null): void {
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
