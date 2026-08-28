import { CHECKBOX_INNER_INSET, type Rect } from "./geometry";
import { withAlpha } from "./theme-colors";
import type { SheetPalette } from "./types";

export type CheckboxPaintState = "none" | "some" | "all";

/**
 * The selection checkbox, drawn the same way in the gutter and the header
 * corner: a square outline, and — when checked — a mini primary-coloured box
 * inside it rather than a check glyph. "some" is the header's partial state:
 * the same mini box at reduced alpha.
 *
 * `rect` is in whatever space the caller's context is currently in; this
 * paints and nothing else.
 */
export function paintCheckbox(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  state: CheckboxPaintState,
  palette: SheetPalette,
  dpr: number,
) {
  const lineW = Math.max(1, Math.round(1.25 * dpr)) / dpr;
  // Unchecked stays quiet — a full-strength outline reads bolder than the
  // row numbers it sits beside.
  ctx.strokeStyle =
    state === "none" ? withAlpha(palette.mutedText, 0.45) : palette.ring;
  ctx.lineWidth = lineW;
  ctx.strokeRect(
    rect.x + lineW / 2,
    rect.y + lineW / 2,
    rect.w - lineW,
    rect.h - lineW,
  );

  if (state === "none") return;
  ctx.fillStyle =
    state === "all" ? palette.ring : withAlpha(palette.ring, 0.45);
  ctx.fillRect(
    rect.x + CHECKBOX_INNER_INSET,
    rect.y + CHECKBOX_INNER_INSET,
    rect.w - CHECKBOX_INNER_INSET * 2,
    rect.h - CHECKBOX_INNER_INSET * 2,
  );
}
