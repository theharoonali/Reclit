"use client";

import { useRef } from "react";

/**
 * A ref that always holds the latest `value`, for callbacks that must stay
 * referentially stable (canvas wiring, debounced flushes) yet call the
 * freshest mutation or handler. Read `ref.current` at call time.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
