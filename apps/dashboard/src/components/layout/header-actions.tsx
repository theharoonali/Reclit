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
 * Lets a page put content in the global header without the header importing a
 * feature component, and without every page re-rendering the shell.
 *
 * `AppShell` mounts one outlet per slot inside `AppHeader`; a page renders the
 * slot's portal component anywhere in its tree and the children land in that
 * outlet. The control therefore stays owned by the component that holds its
 * state — the DOM is all that moves.
 *
 * Two slots exist: `HeaderActions` (right-aligned controls) and `HeaderTitle`
 * (the left title area). Both share one implementation below.
 */
function createHeaderSlot(outletClassName: string) {
  const OutletContext = createContext<HTMLElement | null>(null);
  const SetOutletContext = createContext<
    ((node: HTMLElement | null) => void) | null
  >(null);

  function Provider({ children }: { children: ReactNode }) {
    const [outlet, setOutlet] = useState<HTMLElement | null>(null);
    return (
      <SetOutletContext.Provider value={setOutlet}>
        <OutletContext.Provider value={outlet}>
          {children}
        </OutletContext.Provider>
      </SetOutletContext.Provider>
    );
  }

  /** The header's landing area. Rendered once, by the shell. */
  function Outlet() {
    const setOutlet = useContext(SetOutletContext);
    return (
      <div
        className={outletClassName}
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
  function Portal({ children }: { children: ReactNode }) {
    const outlet = useContext(OutletContext);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted || !outlet) return null;
    return createPortal(children, outlet);
  }

  return { Provider, Outlet, Portal };
}

const actionsSlot = createHeaderSlot("flex items-center gap-2");
// Matches the header's static `title` slot: hidden below lg, never wraps.
const titleSlot = createHeaderSlot("hidden min-w-0 text-label lg:block");

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  return (
    <actionsSlot.Provider>
      <titleSlot.Provider>{children}</titleSlot.Provider>
    </actionsSlot.Provider>
  );
}

export const HeaderActionsOutlet = actionsSlot.Outlet;
export const HeaderActions = actionsSlot.Portal;
export const HeaderTitleOutlet = titleSlot.Outlet;
export const HeaderTitle = titleSlot.Portal;
