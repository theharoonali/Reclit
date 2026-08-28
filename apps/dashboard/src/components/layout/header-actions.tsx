"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Lets a page put controls in the global header without the header importing a
 * feature component, and without every page re-rendering the shell.
 *
 * `AppShell` mounts one `HeaderActionsOutlet` inside `AppHeader`; a page
 * renders `<HeaderActions>` anywhere in its tree and the children are portalled
 * into that outlet. The button therefore stays owned by the component that
 * holds its state — the DOM is all that moves.
 */
const OutletContext = createContext<HTMLElement | null>(null);

const SetOutletContext = createContext<
  ((node: HTMLElement | null) => void) | null
>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [outlet, setOutlet] = useState<HTMLElement | null>(null);
  return (
    <SetOutletContext.Provider value={setOutlet}>
      <OutletContext.Provider value={outlet}>{children}</OutletContext.Provider>
    </SetOutletContext.Provider>
  );
}

/** The header's landing area. Rendered once, by the shell. */
export function HeaderActionsOutlet() {
  const setOutlet = useContext(SetOutletContext);
  return (
    <div
      className="flex items-center gap-2"
      ref={(node) => {
        setOutlet?.(node);
        return () => setOutlet?.(null);
      }}
    />
  );
}

/**
 * Renders its children into the header. Nothing on the first client render —
 * the outlet ref is set during commit, so the portal target only exists from
 * the effect pass onwards.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const outlet = useContext(OutletContext);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !outlet) return null;
  return createPortal(children, outlet);
}
