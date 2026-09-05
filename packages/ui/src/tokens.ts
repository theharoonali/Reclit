/**
 * The design tokens — the one file where the app's look is edited.
 *
 * Everything below feeds the rest of the system automatically:
 *
 * - `tailwind.config.ts` turns `colors` into CSS variables on `:root`/`.dark`
 *   and into the semantic colour classes (`bg-primary`, `text-muted-foreground`),
 *   `sizes` into named length steps (`h-control`, `w-sidebar`), `fontSize`
 *   into the type scale (`text-title`, `text-body`), and `motion` into
 *   `duration-smooth`/`ease-smooth`.
 * - `utils/cn.ts` teaches tailwind-merge every name here, so overrides dedupe.
 * - The dashboard's canvas sheet reads `colors.light` and `SHEET_HEADER_PX`
 *   through `@reclit/ui/tokens`, so even the painted grid follows this file.
 *
 * Rules that keep it working:
 *
 * - Colours are **space-separated HSL triples** (`20 90% 55%`) so
 *   `hsl(var(--x) / 0.5)` and Tailwind's `/alpha` modifiers are valid on all
 *   of them. The comma form fails silently under an alpha modifier.
 * - `dark` must define every key `light` does — the type enforces it.
 * - Sizes are CSS lengths. Adding one here is the whole job: no other file
 *   needs to learn the name.
 * - No React, no DOM: the Tailwind preset loads this at build time.
 */

const light = {
  background: "0 0% 100%",
  /** The app's black, `#1B1D20`: light-mode text, dark-mode page surface. */
  foreground: "216 8.5% 11.6%",
  card: "45 18% 96%",
  "card-foreground": "216 8.5% 11.6%",
  popover: "45 18% 96%",
  "popover-foreground": "216 8.5% 11.6%",
  /** The orange accent — a separate decision from the black. */
  primary: "20 90% 55%",
  "primary-foreground": "0 0% 100%",
  secondary: "40 11% 89%",
  "secondary-foreground": "216 8.5% 11.6%",
  muted: "40 11% 89%",
  "muted-foreground": "0 0% 38%",
  accent: "40 10% 94%",
  "accent-foreground": "216 8.5% 11.6%",
  destructive: "0 84.2% 60.2%",
  "destructive-foreground": "0 0% 98%",
  success: "142 70% 38%",
  warning: "45 90% 42%",
  border: "45 5% 85%",
  input: "45 5% 85%",
  ring: "20 90% 55%",
  /** The dialog scrim; its alpha is `opacity.overlay`. */
  overlay: "0 0% 0%",
};

export type ColorToken = keyof typeof light;

const dark: Record<ColorToken, string> = {
  background: "216 8.5% 11.6%",
  foreground: "0 0% 98%",
  card: "216 8.5% 15%",
  "card-foreground": "0 0% 98%",
  popover: "216 8.5% 15%",
  "popover-foreground": "0 0% 98%",
  primary: "20 90% 58%",
  "primary-foreground": "0 0% 100%",
  secondary: "216 8% 18%",
  "secondary-foreground": "0 0% 98%",
  muted: "216 8% 18%",
  "muted-foreground": "216 6% 64%",
  accent: "216 8% 18%",
  "accent-foreground": "0 0% 98%",
  destructive: "359 100% 61%",
  "destructive-foreground": "0 0% 100%",
  success: "142 60% 45%",
  warning: "45 85% 52%",
  border: "216 7% 22%",
  input: "216 7% 26%",
  ring: "20 90% 58%",
  overlay: "0 0% 0%",
};

export const colors = { light, dark };

/**
 * The one corner. `rounded-sm` derives from it (`--radius - 4px`) and is the
 * only corner step the app defines; `rounded-full` is for pills.
 */
export const radius = "0.625rem";

/**
 * The type scale. Each step carries its own line-height, tracking and weight,
 * so a component writes `text-title` and never pairs it with `font-*`,
 * `leading-*` or `tracking-*`.
 */
export const fontSize = {
  display: [
    "2rem",
    { lineHeight: "2.5rem", letterSpacing: "-0.02em", fontWeight: "600" },
  ],
  title: [
    "1.5rem",
    { lineHeight: "2rem", letterSpacing: "-0.02em", fontWeight: "600" },
  ],
  heading: [
    "1.125rem",
    { lineHeight: "1.75rem", letterSpacing: "-0.01em", fontWeight: "600" },
  ],
  subheading: ["1rem", { lineHeight: "1.5rem", fontWeight: "500" }],
  subtitle: ["0.875rem", { lineHeight: "1.375rem", fontWeight: "400" }],
  body: ["0.875rem", { lineHeight: "1.375rem", fontWeight: "400" }],
  label: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500" }],
  caption: ["0.75rem", { lineHeight: "1rem", fontWeight: "400" }],
  eyebrow: [
    "0.75rem",
    { lineHeight: "1rem", letterSpacing: "0.08em", fontWeight: "500" },
  ],
} satisfies Record<
  string,
  [string, { lineHeight: string; letterSpacing?: string; fontWeight: string }]
>;

/**
 * The canvas sheet's header strip, in CSS px. The DOM strip (`h-sheet-header`)
 * and the canvas geometry (`HEADER_HEIGHT`) both read this, so they cannot
 * drift apart.
 */
export const SHEET_HEADER_PX = 36;

/**
 * Every named length. Tailwind exposes each as a spacing step, so one key
 * here works after any length prefix (height, width, size, padding, gap,
 * min-width…). Use the semantic one for the job.
 *
 * Not tokenised on purpose: the spinner's stroke (`border-2`/`border-4`) —
 * tailwind-merge reads a named `border-*` as a colour and would drop the
 * spinner's `border-muted`.
 */
export const sizes = {
  // Controls — Button, SelectTrigger, Input, CapsuleSelect, Calendar buttons.
  "control-xs": "1.75rem",
  "control-sm": "2rem",
  control: "2.25rem",
  "control-lg": "2.5rem",
  "control-x-sm": "0.75rem",
  "control-x": "1rem",
  "control-x-lg": "2rem",
  "control-y": "0.5rem",
  /** Between an icon and its label inside a control. */
  inline: "0.5rem",
  /** Any icon inside a control or menu item. */
  icon: "1rem",

  // Fields — Input, Textarea, SelectTrigger.
  "field-x": "0.75rem",
  "field-y": "0.25rem",
  "field-y-multi": "0.5rem",
  "field-multi": "5rem",

  // Small primitives.
  checkbox: "1rem",
  "checkbox-mark": "0.75rem",
  avatar: "2.5rem",
  "avatar-sm": "2rem",
  progress: "0.5rem",
  "spinner-sm": "1rem",
  spinner: "1.5rem",
  "spinner-lg": "2.5rem",
  /** Minimum width of a Select or DropdownMenu surface. */
  menu: "8rem",

  // Layout — the dashboard chrome.
  header: "4rem",
  sidebar: "14rem",
  "sidebar-rail": "4rem",
  panel: "20rem",
  "sheet-header": `${SHEET_HEADER_PX}px`,
};

export const opacity = {
  /** The dialog scrim's alpha — `bg-overlay/overlay`. */
  overlay: "0.5",
};

/** The app's one motion setting; panels, drawers and the sidebar share it. */
export const motion = {
  duration: "300ms",
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
};
