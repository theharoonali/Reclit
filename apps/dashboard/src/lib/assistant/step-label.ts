/** A step or pending action as the labels need it; `tool` is any string so a newer server tool still formats. */
export type LabelledStep = { tool: string; input: Record<string, unknown> };

/**
 * Turns a step the server reported into the message to show for it. The
 * server emits identifiers — the tool name and a summarised input — and the
 * client owns the words, so every label is a key under the `assistant`
 * namespace plus the ICU values its message interpolates:
 *
 *   const t = useTranslations("assistant");
 *   t(label.key, label.values)
 *
 * The tool list is closed (the plan's "Tools"); a tool this file does not
 * know falls back to `steps.generic` with the raw tool name, so a new
 * server-side tool degrades to a readable line instead of a missing key.
 */

export type StepLabel = {
  key: string;
  values: Record<string, string | number>;
};

type ValueKind = "string" | "number";

/**
 * Which summarised-input fields each tool's message interpolates, and what
 * they are. Mirrors the plan's "Summarised step inputs"; every value named
 * here must appear in the tool's message in `en.json`.
 */
const TOOL_VALUES: Record<string, Record<string, ValueKind>> = {
  readRows: {},
  getColumnSummary: { column: "string" },
  createColumn: { name: "string", type: "string" },
  updateColumn: { column: "string" },
  reorderColumn: { column: "string", position: "number" },
  setCells: { column: "string", count: "number" },
  fillColumn: { column: "string" },
  appendRows: { count: "number" },
  removeColumn: { column: "string", count: "number" },
  removeRows: { count: "number" },
  createWidget: { name: "string" },
  updateWidget: { name: "string" },
  removeWidget: { name: "string" },
  updateDashboard: {},
};

/**
 * Picks the named fields out of a summarised input, coerced to what the ICU
 * message expects: a string is passed through, a number is passed through,
 * anything else (missing, the wrong type) becomes an empty string or zero so
 * the message still formats — a plural over `undefined` would throw.
 */
function pickValues(
  input: Record<string, unknown>,
  spec: Record<string, ValueKind>,
): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const [name, kind] of Object.entries(spec)) {
    const raw = input[name];
    if (kind === "number") {
      values[name] = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    } else {
      values[name] =
        typeof raw === "string" ? raw : typeof raw === "number" ? raw : "";
    }
  }
  return values;
}

/** The label for a step's "Working: …" line. */
export function stepLabel(step: LabelledStep): StepLabel {
  const spec = TOOL_VALUES[step.tool];
  if (!spec) return { key: "steps.generic", values: { tool: step.tool } };
  return { key: `steps.${step.tool}`, values: pickValues(step.input, spec) };
}

/** The question for a destructive step waiting on Delete / Keep. */
export function confirmLabel(action: LabelledStep): StepLabel {
  const spec = TOOL_VALUES[action.tool] ?? {};
  return {
    key: `confirm.${action.tool}`,
    values: pickValues(action.input, spec),
  };
}
