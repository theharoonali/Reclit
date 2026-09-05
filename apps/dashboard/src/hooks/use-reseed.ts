"use client";

import { useState } from "react";

/**
 * Re-seeds a component's draft state when the prop it was seeded from changes
 * underneath it while mounted.
 *
 * The sheet's side-panel editors stay mounted (the panel animates out and its
 * key is the cell), so reopening the same cell does not remount them. If the
 * cell was cleared or retyped in the grid between openings, the draft must
 * follow: this compares `seed` with the last value it saw and calls `onReseed`
 * during render — the same-component setState React allows there.
 *
 * Returns `markSeed`. Call it with the value the editor is about to report
 * upward, so the parent's echo of that value does not re-seed the draft.
 */
export function useReseed<T>(seed: T, onReseed: (seed: T) => void) {
  const [last, setLast] = useState(seed);
  if (last !== seed) {
    setLast(seed);
    onReseed(seed);
  }
  return setLast;
}
