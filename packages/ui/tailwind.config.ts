import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  safelist: ["dark", "light"],
  theme: {
    extend: {
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      // The type scale. Components use these semantic sizes — `text-title`,
      // `text-subtitle` — never a raw step like `text-2xl`, so resizing the
      // app's headings is one edit here. Each entry carries its own
      // line-height, tracking and weight.
      fontSize: {
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
          {
            lineHeight: "1.75rem",
            letterSpacing: "-0.01em",
            fontWeight: "600",
          },
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
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      // The app's one motion setting. Panels, drawers and the sidebar all
      // share it so nothing slides at its own private speed.
      transitionDuration: {
        smooth: "300ms",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      // One corner for the whole app: every element — div, card, button,
      // input, select, popover, dialog — uses `rounded-sm`, which derives
      // from `--radius` in `globals.css`, so one edit there reshapes
      // everything. The other steps are deliberately not defined; besides
      // `rounded-sm`, only `rounded-full` (pills, progress tracks) and
      // `rounded-none` are allowed.
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
} satisfies Config;
