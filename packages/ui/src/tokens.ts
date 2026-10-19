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
  /** The app's black: a neutral near-black, light-mode text and dark-mode page surface. */
  foreground: "0 0% 11%",
  card: "0 0% 97%",
  "card-foreground": "0 0% 11%",
  popover: "0 0% 97%",
  "popover-foreground": "0 0% 11%",
  /** The orange accent — a separate decision from the black. */
  primary: "20 90% 55%",
  "primary-foreground": "0 0% 100%",
  secondary: "0 0% 91%",
  "secondary-foreground": "0 0% 11%",
  muted: "0 0% 91%",
  "muted-foreground": "0 0% 42%",
  accent: "0 0% 94%",
  "accent-foreground": "0 0% 11%",
  destructive: "0 84.2% 60.2%",
  "destructive-foreground": "0 0% 98%",
  success: "142 70% 38%",
  warning: "45 90% 42%",
  border: "0 0% 87%",
  input: "0 0% 87%",
  ring: "20 90% 55%",
  /** The dialog scrim; its alpha is `opacity.overlay`. */
  overlay: "0 0% 0%",
  /**
   * Data-visualisation series, in order. Charts and dashboard widgets name
   * these (`chart-1` … `chart-5`) instead of colours; `chart-5` is the quiet
   * neutral for a comparison series (a target, a baseline).
   */
  "chart-1": "225 90% 62%",
  "chart-2": "218 92% 78%",
  "chart-3": "230 55% 42%",
  "chart-4": "262 70% 66%",
  "chart-5": "0 0% 84%",
};

export type ColorToken = keyof typeof light;

const dark: Record<ColorToken, string> = {
  background: "0 0% 11%",
  foreground: "0 0% 98%",
  card: "0 0% 15%",
  "card-foreground": "0 0% 98%",
  popover: "0 0% 15%",
  "popover-foreground": "0 0% 98%",
  primary: "20 90% 58%",
  "primary-foreground": "0 0% 100%",
  secondary: "0 0% 18%",
  "secondary-foreground": "0 0% 98%",
  muted: "0 0% 18%",
  "muted-foreground": "0 0% 64%",
  accent: "0 0% 18%",
  "accent-foreground": "0 0% 98%",
  destructive: "359 100% 61%",
  "destructive-foreground": "0 0% 100%",
  success: "142 60% 45%",
  warning: "45 85% 52%",
  border: "0 0% 22%",
  input: "0 0% 26%",
  ring: "20 90% 58%",
  overlay: "0 0% 0%",
  "chart-1": "225 90% 66%",
  "chart-2": "218 80% 72%",
  "chart-3": "230 60% 56%",
  "chart-4": "262 70% 70%",
  "chart-5": "0 0% 40%",
};

export const colors = { light, dark };

/**
 * The one corner: 3px (`rounded-sm` derives from it, `--radius - 4px`) and is the
 * only corner step the app defines; `rounded-full` is for pills.
 */
export const radius = "0.4375rem";

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
    { lineHeight: "1.75rem", letterSpacing: "-0.03em", fontWeight: "600" },
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
  /** The switch: its track (width, height) and thumb; the thumb travels its own width. */
  switch: "2.25rem",
  "switch-track": "1.25rem",
  "switch-thumb": "1rem",
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

  // The assistant island — at rest the orb and the "Reclit AI" label (or
  // those plus the page's action pill); the open field; a run's stage or a
  // confirmation. Rest widths are fixed lengths so the capsule can animate.
  "island-closed": "9.5rem",
  "island-action": "19rem",
  island: "24rem",
  "island-wide": "30rem",
  orb: "1.75rem",
  /** The onboarding's AI canvas: beside the checklist, and alone on the first screen. */
  "orb-md": "3.5rem",
  "orb-lg": "10rem",

  // Dashboard widgets — the body height of a chart card (`height` in the
  // dashboard JSON: sm | md | lg).
  "chart-sm": "10rem",
  "chart-md": "16rem",
  "chart-lg": "20rem",
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
