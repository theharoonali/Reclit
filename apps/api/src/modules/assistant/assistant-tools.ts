import {
  BUCKETS,
  FILTER_OPS,
  GRID_COLUMNS,
  MAX_GROUP_LIMIT,
  MAX_SERIES,
  type WidgetType,
} from "@reclit/dashboard-engine";
import { z } from "zod";
import {
  widgetHeightWire,
  widgetSeriesSpecSchema,
  widgetSplitBySchema,
  widgetTypeWire,
} from "../dashboard/dashboard.schema";
import {
  columnTypeWire,
  nodeTypeWire,
} from "../spreadsheet/spreadsheet.schema";
import {
  ASSISTANT_DASHBOARD_TOOLS,
  ASSISTANT_SPREADSHEET_TOOLS,
  type AssistantScopeWire,
  type AssistantToolName,
} from "./assistant.schema";

// Pure: what the model may call, per scope — a description and a zod input
// schema per tool — plus the summary of a call's input that is stored on the
// run and streamed to the capsule. No service, no SDK: the contract test
// covers this file without an API key. Shapes stay flat (unions of
// primitives only, no nested unions): Gemini's function declarations reject
// anything richer, and the executor maps them onto the services' inputs.

export const MAX_READ_ROWS = 50;
export const MAX_SET_CELLS = 500;
export const MAX_APPEND_ROWS = 100;
export const MAX_REMOVE_ROWS = 1000;

const columnName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("A column, by its name as shown in the sheet (case-insensitive)");

/** A cell value the model may write; `null` clears the cell. A json column takes a JSON string. */
const cellScalar = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type ToolCellScalar = z.infer<typeof cellScalar>;

const filterScalar = z.union([
  z.string().max(1000),
  z.number().finite(),
  z.boolean(),
]);

/** A row rule — the engine's filter, flattened: `in` takes `values`, every other operator `value`. */
export const toolRowFilterSchema = z.object({
  column: columnName,
  op: z.enum(FILTER_OPS),
  value: filterScalar
    .optional()
    .describe("The value to compare with; omit for isEmpty, notEmpty and in"),
  values: z
    .array(z.union([z.string().max(1000), z.number().finite()]))
    .max(100)
    .optional()
    .describe("The list of values for `in`"),
});
export type ToolRowFilter = z.infer<typeof toolRowFilterSchema>;

const formula = z.string().trim().min(1).max(1000);
const label = z.string().trim().max(200);

/** The engine's WidgetQuery with the nullable `groupBy` flattened to optional. */
export const toolWidgetQuerySchema = z.object({
  filters: z.array(toolRowFilterSchema).max(20).optional(),
  groupBy: z
    .object({ column: columnName, bucket: z.enum(BUCKETS).optional() })
    .optional()
    .describe("The x-axis / slices / groups; omit for stat and plain tables"),
  splitBy: widgetSplitBySchema.optional(),
  series: z.array(widgetSeriesSpecSchema).min(1).max(MAX_SERIES),
  sort: z
    .object({
      by: z.string().min(1).max(50),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  limit: z.number().int().min(1).max(MAX_GROUP_LIMIT).optional(),
  compare: z.object({ formula, label }).optional(),
  footer: z.string().trim().max(200).optional(),
});
export type ToolWidgetQuery = z.infer<typeof toolWidgetQuerySchema>;

const widgetFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable(),
  type: widgetTypeWire,
  variant: z.string().trim().min(1).max(50),
  height: widgetHeightWire,
  column: z
    .number()
    .int()
    .min(1)
    .max(GRID_COLUMNS)
    .describe("The width in grid columns, of 12"),
  row: z.number().int().min(0).max(100),
  sort: z.number().int().min(0).max(100),
  query: toolWidgetQuerySchema,
};

const gridIndex = z.number().int().min(0);
const prompt = z.string().trim().min(1).max(10_000).nullable();

export type AssistantToolSpec = {
  description: string;
  inputSchema: z.ZodType;
};

export const ASSISTANT_TOOLS = {
  readRows: {
    description:
      "Reads a page of stored rows with every cell, to look at the data before deciding. Rows are sparse: indexes may have gaps.",
    inputSchema: z.object({
      startRow: gridIndex.default(0),
      limit: z.number().int().min(1).max(MAX_READ_ROWS).default(20),
    }),
  },
  getColumnSummary: {
    description:
      "Describes one column across every stored row: how many are filled, the most common values, and min/max/sum/average for numbers or dates.",
    inputSchema: z.object({ column: columnName }),
  },
  createColumn: {
    description:
      "Adds a column at the end. A node (ai, google_search) needs a prompt; email has no executor.",
    inputSchema: z.object({
      name: z.string().trim().min(1).max(200),
      type: columnTypeWire.default("string"),
      node: nodeTypeWire.nullable().optional(),
      prompt: prompt.optional(),
    }),
  },
  updateColumn: {
    description:
      "Renames or reconfigures a column: name, type, node, prompt. Changing the type does not convert stored values. Omit what should not change; null clears node or prompt.",
    inputSchema: z.object({
      column: columnName,
      name: z.string().trim().min(1).max(200).optional(),
      type: columnTypeWire.optional(),
      node: nodeTypeWire.nullable().optional(),
      prompt: prompt.optional(),
    }),
  },
  reorderColumn: {
    description: "Moves a column to a display position (0 = first).",
    inputSchema: z.object({ column: columnName, position: gridIndex }),
  },
  setCells: {
    description: `Writes values into one column for specific rows (at most ${MAX_SET_CELLS} per call). Use readRows first to know the row indexes.`,
    inputSchema: z.object({
      column: columnName,
      cells: z
        .array(z.object({ rowIndex: gridIndex, value: cellScalar }))
        .min(1)
        .max(MAX_SET_CELLS),
    }),
  },
  fillColumn: {
    description:
      "Writes one value into a column for every stored row that matches a rule (every stored row when the rule is omitted). The right tool for 'set X where Y'.",
    inputSchema: z.object({
      column: columnName,
      value: cellScalar,
      where: toolRowFilterSchema.optional(),
    }),
  },
  appendRows: {
    description: `Adds new rows after the last stored one (at most ${MAX_APPEND_ROWS} per call). Each row lists its cells by column name.`,
    inputSchema: z.object({
      rows: z
        .array(
          z.object({
            cells: z
              .array(z.object({ column: columnName, value: cellScalar }))
              .min(1),
          }),
        )
        .min(1)
        .max(MAX_APPEND_ROWS),
    }),
  },
  removeColumn: {
    description:
      "Deletes a column and every value in it. The user is asked to confirm before anything is deleted.",
    inputSchema: z.object({ column: columnName }),
  },
  removeRows: {
    description: `Deletes rows by index or by rule (at most ${MAX_REMOVE_ROWS} per call). The user is asked to confirm before anything is deleted.`,
    inputSchema: z
      .object({
        rowIndexes: z.array(gridIndex).min(1).max(MAX_REMOVE_ROWS).optional(),
        where: toolRowFilterSchema.optional(),
      })
      .refine((input) => input.rowIndexes !== undefined || input.where, {
        message: "Give rowIndexes or a where rule",
      }),
  },
  createWidget: {
    description:
      "Adds a card to the dashboard. Omit row/column/sort to place it on a new bottom row with a width that fits its type. The query is validated against the sheet; an error names what to fix.",
    inputSchema: z.object({
      name: widgetFields.name,
      description: widgetFields.description.optional(),
      type: widgetFields.type,
      variant: widgetFields.variant.optional(),
      height: widgetFields.height.optional(),
      column: widgetFields.column.optional(),
      row: widgetFields.row.optional(),
      sort: widgetFields.sort.optional(),
      query: widgetFields.query,
    }),
  },
  updateWidget: {
    description:
      "Changes a card by id: name, description, type, variant, height, placement or query. Omit what should not change.",
    inputSchema: z.object({
      id: z.string().min(1),
      name: widgetFields.name.optional(),
      description: widgetFields.description.optional(),
      type: widgetFields.type.optional(),
      variant: widgetFields.variant.optional(),
      height: widgetFields.height.optional(),
      column: widgetFields.column.optional(),
      row: widgetFields.row.optional(),
      sort: widgetFields.sort.optional(),
      query: widgetFields.query.optional(),
    }),
  },
  updateDashboard: {
    description:
      "Sets the dashboard's title and subtitle. null restores the default; omit what should not change.",
    inputSchema: z.object({
      title: z.string().trim().min(1).max(200).nullable().optional(),
      description: z.string().trim().min(1).max(1000).nullable().optional(),
    }),
  },
  removeWidget: {
    description:
      "Deletes a card by id. The user is asked to confirm before anything is deleted.",
    inputSchema: z.object({ id: z.string().min(1) }),
  },
} satisfies Record<AssistantToolName, AssistantToolSpec>;

/** A tool's parsed input, as its handler receives it. */
export type ToolInput<N extends AssistantToolName> = z.infer<
  (typeof ASSISTANT_TOOLS)[N]["inputSchema"]
>;

/** The tools of one scope, in the order the model is shown them. */
export function toolsForScope(
  scope: AssistantScopeWire,
): Record<string, AssistantToolSpec> {
  const names: readonly AssistantToolName[] =
    scope === "dashboard"
      ? ASSISTANT_DASHBOARD_TOOLS
      : ASSISTANT_SPREADSHEET_TOOLS;
  return Object.fromEntries(names.map((name) => [name, ASSISTANT_TOOLS[name]]));
}

/** The grid width a card gets when the model leaves placement to us. */
export function defaultWidgetSpan(type: WidgetType): number {
  switch (type) {
    case "stat":
      return 3;
    case "table":
      return GRID_COLUMNS;
    default:
      return 6;
  }
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * What the run stores and streams about a call: identifiers and counts, never
 * the cell lists — a `setCells` input can be megabytes and every SSE event
 * ships the whole run. `extra` carries what only the executor knows (a
 * delete's affected count). The client formats these as labels.
 */
export function summariseStepInput(
  tool: AssistantToolName,
  input: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const base = ((): Record<string, unknown> => {
    switch (tool) {
      case "readRows":
        return { startRow: raw.startRow ?? 0, limit: raw.limit ?? 20 };
      case "getColumnSummary":
      case "removeColumn":
        return { column: str(raw.column) };
      case "createColumn":
        return { name: str(raw.name), type: raw.type ?? "string" };
      case "updateColumn":
        return { column: str(raw.column), name: str(raw.name), type: raw.type };
      case "reorderColumn":
        return { column: str(raw.column), position: raw.position };
      case "setCells":
        return {
          column: str(raw.column),
          count: Array.isArray(raw.cells) ? raw.cells.length : 0,
        };
      case "fillColumn":
        return { column: str(raw.column), value: raw.value, where: raw.where };
      case "appendRows":
        return { count: Array.isArray(raw.rows) ? raw.rows.length : 0 };
      case "removeRows":
        return {
          count: Array.isArray(raw.rowIndexes) ? raw.rowIndexes.length : 0,
          where: raw.where,
        };
      case "createWidget":
      case "updateWidget":
      case "removeWidget":
        return { id: str(raw.id), name: str(raw.name), type: raw.type };
      case "updateDashboard":
        return { title: raw.title, description: raw.description };
    }
  })();
  const summary: Record<string, unknown> = { ...base, ...extra };
  for (const key of Object.keys(summary)) {
    if (summary[key] === undefined) delete summary[key];
  }
  return summary;
}
