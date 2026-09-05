import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import {
  type ColorToken,
  colors,
  fontSize,
  motion,
  opacity,
  radius,
  sizes,
} from "./src/tokens";

/**
 * The Tailwind preset. It holds no design values of its own — everything is
 * derived from `src/tokens.ts`, so that file is the only place the look is
 * edited. The dashboard consumes this via `presets` in its own config.
 */

const cssVar = (token: string) => `hsl(var(--${token}))`;

/** `{ "--background": "0 0% 100%", … }` for one colour mode. */
const cssVars = (mode: Record<ColorToken, string>) =>
  Object.fromEntries(
    Object.entries(mode).map(([token, value]) => [`--${token}`, value]),
  );

/**
 * `primary` + `primary-foreground` become `{ DEFAULT, foreground }` so the
 * classes read `bg-primary` / `text-primary-foreground`; a token without a
 * foreground pair stays a plain colour.
 */
const themeColors = Object.fromEntries(
  (Object.keys(colors.light) as ColorToken[])
    .filter((token) => !token.endsWith("-foreground"))
    .map((token) => {
      const foreground = `${token}-foreground`;
      return [
        token,
        foreground in colors.light
          ? { DEFAULT: cssVar(token), foreground: cssVar(foreground) }
          : cssVar(token),
      ];
    }),
);

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
      fontSize,
      colors: themeColors,
      // Every named length. `spacing` is the one key Tailwind derives `h-`,
      // `w-`, `size-`, `p*-`, `gap-`, `min-w-` and `min-h-` from.
      spacing: sizes,
      opacity,
      transitionDuration: { smooth: motion.duration },
      transitionTimingFunction: { smooth: motion.easing },
      // One corner for the whole app: every element uses `rounded-sm`, which
      // derives from `--radius`. The other steps are deliberately undefined;
      // besides `rounded-sm`, only `rounded-full` and `rounded-none` are used.
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [
    // The CSS variables every colour class resolves to, emitted from the
    // tokens so `globals.css` never repeats them.
    plugin(({ addBase }) => {
      addBase({
        ":root": { ...cssVars(colors.light), "--radius": radius },
        ".dark": cssVars(colors.dark),
      });
    }),
  ],
} satisfies Config;
